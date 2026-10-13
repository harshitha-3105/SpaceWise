-- SpaceWise admin access is opt-in and database verified. This migration does
-- not promote any account; bootstrap the single administrator manually after
-- applying it (see the commented SQL at the end of this file).

CREATE TABLE public.spacewise_admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.spacewise_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spacewise_admin_users FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.spacewise_admin_users FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.spacewise_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.spacewise_admin_users AS admin_user
      WHERE admin_user.user_id = auth.uid()
    );
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.spacewise_is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spacewise_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.spacewise_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_registered_users bigint;
  v_users jsonb;
  v_room_plans_available boolean := false;
  v_total_room_plans bigint := NULL;
  v_room_plans jsonb := '[]'::jsonb;
  v_reviews_available boolean := false;
  v_total_reviews bigint := NULL;
  v_expected_plan_columns integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.spacewise_admin_users AS admin_user
    WHERE admin_user.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Admin access required';
  END IF;

  SELECT pg_catalog.count(*) INTO v_registered_users
  FROM auth.users;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', recent.id,
      'email', recent.email,
      'createdAt', recent.created_at,
      'lastSignInAt', recent.last_sign_in_at
    )),
    '[]'::jsonb
  ) INTO v_users
  FROM (
    SELECT id, email, created_at, last_sign_in_at
    FROM auth.users
    ORDER BY created_at DESC
    LIMIT 100
  ) AS recent;

  IF pg_catalog.to_regclass('public.room_plans') IS NOT NULL THEN
    SELECT pg_catalog.count(DISTINCT column_name)::integer INTO v_expected_plan_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'room_plans'
      AND column_name = ANY (ARRAY['id', 'owner_id', 'room_name', 'room_type', 'room_length', 'room_width', 'updated_at']::text[]);

    IF v_expected_plan_columns = 7 THEN
      v_room_plans_available := true;
      EXECUTE 'SELECT pg_catalog.count(*) FROM public.room_plans' INTO v_total_room_plans;
      EXECUTE $query$
        SELECT COALESCE(
          pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', recent.id,
            'ownerId', recent.owner_id,
            'roomName', recent.room_name,
            'roomType', recent.room_type,
            'roomLength', recent.room_length,
            'roomWidth', recent.room_width,
            'updatedAt', recent.updated_at
          )),
          '[]'::jsonb
        )
        FROM (
          SELECT id, owner_id, room_name, room_type, room_length, room_width, updated_at
          FROM public.room_plans
          ORDER BY updated_at DESC
          LIMIT 100
        ) AS recent
      $query$ INTO v_room_plans;
    END IF;
  END IF;

  IF pg_catalog.to_regclass('public.reviews') IS NOT NULL THEN
    v_reviews_available := true;
    EXECUTE 'SELECT pg_catalog.count(*) FROM public.reviews' INTO v_total_reviews;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'registeredUsers', v_registered_users,
    'roomPlansAvailable', v_room_plans_available,
    'totalRoomPlans', v_total_room_plans,
    'reviewsAvailable', v_reviews_available,
    'totalReviews', v_total_reviews,
    'users', v_users,
    'roomPlans', v_room_plans
  );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.spacewise_admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spacewise_admin_overview() TO authenticated;

-- Manual bootstrap: after the intended administrator has registered and
-- confirmed the account, replace the placeholder email and run this separately
-- in the Supabase SQL Editor as a database administrator. It grants exactly
-- the matching account and never auto-promotes future signups.
--
-- INSERT INTO public.spacewise_admin_users (user_id)
-- SELECT id FROM auth.users
-- WHERE pg_catalog.lower(email) = pg_catalog.lower('REPLACE_WITH_ADMIN_LOGIN_EMAIL')
-- ON CONFLICT (user_id) DO NOTHING;
