-- ============================================================================
-- F2G MIGRATION: DROP LEGACY PUBLIC.USUARIOS TABLE
-- ============================================================================
-- Controlled destructive migration to remove legacy public.usuarios table.
--
-- PREREQUISITES (MUST BE CONFIRMED BEFORE EXECUTION):
-- 1. F2G preflight fully approved (frontend + database).
-- 2. Secure backup of public.usuarios created and verified (pg_dump).
-- 3. Credential rotation completed in Supabase Auth.
-- 4. Zero frontend consumers of public.usuarios (F2F.10-D approved).
-- 5. Zero foreign keys in/out required.
-- 6. Zero views, materialized views, triggers, dependent functions.
-- 7. Profiles without Auth = 0, Auth without Profile = 0, Valid roles confirmed.
-- 6 operational users confirmed in Auth + Profiles.
--
-- EXECUTION:
-- - Execute MANUALLY once in Supabase SQL Editor.
-- - DO NOT execute automatically during deployment.
-- - DO NOT use CASCADE.
-- - Explicit transaction: all or nothing.
-- ============================================================================

BEGIN;

-- Check if table exists and conditionally execute all operations
DO $$
BEGIN
  IF to_regclass('public.usuarios') IS NOT NULL THEN
    -- Drop policies (if they exist)
    EXECUTE 'DROP POLICY IF EXISTS usuarios_select ON public.usuarios';
    EXECUTE 'DROP POLICY IF EXISTS usuarios_insert ON public.usuarios';
    EXECUTE 'DROP POLICY IF EXISTS usuarios_update ON public.usuarios';
    EXECUTE 'DROP POLICY IF EXISTS usuarios_delete ON public.usuarios';
    EXECUTE 'DROP POLICY IF EXISTS allow_all_usuarios ON public.usuarios';

    -- Revoke privileges
    EXECUTE 'REVOKE ALL ON public.usuarios FROM anon';
    EXECUTE 'REVOKE ALL ON public.usuarios FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.usuarios FROM PUBLIC';

    -- Drop the legacy table
    EXECUTE 'DROP TABLE IF EXISTS public.usuarios';

    RAISE NOTICE 'Table public.usuarios dropped successfully.';
  ELSE
    RAISE NOTICE 'Table public.usuarios does not exist. Migration completed without changes.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- END OF F2G MIGRATION
-- ============================================================================
-- Post-execution:
-- - Verify table no longer exists:
--   SELECT COUNT(*) FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'usuarios';
-- - Confirm no errors in Supabase logs.
-- - Table public.usuarios and its password column no longer exist.
-- - public.profiles and auth.users remain intact.
-- - Audit, assets, maintenance, expenses, documents, alerts intact.
-- ============================================================================