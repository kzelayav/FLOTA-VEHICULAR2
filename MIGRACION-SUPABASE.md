# Migración a Supabase — Flota Vehicular ECOM

**Estado**: COMPLETADO  
**Baseline documentación**: `338a0b4` — fix: correct maintenance delete button syntax  
**Fecha**: 2026-08-31

---

## 1. Resumen Ejecutivo

La aplicación migó de **LocalStorage** a **Supabase (PostgreSQL)** manteniendo la misma API pública de `DB` (`DB.getAssets()`, `DB.addAsset()`, etc.). Ningún módulo funcional requirió reescritura.

| Antes | Después |
|---|---|
| `localStorage.getItem/setItem` | CRUD contra tablas Supabase (`activos`, `mantenimientos`, `alertas`, etc.) |
| Lecturas síncronas del navegador | Caché en memoria + Supabase + escrituras async |
| Datos por navegador/equipo | Datos compartidos en la nube |
| Sin migración | Migración automática LocalStorage → Supabase (primer ingreso) |
| Sin manejo de errores | Manejo de errores + fallback LocalStorage |

---

## 2. Archivos Creados

| Archivo | Descripción |
|---|---|
| `supabase/schema.sql` | Esquema completo (10 tablas, índices, RLS, permisos, triggers). Ejecutar en SQL Editor Supabase. |
| `js/supabase-config.js` | Configuración cliente: `url`, `anonKey`, `authMode: 'supabase'`. |

---

## 3. Archivos Modificados

| Archivo | Cambio Principal |
|---|---|
| `index.html` | CDN Supabase JS, `supabase-config.js`, overlay carga |
| `js/data.js` | Reescrito: caché + Supabase + migración + fallback LocalStorage. API pública idéntica. |
| `js/app.js` | `App.init()` async; `updateAlertBadge()` usa AlertEngine |
| `js/reports.js` | `SettingsModule.resetData()` → `DB.resetData()` |
| `js/assets.js` | Importación Excel → `DB.bulkAddAssets()` (batch upsert) |
| `js/auth.js` | Auth solo Supabase; `Auth.canDelete()` para permisos DELETE |
| `js/alerts.js` | UI/handler DELETE condicionados a `Auth.canDelete('alerts')` |
| `js/reports.js` | UI/handlers DELETE condicionados a `Auth.canDelete('maintenance')` |
| `js/data.js` | Caché post-persistencia; `deleteAlerta/Preventive/Corrective` sin rollback manual |

---

## 4. Estructura SQL (`supabase/schema.sql`)

### Tablas Operativas (10)

| Tabla | Entidad | Descripción |
|---|---|---|
| `activos` | Activos | Vehículos, equipos, maquinaria |
| `vehiculos` | Vehículos | Subconjunto vehicular (Camión, Camioneta, Carro, Moto, etc.) |
| `conductores` | Conductores | Licencia, teléfono, estado |
| `mantenimientos` | Mantenimientos | Preventivos (`tipo='preventivo'`) y Correctivos (`tipo='correctivo'`) |
| `alertas` | Alertas | Snapshots de alertas km/horas |
| `documentos` | Documentos | Archivos asociados a activos |
| `auditoria` | Auditoría | Log inmutable (LOGIN, LOGOUT, CRUD) |
| `gastos` | Gastos | Costos operativos por activo/categoría |
| `configuracion` | Configuración | Single-row `id='default'` (moneda, días alerta) |
| `profiles` | Perfiles | Vinculado a `auth.users` (FK + trigger) |

### Tabla Retirada
| Tabla | Estado | Motivo |
|---|---|---|
| `public.usuarios` | **ELIMINADA (F2G)** | Tabla legacy con passwords en texto plano; reemplaza por Supabase Auth + `public.profiles` |
| Columna `password` | **ELIMINADA** | Credenciales en texto plano; autenticación delegada a Supabase Auth |

### Convenciones
- **DB**: snake_case (`current_km`, `activo_id`, `created_at`)
- **App**: camelCase (`currentKm`, `assetId`, `createdAt`)
- Mapeo en `js/data.js` (`_toAssetRow`, `_fromAssetRow`, etc.)

---

## 6. Migración Automática (Primer Ingreso)

`DB.bootstrap()` ejecuta al iniciar:

1. Crea cliente Supabase (`js/supabase-config.js`)
2. Carga todas las tablas a caché (`_loadAllFromSupabase`)
3. Detecta datos legacy en LocalStorage (`fleet_assets`, `fleet_preventive`, etc.)
4. Si existe → **upsert masivo** a Supabase (preserva IDs y relaciones)
5. Si éxito → elimina claves LocalStorage + registra auditoría `MIGRATE`
6. Seed solo si BD vacía (solo fila `configuracion` default)
8. Recarga caché final

> Ocurre **una sola vez** (primer ingreso tras configurar Supabase).

---

## 7. Fases de Migración (Historial)

### F2F.1–F2F.9: RLS Restrictiva por Tabla
| Fase | Tabla | Commit |
|---|---|---|
| F2F.1 | `alertas` | `ce39e2f` |
| F2F.2 | `conductores` | `062f804` |
| F2F.3 | `vehiculos` | `d324d30` |
| F2F.4 | `documentos` | `0d31763` |
| F2F.5 | `configuracion` | `a6ed62d` |
| F2F.6 | `gastos` | `b124574` |
| F2F.7 | `auditoria` | `07ccf52` |
| F2F.8 | `mantenimientos` | `b124574` |
| F2F.9 | `activos` | `0b3864a` |

**Resultado**: RLS restrictiva en 9 tablas operativas + `profiles` (F2B).

### F2F.10-A: RLS `public.usuarios` Admin-Only
- Commit `1a40e3f`: Policies restrictivas (solo admin activo)
- Elimina `allow_all_usuarios`

### F2F.10-B: Elimina Auth Legacy + Credenciales Demo
- Commit `2d005e0`: Elimina `loginLegacy`, `handleDemoLogin`, `demo-user-btn`, `fleet_session`, `fleet_users`, seed passwords
- `Auth.getMode()` → solo `'supabase'`; fallback seguro

### F2F.10-C: Desacopla `public.usuarios` de Carga Operativa
- Commit `0ce4db2`: Retira `usuarios` de `_loadAllFromSupabase` y `loadOperationalData`
- Caché `users` inicia vacía; carga bajo demanda solo admin

### F2F.10-D: Elimina UsersModule + CRUD Legacy Frontend
- Commit `c8d05ed`: Elimina `UsersModule`, navegación `users`, `MODULES.users`
- Elimina `DB.getUsers`, `addUser`, `updateUser`, `deleteUser`, mappers, `TABLES.users`, cache `users`
- `Auth.canDelete()` centraliza permisos DELETE

### F2G: Elimina `public.usuarios` (BD)
- Commit `903fbad`: Migración `DROP TABLE public.usuarios` (idempotente, sin CASCADE)
- Elimina tabla + columna `password` + policies + grants
- Respaldo seguro `pg_dump` verificado previo

### F2H: Limpieza Final
| Sub-fase | Descripción |
|---|---|
| F2H-A | Limpieza respaldos locales, scripts diagnósticos, `.gitignore` |
| F2H-A2 | Elimina respaldos sensibles (`.backup_f2f10b_code`, etc.); mueve no sensibles |
| F2H-SCHEMA | Elimina `CREATE POLICY allow_all_*` del loop DO $$ en `schema.sql` |
| F2H-UI | `Auth.canDelete()`; UI/handlers alineados RLS; caché post-persistencia |
| F2H-B | Documentación final (README, ARCHITECTURE, OPERATIONS, MIGRACION) |
| F2H-C | Regresión final pendiente |
| F2H-D | Cierre formal + eliminación respaldo sensible F2G (30 días) |

---

## 8. Seguridad Final

| Medida | Estado |
|---|---|
| Autenticación solo Supabase Auth | ✅ |
| `public.usuarios` + `password` eliminados | ✅ (F2G) |
| RLS restrictiva en 10 tablas | ✅ |
| `Auth.canDelete()` centralizada | ✅ |
| Caché post-persistencia | ✅ |
| Auditoría solo tras éxito | ✅ |
| Service Role fuera de frontend | ✅ |
| Credenciales demo eliminadas | ✅ |
| Login legacy eliminado | ✅ |

---

## 9. Commits Clave (Baseline Documentación)

| Commit | Mensaje | Fase |
|---|---|---|
| `fa13b41` | fix: prevent duplicate assets during Excel import | Pre-F2F |
| `1a40e3f` | feat(db): restrict legacy users to admin access | F2F.10-A |
| `2d005e0` | security: remove demo credentials and legacy auth | F2F.10-B |
| `0ce4db2` | security: decouple legacy users from operational load | F2F.10-C |
| `c8d05ed` | refactor: remove legacy user management frontend | F2F.10-D |
| `903fbad` | refactor(db): retire legacy usuarios table | F2G |
| `0b3864a` | security(db): remove permissive demo policies from schema | F2H-SCHEMA |
| `338a0b4` | fix: correct maintenance delete button syntax | F2H-UI (fix) |
| **`d784946`** | **chore: ignore local backups and diagnostic artifacts** | **F2H-A** |
| **`102eca4`** | **fix(db): make legacy usuarios drop migration idempotent** | **F2G** |
| **`89fa5ed`** | **fix(db): remove permissive demo policies from schema** | **F2H-SCHEMA** |
| **`c8d05ed`** | **refactor: remove legacy user management frontend** | **F2F.10-D** |
| **`0ce4db2`** | **security: decouple legacy users from operational load** | **F2F.10-C** |
| **`2d005e0`** | **security: remove demo credentials and legacy auth** | **F2F.10-B** |
| **`1a40e3f`** | **feat(db): restrict legacy users to admin access** | **F2F.10-A** |

---

## 10. Estado Final

| Componente | Estado |
|---|---|
| Migración LocalStorage → Supabase | ✅ Completada |
| RLS Restrictiva (10 tablas) | ✅ |
| Autenticación Solo Supabase Auth | ✅ |
| `public.usuarios` Eliminada | ✅ (F2G) |
| Columna `password` Eliminada | ✅ |
| Auth Legacy Eliminada | ✅ |
| Credenciales Demo Eliminadas | ✅ |
| Permisos DELETE Alineados RLS | ✅ |
| Caché Post-Persistencia | ✅ |
| Auditoría Solo Tras Éxito | ✅ |
| Documentación Final | ✅ (F2H-B) |

---

## 10. Puesta en Marcha (Resumen)

1. Crear proyecto Supabase
2. Ejecutar `supabase/schema.sql` en SQL Editor
3. Configurar `js/supabase-config.js` (URL + anonKey + `authMode: 'supabase'`)
4. Abrir `index.html` → migración automática si hay datos legacy
5. Crear usuarios en Supabase Dashboard → `public.profiles` → asignar roles
6. Desplegar en Vercel (push a `main` → auto-deploy)

---

**Migración COMPLETADA** — Baseline documentación: `338a0b4`  
**Próximo**: F2H-C (Regresión Final) → F2H-D (Cierre Formal)