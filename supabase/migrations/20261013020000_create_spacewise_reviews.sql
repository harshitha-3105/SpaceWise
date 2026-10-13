-- SpaceWise Reviews. Uses table access protected by RLS for submissions and
-- published reads, plus narrowly scoped RPCs for the private review snapshot
-- and allowlist-protected moderation.

-- Fail before making changes if prerequisites, function compatibility, or
-- object state are unexpected. This migration is not a destructive reset.
DO $preflight$
DECLARE
  v_overview_oid oid;
  v_overview_owner oid;
  v_is_superuser boolean;
  v_has_bypassrls boolean;
  v_overview_returns_jsonb boolean;
BEGIN
  IF pg_catalog.to_regclass('public.spacewise_admin_users') IS NULL
    OR pg_catalog.to_regprocedure('public.spacewise_is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Apply the SpaceWise admin allowlist migration first.';
  END IF;

  v_overview_oid := pg_catalog.to_regprocedure('public.spacewise_admin_overview()');
  IF v_overview_oid IS NULL THEN
    RAISE EXCEPTION 'public.spacewise_admin_overview() is missing.';
  END IF;

  SELECT p.proowner, p.prorettype = 'pg_catalog.jsonb'::regtype
  INTO v_overview_owner, v_overview_returns_jsonb
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = v_overview_oid;

  IF NOT COALESCE(v_overview_returns_jsonb, false) THEN
    RAISE EXCEPTION 'public.spacewise_admin_overview() must return jsonb for CREATE OR REPLACE compatibility.';
  END IF;

  SELECT r.rolsuper, r.rolbypassrls INTO v_is_superuser, v_has_bypassrls
  FROM pg_catalog.pg_roles AS r
  WHERE r.rolname = CURRENT_USER;
  IF NOT COALESCE(v_is_superuser, false)
    AND NOT pg_catalog.pg_has_role(CURRENT_USER, v_overview_owner, 'MEMBER') THEN
    RAISE EXCEPTION 'Run as the overview function owner or a database superuser.';
  END IF;
  IF NOT COALESCE(v_is_superuser, false) AND NOT COALESCE(v_has_bypassrls, false) THEN
    RAISE EXCEPTION 'Run this migration as a database owner role with BYPASSRLS; its SECURITY DEFINER functions rely on that trusted owner.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS owner_role
    WHERE owner_role.oid = v_overview_owner
      AND (owner_role.rolsuper OR owner_role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'The existing admin overview owner must be a trusted BYPASSRLS role for forced-RLS admin reads.';
  END IF;
  IF NOT pg_catalog.has_schema_privilege(CURRENT_USER, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Current role lacks CREATE on schema public.';
  END IF;
  IF NOT pg_catalog.has_table_privilege(CURRENT_USER, 'auth.users', 'REFERENCES') THEN
    RAISE EXCEPTION 'Current role lacks REFERENCES on auth.users.';
  END IF;

  IF pg_catalog.to_regclass('public.reviews') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.spacewise_set_review_updated_at()') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.spacewise_reviews_snapshot()') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.spacewise_admin_set_review_status(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'A Reviews object already exists. Inspect it before applying this migration.';
  END IF;
END;
$preflight$;

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(display_name)) BETWEEN 1 AND 60),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(review_text)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT reviews_one_per_user UNIQUE (user_id)
);

-- CREATE OR REPLACE preserves the existing overview's owner. Give that
-- trusted owner read access to the new table so its admin-only statistics work.
DO $admin_overview_table_access$
DECLARE
  v_overview_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner)::name
  INTO v_overview_owner
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.spacewise_admin_overview()');
  EXECUTE pg_catalog.format('GRANT SELECT ON TABLE public.reviews TO %I', v_overview_owner);
END;
$admin_overview_table_access$;

CREATE INDEX reviews_status_updated_idx ON public.reviews (status, updated_at DESC);

CREATE FUNCTION public.spacewise_set_review_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.spacewise_set_review_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER reviews_set_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.spacewise_set_review_updated_at();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews FORCE ROW LEVEL SECURITY;

-- Browser roles get only the public fields and narrowly scoped write columns.
-- In particular, user_id and status cannot be supplied or changed by clients.
REVOKE ALL PRIVILEGES ON TABLE public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, display_name, rating, review_text, status, created_at, updated_at)
  ON public.reviews TO anon, authenticated;
GRANT INSERT (display_name, rating, review_text),
      UPDATE (display_name, rating, review_text)
  ON public.reviews TO authenticated;

CREATE POLICY reviews_read_published
ON public.reviews FOR SELECT TO anon, authenticated
USING (status = 'published');

CREATE POLICY reviews_read_own
ON public.reviews FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY reviews_read_admin
ON public.reviews FOR SELECT TO authenticated
USING (public.spacewise_is_admin());

CREATE POLICY reviews_insert_own
ON public.reviews FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'published');

CREATE POLICY reviews_update_own
ON public.reviews FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY reviews_admin_update
ON public.reviews FOR UPDATE TO authenticated
USING (public.spacewise_is_admin())
WITH CHECK (public.spacewise_is_admin());

-- One read RPC returns published community reviews and, when signed in, only
-- the caller's own review (including its moderation status). It never returns
-- account IDs or email addresses.
CREATE FUNCTION public.spacewise_reviews_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'averageRating', stats.average_rating,
    'totalPublished', stats.total_published,
    'reviews', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', recent.id,
        'displayName', recent.display_name,
        'rating', recent.rating,
        'reviewText', recent.review_text,
        'status', recent.status,
        'createdAt', recent.created_at,
        'updatedAt', recent.updated_at
      ) ORDER BY recent.created_at DESC)
      FROM (
        SELECT id, display_name, rating, review_text, status, created_at, updated_at
        FROM public.reviews
        WHERE status = 'published'
        ORDER BY created_at DESC
        LIMIT 100
      ) AS recent
    ), '[]'::jsonb),
    'myReview', (
      SELECT pg_catalog.jsonb_build_object(
        'id', own.id,
        'displayName', own.display_name,
        'rating', own.rating,
        'reviewText', own.review_text,
        'status', own.status,
        'createdAt', own.created_at,
        'updatedAt', own.updated_at
      )
      FROM public.reviews AS own
      WHERE auth.uid() IS NOT NULL AND own.user_id = auth.uid()
    )
  ) INTO v_result
  FROM (
    SELECT
      pg_catalog.round(pg_catalog.avg(rating)::numeric, 1) AS average_rating,
      pg_catalog.count(*) AS total_published
    FROM public.reviews
    WHERE status = 'published'
  ) AS stats;

  RETURN v_result;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.spacewise_reviews_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spacewise_reviews_snapshot() TO anon, authenticated;

-- The sole moderation RPC checks the existing database allowlist and permits
-- only the supported status transition. The caller cannot choose an owner.
CREATE FUNCTION public.spacewise_admin_set_review_status(p_review_id uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.spacewise_admin_users AS admin_user
    WHERE admin_user.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Admin access required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('published', 'hidden') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid review status';
  END IF;

  UPDATE public.reviews SET status = p_status WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Review not found';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.spacewise_admin_set_review_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spacewise_admin_set_review_status(uuid, text) TO authenticated;

-- Preserve admin authorization and the existing user, verification, and room
-- plan response fields while adding review statistics and recent reviews.
CREATE OR REPLACE FUNCTION public.spacewise_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_registered_users bigint;
  v_verified_email_users bigint;
  v_pending_email_verification_users bigint;
  v_users jsonb;
  v_room_plans_available boolean := false;
  v_total_room_plans bigint := NULL;
  v_room_plans jsonb := '[]'::jsonb;
  v_reviews_available boolean := false;
  v_reviews_module_available boolean := false;
  v_total_reviews bigint := NULL;
  v_published_reviews bigint := NULL;
  v_hidden_reviews bigint := NULL;
  v_average_published_rating numeric := NULL;
  v_reviews jsonb := '[]'::jsonb;
  v_expected_plan_columns integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.spacewise_admin_users AS admin_user
    WHERE admin_user.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Admin access required';
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (WHERE email_confirmed_at IS NOT NULL),
    pg_catalog.count(*) FILTER (WHERE email_confirmed_at IS NULL)
  INTO v_registered_users, v_verified_email_users, v_pending_email_verification_users
  FROM auth.users;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', recent.id,
    'email', recent.email,
    'createdAt', recent.created_at,
    'lastSignInAt', recent.last_sign_in_at,
    'emailConfirmedAt', recent.email_confirmed_at
  )), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT id, email, created_at, last_sign_in_at, email_confirmed_at
    FROM auth.users ORDER BY created_at DESC LIMIT 100
  ) AS recent;

  IF pg_catalog.to_regclass('public.room_plans') IS NOT NULL THEN
    SELECT pg_catalog.count(DISTINCT column_name)::integer INTO v_expected_plan_columns
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_plans'
      AND column_name = ANY (ARRAY['id', 'owner_id', 'room_name', 'room_type', 'room_length', 'room_width', 'updated_at']::text[]);
    IF v_expected_plan_columns = 7 THEN
      v_room_plans_available := true;
      EXECUTE 'SELECT pg_catalog.count(*) FROM public.room_plans' INTO v_total_room_plans;
      EXECUTE $query$
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', recent.id,
          'ownerId', recent.owner_id,
          'roomName', recent.room_name,
          'roomType', recent.room_type,
          'roomLength', recent.room_length,
          'roomWidth', recent.room_width,
          'updatedAt', recent.updated_at
        )), '[]'::jsonb)
        FROM (
          SELECT id, owner_id, room_name, room_type, room_length, room_width, updated_at
          FROM public.room_plans ORDER BY updated_at DESC LIMIT 100
        ) AS recent
      $query$ INTO v_room_plans;
    END IF;
  END IF;

  v_reviews_available := pg_catalog.to_regclass('public.reviews') IS NOT NULL;
  IF v_reviews_available THEN
    v_reviews_module_available := true;
    SELECT
      pg_catalog.count(*),
      pg_catalog.count(*) FILTER (WHERE status = 'published'),
      pg_catalog.count(*) FILTER (WHERE status = 'hidden'),
      pg_catalog.round(pg_catalog.avg(rating) FILTER (WHERE status = 'published')::numeric, 1)
    INTO v_total_reviews, v_published_reviews, v_hidden_reviews, v_average_published_rating
    FROM public.reviews;

    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', recent.id,
      'displayName', recent.display_name,
      'rating', recent.rating,
      'reviewText', recent.review_text,
      'status', recent.status,
      'createdAt', recent.created_at,
      'updatedAt', recent.updated_at
    ) ORDER BY recent.updated_at DESC), '[]'::jsonb)
    INTO v_reviews
    FROM (
      SELECT id, display_name, rating, review_text, status, created_at, updated_at
      FROM public.reviews ORDER BY updated_at DESC LIMIT 100
    ) AS recent;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'registeredUsers', v_registered_users,
    'verifiedEmailUsers', v_verified_email_users,
    'pendingEmailVerificationUsers', v_pending_email_verification_users,
    'roomPlansAvailable', v_room_plans_available,
    'totalRoomPlans', v_total_room_plans,
    'reviewsAvailable', v_reviews_available,
    'reviewsModuleAvailable', v_reviews_module_available,
    'totalReviews', v_total_reviews,
    'publishedReviews', v_published_reviews,
    'hiddenReviews', v_hidden_reviews,
    'averagePublishedRating', v_average_published_rating,
    'reviews', v_reviews,
    'users', v_users,
    'roomPlans', v_room_plans
  );
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.spacewise_admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spacewise_admin_overview() TO authenticated;
