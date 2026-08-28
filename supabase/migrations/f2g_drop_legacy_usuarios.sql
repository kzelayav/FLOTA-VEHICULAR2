-- ============================================================================
-- F2G MIGRATION: DROP LEGACY PUBLIC.USUARIOS TABLE
-- ============================================================================
-- Migración destructiva controlada para retirar la tabla legacy public.usuarios.
--
-- REQUISITOS PREVIOS (DEBEN ESTAR CONFIRMADOS ANTES DE EJECUTAR):
-- 1. Preflight F2G completamente aprobado (frontend + base de datos).
-- 2. Respaldo seguro de public.usuarios creado y verificado (pg_dump).
-- 3. Rotación de credenciales completada en Supabase Auth.
-- 4. Cero consumidores frontend de public.usuarios (F2F.10-D aprobado).
-- 5. Cero foreign keys entrantes/salientes necesarias.
-- 6. Cero vistas, materialized views, triggers, funciones dependientes.
-- 7. Profiles sin Auth = 0, Auth sin Profile = 0, Roles válidos confirmados.
-- 6 usuarios operativos confirmados en Auth + Profiles.
--
-- EJECUCIÓN:
-- - Ejecutar MANUALMENTE una sola vez en Supabase SQL Editor.
-- - NO ejecutar automáticamente durante deployment.
-- - NO usar CASCADE.
-- - Transacción explícita: todo o nada.
-- ============================================================================

BEGIN;

-- 1. Verificar existencia de la tabla antes de proceder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'usuarios'
  ) THEN
    RAISE NOTICE 'Tabla public.usuarios no existe. Migración completada sin cambios.';
    -- Salida temprana: la tabla ya no existe
    RETURN;
  END IF;
END $$;

-- 2. Eliminar policies de F2F.10-A (si existen)
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
DROP POLICY IF EXISTS usuarios_insert ON public.usuarios;
DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
DROP POLICY IF EXISTS usuarios_delete ON public.usuarios;
DROP POLICY IF EXISTS allow_all_usuarios ON public.usuarios;

-- 3. Revocar privilegios (si existen)
REVOKE ALL ON public.usuarios FROM anon;
REVOKE ALL ON public.usuarios FROM authenticated;
REVOKE ALL ON public.usuarios FROM PUBLIC;

-- 4. Eliminar la tabla legacy
DROP TABLE IF EXISTS public.usuarios;

COMMIT;

-- ============================================================================
-- FIN DE MIGRACIÓN F2G
-- ============================================================================
-- Post-ejecución:
-- - Verificar que public.usuarios ya no existe: \d public.usuarios
-- - Confirmar que no hay errores en logs de Supabase.
-- - La tabla public.usuarios y su columna password ya no existen.
-- - public.profiles y auth.users permanecen intactos.
-- - Auditoría, activos, mantenimientos, gastos, documentos, alertas intactos.
-- ============================================================================