-- Extend the database-authorized admin overview with email verification status.
-- This migration reads Auth data only; it does not modify any user account.

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

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (WHERE email_confirmed_at IS NOT NULL),
    pg_catalog.count(*) FILTER (WHERE email_confirmed_at IS NULL)
  INTO
    v_registered_users,
    v_verified_email_users,
    v_pending_email_verification_users
  FROM auth.users;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', recent.id,
      'email', recent.email,
      'createdAt', recent.created_at,
      'lastSignInAt', recent.last_sign_in_at,
      'emailConfirmedAt', recent.email_confirmed_at
    )),
    '[]'::jsonb
  ) INTO v_users
  FROM (
    SELECT id, email, created_at, last_sign_in_at, email_confirmed_at
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
    'verifiedEmailUsers', v_verified_email_users,
    'pendingEmailVerificationUsers', v_pending_email_verification_users,
    'roomPlansAvailable', v_room_plans_available,
    'totalRoomPlans', v_total_room_plans,
    'reviewsAvailable', v_reviews_available,
    'totalReviews', v_total_reviews,
    'users', v_users,
    'roomPlans', v_room_plans
  );
END;
$$;

-- Keep the existing RPC access policy: authenticated clients may call the RPC,
-- but its database-verified allowlist check controls access to admin data.
REVOKE ALL PRIVILEGES ON FUNCTION public.spacewise_admin_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spacewise_admin_overview() TO authenticated;
