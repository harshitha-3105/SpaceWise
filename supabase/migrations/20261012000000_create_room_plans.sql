-- SpaceWise room plan schema. This migration is preparation only; it is not applied automatically.
-- The browser currently stores a complete plan with id, room, existing, planned, door,
-- window, generatedLayout, createdAt and updatedAt fields. plan_data preserves the full
-- JSON object; typed columns make common room and ownership fields queryable.
-- room_features can hold balcony or custom feature data if a future UI adds it.

-- Do not silently reuse an unknown pre-existing table. Inspect its columns and policies
-- in the Supabase SQL Editor before adapting this migration if public.room_plans exists.
DO $$
BEGIN
  IF to_regclass('public.room_plans') IS NOT NULL THEN
    RAISE EXCEPTION 'public.room_plans already exists. Inspect its schema and RLS policies before applying this migration; do not create a duplicate table.';
  END IF;
END;
$$;

CREATE TABLE public.room_plans (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name text NOT NULL CHECK (length(btrim(room_name)) > 0),
  room_type text NOT NULL CHECK (length(btrim(room_type)) > 0),
  room_length numeric NOT NULL CHECK (room_length > 0),
  room_width numeric NOT NULL CHECK (room_width > 0),
  room_features jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(room_features) = 'object'),
  existing_furniture jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(existing_furniture) = 'array'),
  planned_furniture jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(planned_furniture) = 'array'),
  door_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(door_details) = 'object'),
  window_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(window_details) = 'object'),
  generated_layout jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(generated_layout) = 'object'),
  plan_data jsonb NOT NULL CHECK (jsonb_typeof(plan_data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX room_plans_owner_updated_idx ON public.room_plans (owner_id, updated_at DESC);
CREATE INDEX room_plans_owner_room_type_idx ON public.room_plans (owner_id, room_type);

CREATE FUNCTION public.spacewise_set_room_plan_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER room_plans_set_updated_at
BEFORE UPDATE ON public.room_plans
FOR EACH ROW
EXECUTE FUNCTION public.spacewise_set_room_plan_updated_at();

ALTER TABLE public.room_plans ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_plans TO authenticated;

CREATE POLICY room_plans_select_own
ON public.room_plans FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY room_plans_insert_own
ON public.room_plans FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY room_plans_update_own
ON public.room_plans FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = owner_id)
WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY room_plans_delete_own
ON public.room_plans FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = owner_id);
