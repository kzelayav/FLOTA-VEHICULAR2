-- ============================================================================
-- FLOTA VEHICULAR ECOM — Esquema Supabase
-- ----------------------------------------------------------------------------
-- Cómo ejecutar:
--   1. Ve al Dashboard de Supabase → SQL Editor
--   2. Pega TODO este script y ejecútalo (o usa la CLI: supabase db push)
--   3. La app lee automáticamente estas tablas.
--
-- NOTA: la app usa IDs de texto generados en cliente (DB.newId()), por eso
-- todas las tablas usan `id text primary key` en lugar de uuid.
-- ============================================================================

-- ============================ ACTIVOS ======================================
-- Registro de vehículos, equipos y maquinaria de la flota.
create table if not exists public.activos (
  id             text primary key,
  code           text not null,
  tipo           text,
  marca          text,
  modelo         text,
  anio           integer,
  placa          text default '',
  serial         text default '',
  location       text default '',
  area           text default '',
  localidad      text default '',
  departamento   text default '',
  usuario        text default '',
  responsible    text default '',
  status         text default 'operativo',
  current_km     numeric default 0,
  current_hours  numeric default 0,
  inspection_date date,
  notes          text default '',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ============================ VEHÍCULOS ====================================
-- Vista dedicada a vehículos (subconjunto vehicular de activos).
create table if not exists public.vehiculos (
  id           text primary key,
  code         text,
  tipo         text,
  marca        text,
  modelo       text,
  anio         integer,
  placa        text default '',
  serial       text default '',
  current_km   numeric default 0,
  status       text default 'operativo',
  notes        text default '',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ============================ CONDUCTORES ==================================
create table if not exists public.conductores (
  id            text primary key,
  nombre        text,
  licencia      text,
  tipo_licencia text,
  telefono      text,
  email         text,
  status        text default 'activo',
  notes         text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================ MANTENIMIENTOS ===============================
-- Almacena los mantenimientos preventivos y correctivos en una sola tabla,
-- discriminados por la columna `tipo` ('preventivo' | 'correctivo').
create table if not exists public.mantenimientos (
  id                  text primary key,
  activo_id           text,
  activo_code         text,
  tipo                text default 'preventivo',
  service_type        text,                 -- tipo de servicio / tipo de falla
  frequency           text,
  frequency_value     numeric,
  last_done_date      date,
  last_done_km        numeric,
  last_done_hours     numeric,
  next_due_km         numeric,
  next_due_hours      numeric,
  next_due_date       date,
  tech_name           text,
  cost                numeric default 0,
  labor_cost          numeric default 0,
  parts_cost          numeric default 0,
  parts               text default '',
  observations        text default '',
  plant               text default '',
  failure_date        date,
  failure_category    text,
  description         text default '',
  downtime_hours      numeric default 0,
  repair_date         date,
  provider            text default '',
  root_cause          text default '',
  corrective_actions  text default '',
  responsible         text default '',
  status              text default '',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================ ALERTAS ======================================
-- Snapshot de las alertas generadas por el sistema.
create table if not exists public.alertas (
  id          text primary key,
  tipo        text,
  severity    text,
  titulo      text,
  mensaje     text,
  module      text,
  activo_id   text,
  fecha       timestamptz,
  leida       boolean default false,
  created_at  timestamptz default now()
);

-- ============================ USUARIOS =====================================
create table if not exists public.usuarios (
  id         text primary key,
  name       text,
  email      text,
  password   text,
  role       text,
  avatar     text default '',
  active     boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================ DOCUMENTOS ===================================
create table if not exists public.documentos (
  id            text primary key,
  activo_id     text,
  nombre        text,
  tipo_documento text,
  descripcion   text default '',
  file_name     text default '',
  file_url      text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================ AUDITORÍA ====================================
create table if not exists public.auditoria (
  id        text primary key,
  user_name text,
  action    text,
  detail    text,
  ts        timestamptz
);

-- ============================ GASTOS =======================================
create table if not exists public.gastos (
  id          text primary key,
  date        date,
  category    text,
  amount      numeric default 0,
  asset_id    text,
  description text default '',
  cost_center text default '',
  plant       text default '',
  provider    text default '',
  invoice     text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================ CONFIGURACIÓN ================================
create table if not exists public.configuracion (
  id              text primary key default 'default',
  currency        text default 'Q',
  date_format     text default 'DD/MM/YYYY',
  alert_days_ahead integer default 7,
  updated_at      timestamptz default now()
);

-- ============================ ÍNDICES ======================================
create index if not exists idx_activos_code       on public.activos (code);
create index if not exists idx_activos_status     on public.activos (status);
create index if not exists idx_mantenimientos_activo on public.mantenimientos (activo_id);
create index if not exists idx_mantenimientos_tipo   on public.mantenimientos (tipo);
create index if not exists idx_mantenimientos_status on public.mantenimientos (status);
create index if not exists idx_gastos_date        on public.gastos (date);
create index if not exists idx_auditoria_ts       on public.auditoria (ts);
create index if not exists idx_alertas_leida      on public.alertas (leida);
create index if not exists idx_usuarios_email     on public.usuarios (email);

-- ============================ RLS (DEMO) ===================================
-- Políticas permisivas para que la app funcione con la anon key.
-- ⚠️ En producción se recomienda restringir: usar Supabase Auth y políticas
--    basadas en auth.uid() / rol (ver MIGRACION-SUPABASE.md → Seguridad).
alter table public.activos       enable row level security;
alter table public.vehiculos     enable row level security;
alter table public.conductores   enable row level security;
alter table public.mantenimientos enable row level security;
alter table public.alertas       enable row level security;
alter table public.usuarios      enable row level security;
alter table public.documentos    enable row level security;
alter table public.auditoria     enable row level security;
alter table public.gastos        enable row level security;
alter table public.configuracion enable row level security;

do $$
declare t text;
begin
  foreach t in array array['activos','vehiculos','conductores','mantenimientos','alertas','usuarios','documentos','auditoria','gastos','configuracion'] loop
    execute format('drop policy if exists "allow_all_%s" on public.%I;', t, t);
    execute format('create policy "allow_all_%s" on public.%I for all using (true) with check (true);', t, t);
  end loop;
end $$;

-- ============================ PERMISOS =====================================
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- ============================ PROFILES (F2B) =================================
-- Perfiles mínimos vinculados a Supabase Auth. RLS self-read únicamente.
-- Sin policies admin, sin escritura desde frontend.
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text not null,
  role           text not null check (role in ('admin','supervisor','tecnico','consulta')),
  active         boolean not null default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles
for select
to authenticated
using (auth.uid() = id);

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
revoke all on public.profiles from public;
grant select on public.profiles to authenticated;

-- ============================ ALERTAS RLS (F2F.1) ================================
-- Policies restrictivas por rol, datos compartidos.
-- Requiere profiles (F2B) y Auth antes de datos (F2F-A).
-- Ejecutar en transacción manual en SQL Editor.

BEGIN;

DROP POLICY IF EXISTS alertas_select ON public.alertas;
DROP POLICY IF EXISTS alertas_insert ON public.alertas;
DROP POLICY IF EXISTS alertas_update ON public.alertas;
DROP POLICY IF EXISTS alertas_delete ON public.alertas;
DROP POLICY IF EXISTS allow_all_alertas ON public.alertas;

REVOKE ALL ON public.alertas FROM anon;
REVOKE ALL ON public.alertas FROM authenticated;
REVOKE ALL ON public.alertas FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas TO authenticated;

CREATE POLICY alertas_select ON public.alertas
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor','tecnico','consulta')
  )
);

CREATE POLICY alertas_insert ON public.alertas
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor','tecnico')
  )
);

CREATE POLICY alertas_update ON public.alertas
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor','tecnico')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor','tecnico')
  )
);

CREATE POLICY alertas_delete ON public.alertas
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor','tecnico')
  )
);

COMMIT;

-- ============================ CONDUCTORES RLS (F2F.2) ================================
-- Policies restrictivas por rol, datos compartidos.
-- Requiere profiles (F2B) y Auth antes de datos (F2F-A).
-- Ejecutar en transacción manual en SQL Editor.

BEGIN;

DROP POLICY IF EXISTS conductores_select ON public.conductores;
DROP POLICY IF EXISTS conductores_insert ON public.conductores;
DROP POLICY IF EXISTS conductores_update ON public.conductores;
DROP POLICY IF EXISTS conductores_delete ON public.conductores;
DROP POLICY IF EXISTS allow_all_conductores ON public.conductores;

REVOKE ALL ON public.conductores FROM anon;
REVOKE ALL ON public.conductores FROM authenticated;
REVOKE ALL ON public.conductores FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conductores TO authenticated;

CREATE POLICY conductores_select ON public.conductores
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor','tecnico','consulta')
  )
);

CREATE POLICY conductores_insert ON public.conductores
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor')
  )
);

CREATE POLICY conductores_update ON public.conductores
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor')
  )
);

CREATE POLICY conductores_delete ON public.conductores
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor')
  )
);

COMMIT;

-- ============================ VEHICULOS RLS (F2F.3) ================================
-- Policies restrictivas de solo lectura, datos compartidos.
-- Requiere profiles (F2B) y Auth antes de datos (F2F-A).
-- Ejecutar en transacción manual en SQL Editor.

BEGIN;

DROP POLICY IF EXISTS vehiculos_select ON public.vehiculos;
DROP POLICY IF EXISTS vehiculos_insert ON public.vehiculos;
DROP POLICY IF EXISTS vehiculos_update ON public.vehiculos;
DROP POLICY IF EXISTS vehiculos_delete ON public.vehiculos;
DROP POLICY IF EXISTS allow_all_vehiculos ON public.vehiculos;

REVOKE ALL ON public.vehiculos FROM anon;
REVOKE ALL ON public.vehiculos FROM authenticated;
REVOKE ALL ON public.vehiculos FROM PUBLIC;

GRANT SELECT ON public.vehiculos TO authenticated;

CREATE POLICY vehiculos_select ON public.vehiculos
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role IN ('admin','supervisor','tecnico','consulta')
  )
);

COMMIT;
