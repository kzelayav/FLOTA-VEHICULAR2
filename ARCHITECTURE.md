# ARQUITECTURA — Flota Vehicular ECOM

## 1. Vista General

Aplicación interna de gestión de flota vehicular con arquitectura **Supabase-First**:

```
┌─────────────────────────────────────────────────────────────┐
│                      NAVEGADOR                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Frontend  │  │  Supabase   │  │   Supabase Auth       │  │
│  │  (JS/HTML)  │◄─┤   Client    │──┤  (JWT + Refresh)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬────────────┘  │
│         │               │                       │              │
│         ▼               ▼                       ▼              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    SUPABASE (PostgreSQL)                 │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐   │  │
│  │  │   Auth     │ │  Profiles  │ │  Tablas Operativas   │   │  │
│  │  │  (Auth)    │ │ (Profiles) │ │  (10 tablas + RLS)   │   │  │
│  │  └────────────┘ └────────────┘ └────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 2. Componentes

### Frontend (JavaScript Vanilla ES6+)
- **Arquitectura modular**: Módulos por funcionalidad (`js/*.js`)
- **Capa de datos**: `DB` (caché en memoria y Supabase, sin fallback a LocalStorage)
- **Autenticación**: `Auth` (solo Supabase Auth, sin legacy)
- **Módulos**: Dashboard, Activos, Preventivos, Correctivos, Gastos, Documentos, Alertas, Conductores, Vehículos, Reportes, Auditoría, Configuración

### Backend (Supabase)
- **PostgreSQL** con Row Level Security (RLS)
- **Supabase Auth** para autenticación (email/password, JWT)
- **Triggers** para sincronización `auth.users` ↔ `public.profiles`
- **Triggers** `updated_at` automático en tablas operativas

## 3. Flujo de Autenticación

```
1. Usuario ingresa email/password en login
       │
       ▼
2. Auth.login() → supabase.auth.signInWithPassword()
       │
       ▼
3. Supabase Auth valida credenciales → retorna JWT + User
       │
       ▼
4. Auth.loadOwnProfile(user.id) → SELECT * FROM public.profiles WHERE id = user.id
       │
       ▼
5. Validar profile.active = true y role válido
       │
       ▼
6. Auth.adaptSupabaseSession() → crea sesión en memoria (Auth._session)
       │
       ▼
7. DB.loadOperationalData() → carga datos operativos desde Supabase
       │
       ▼
8. App.showApp() → renderiza UI según role (Auth.can / Auth.canDelete)
```

### Restauración de Sesión (Recarga/F5)
```
1. App.init() → Auth.initAuthListener() → onAuthStateChange
       │
       ▼
2. Auth.restoreSupabaseSession() → supabase.auth.getSession()
       │
       ▼
3. Si hay sesión válida → loadOwnProfile → adaptSupabaseSession
       │
       ▼
4. DB.loadOperationalData() → App.showApp()
```

## 4. public.profiles

Tabla central de autorización (1:1 con `auth.users`):

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id` (ON DELETE CASCADE) |
| `name` | text | Nombre completo |
| `role` | text | `admin` \| `supervisor` \| `tecnico` \| `consulta` (CHECK constraint) |
| `active` | boolean | Habilitado para acceso |
| `created_at` | timestamptz | Creación |
| `updated_at` | timestamptz | Actualización (trigger automático) |

**RLS**: `profiles_self_read` → `SELECT` solo si `auth.uid() = id` y `active = true`

**Trigger**: `trg_profiles_updated_at` → actualiza `updated_at` en UPDATE

**Trigger Auth**: `on_auth_user_created` → crea profile automático al registrarse en Auth

## 5. Row Level Security (RLS)

Todas las tablas operativas tienen RLS habilitado y policies restrictivas:

| Tabla | SELECT | INSERT | UPDATE | DELETE | Roles con DELETE |
|---|---|---|---|---|---|
| `activos` | admin, supv, tec, cons | admin, supv, tec | admin, supv, tec | admin | admin |
| `mantenimientos` | admin, supv, tec, cons | admin, supv, tec | admin, supv, tec | admin, supv | admin, supv |
| `gastos` | admin, supv, tec, cons | admin, supv, tec | admin, supv, tec | admin, supv | admin, supv |
| `alertas` | admin, supv, tec, cons | admin, supv, tec | admin, supv, tec | admin, supv, tec | admin, supv, tec |
| `conductores` | admin, supv, tec, cons | admin, supv | admin, supv | admin, supv | admin, supv |
| `vehiculos` | todos autenticados | — | — | — | — |
| `documentos` | todos autenticados | — | — | — | — |
| `configuracion` | todos autenticados | admin | admin | — | admin |
| `auditoria` | admin | todos autenticados | — | admin | admin |
| `gastos` | admin, supv, tec, cons | admin, supv, tec | admin, supv, tec | admin, supv | admin, supv |
| `alertas` | admin, supv, tec, cons | admin, supv, tec | admin, supv, tec | admin, supv, tec | admin, supv, tec |

**Principio**: RLS es la **última barrera**; UI y handlers validan antes, pero RLS es la barrera final.

## 5. Matriz Final de Permisos (Operación por Operación)

### ACTIVOS
| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| supervisor | ✅ | ✅ | ✅ | ❌ |
| tecnico | ✅ | ✅ | ✅ | ❌ |
| consulta | ✅ | ❌ | ❌ | ❌ |

### MANTENIMIENTOS (preventivos + correctivos)
| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| supervisor | ✅ | ✅ | ✅ | ✅ |
| tecnico | ✅ | ✅ | ✅ | ❌ |
| consulta | ✅ | ❌ | ❌ | ❌ |

### GASTOS
| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| supervisor | ✅ | ✅ | ✅ | ✅ |
| tecnico | ✅ | ✅ | ✅ | ❌ |
| consulta | ✅ | ❌ | ❌ | ❌ |

### ALERTAS
| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| supervisor | ✅ | ✅ | ✅ | ✅ |
| tecnico | ✅ | ✅ | ✅ | ✅ |
| consulta | ✅ | ❌ | ❌ | ❌ |

### CONDUCTORES
| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| supervisor | ✅ | ✅ | ✅ | ✅ |
| tecnico | ✅ | ❌ | ❌ | ❌ |
| consulta | ✅ | ❌ | ❌ | ❌ |

### DOCUMENTOS
| Rol | SELECT |
|---|---|
| todos autenticados | ✅ |

### VEHÍCULOS
| Rol | SELECT |
|---|---|
| todos autenticados | ✅ |

### CONFIGURACIÓN
| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ❌ |
| supervisor | ✅ | ❌ | ❌ | ❌ |
| tecnico | ✅ | ❌ | ❌ | ❌ |
| consulta | ✅ | ❌ | ❌ | ❌ |

### AUDITORÍA
| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ | ✅ | ❌ | ✅ |
| supervisor | ❌ | ✅ | ❌ | ❌ |
| tecnico | ❌ | ✅ | ❌ | ❌ |
| consulta | ❌ | ✅ | ❌ | ❌ |

---

**Notas importantes:**
- El rol `tecnico` fue validado estáticamente contra código y RLS
- La validación funcional completa del rol `tecnico` está pendiente (no existe cuenta operativa activa)
- `Auth.can(module)` controla **navegación** (acceso a módulos UI)
- `Auth.canDelete(resource)` controla **operaciones DELETE** (alertas, maintenance)
- RLS continúa siendo la **última barrera** de autorización
- Sin sesión: ninguna operación permitida en tablas operativas

## 6. Tablas Operativas

| Tabla | Entidad | Descripción |
|---|---|---|
| `activos` | Activos | Vehículos, equipos, maquinaria |
| `vehiculos` | Vehículos | Subconjunto vehicular (Camión, Camioneta, Carro, Moto, etc.) |
| `conductores` | Conductores | Licencias, teléfonos, estado |
| `mantenimientos` | Mantenimientos | Preventivos (`tipo='preventivo'`) y Correctivos (`tipo='correctivo'`) |
| `alertas` | Alertas | Snapshots de alertas generadas por km/horas |
| `documentos` | Documentos | Archivos asociados a activos |
| `auditoria` | Auditoría | Log inmutable de acciones (LOGIN, LOGOUT, CRUD) |
| `gastos` | Gastos | Costos operativos por activo/categoría |
| `configuracion` | Configuración | Single-row (`id='default'`): moneda, formato fecha, días alerta |
| `profiles` | Perfiles | Vinculado a `auth.users` (FK + trigger) |

## 7. Persistencia

### Capa DB (`js/data.js`)
- **Caché en memoria**: `_cache` (objeto con arrays por colección)
- **Carga inicial**: `DB.bootstrap()` → `_loadAllFromSupabase()` → `_loadOperationalData()`
- **Escrituras**: Actualizan caché **inmediatamente** + sincronizan async con Supabase
- **Lecturas**: Desde caché en memoria (instantáneo)
- **Disponibilidad**: si Supabase no está configurado o no está disponible, la aplicación falla de forma segura y no activa un almacenamiento alternativo.

### Flujo de Escritura (DELETE ejemplo)
```
1. Handler valida Auth.canDelete('resource')
2. confirm() → UI confirmation
3. DB.deleteXxx(id) → _enqueueRecord (cola por registro)
4. _persistDelete → supabase.from('tabla').delete().eq('id', id)
5. await respuesta Supabase
4. Si éxito → splice en caché local (post-persistencia)
5. Auditoría (handler) → toast éxito → re-render
6. Si error → propagar error, NO modificar caché
```

### Cache Post-Persistencia (F2H-UI)
- **Antes**: `splice` → `await` → catch(rollback manual)
- **Ahora**: `await _persistDelete` → `splice` (solo si éxito)
- **Eliminado**: rollback manual `safeIdx` (propenso a errores de orden)

## 8. Auditoría

**Tabla**: `public.auditoria` (append-only, inmutable)

**Eventos registrados**:
- `LOGIN` / `LOGOUT` (con detail: "Inicio de sesión supabase" / "Cierre de sesión supabase")
- `CREATE` / `UPDATE` / `DELETE` en entidades operativas
- `SETTINGS` (cambios de configuración)
- `MIGRATE` (migración LocalStorage → Supabase)

**Contrato**:
- ✅ Solo después de persistencia exitosa en Supabase
- ✅ Una sola entrada por operación exitosa
- ✅ Sin credenciales ni datos sensibles
- ❌ No en intentos fallidos / no autorizados
- ❌ No en errores de red / RLS

## 9. Seguridad del Navegador

- **Autenticación**: Solo Supabase Auth (JWT HttpOnly cookies + localStorage para refresh)
- **Service Role**: Nunca en frontend
- **Credenciales**: Sin hardcodeo; `js/supabase-config.js` solo URL + anon key
- **Credenciales demo**: Eliminadas (F2F.10-B)
- **Login Legacy**: Eliminado (F2F.10-B)
- **`public.usuarios` / `password`**: Eliminadas (F2G)
- **`fleet_session` / `fleet_users`**: Limpieza defensiva residual (no operativas)
- **LocalStorage**: Solo fallback histórico; no fuente de datos operativos
- **Service Role**: Nunca en frontend; solo en respaldos/backups externos
- **CSP/Headers**: Vercel defaults + Supabase headers

## 10. Importación de Excel (Activos)

- **Solo admin** (UI + RLS)
- **Validaciones**: Headers, campos requeridos, tipos, duplicados (código)
- **Vista previa**: Resumen antes de confirmar
- **Upsert**: `onConflict: 'id'` (preserva existentes)
- **Auditoría**: `IMPORT_ACTIVOS` con conteos
- **Recarga**: `DB.loadOperationalData()` post-import
- **Validaciones**: Códigos, tipos, campos obligatorios, duplicados internos

## 11. Matriz Final de Permisos (Resumen)

| Tabla/Recurso | Admin | Supervisor | Tecnico | Consulta |
|---|---|---|---|---|
| **Activos** | CRUD | CRU | CRU | R |
| **Mantenimientos** | CRUD | CRUD | CRU | R |
| **Gastos** | CRUD | CRUD | CRU | R |
| **Alertas** | CRUD | CRUD | CRUD | R |
| **Conductores** | CRUD | CRUD | R | R |
| **Documentos** | R | R | R | R |
| **Vehículos** | R | R | R | R |
| **Configuración** | CRU | R | R | R |
| **Auditoría** | CRUD | C | C | C |
| **Alertas (DELETE)** | ✅ | ✅ | ✅ | ❌ |
| **Mantenimientos (DELETE)** | ✅ | ✅ | ❌ | ❌ |

## 12. Componentes Retirados (Historial)

| Componente | Fase | Motivo |
|---|---|---|
| `loginLegacy()` | F2F.10-B | Autenticación legacy insegura |
| `UsersModule` | F2F.10-D | Gestión usuarios in-app (insegura, duplicada) |
| `public.usuarios` | F2G | Tabla legacy con passwords en texto plano |
| Columna `password` | F2G | Credenciales en texto plano en BD |
| `fleet_users` / `fleet_session` | F2F.10-B | Almacenamiento legacy inseguro |
| `loginLegacy` / `handleDemoLogin` | F2F.10-B | Credenciales demo expuestas |
| Policies `allow_all_*` | F2H-SCHEMA | RLS permisiva demo obsoleta |
| `public.usuarios` tabla | F2G | Eliminada (DROP TABLE) |
| Columna `password` | F2G | Eliminada con tabla |

## 13. Decisiones Arquitectónicas Clave

| Decisión | Justificación |
|---|---|
| Solo Supabase Auth | Elimina superficie de ataque; delega seguridad a proveedor especializado |
| RLS en todas las tablas | Defensa en profundidad; BD como última barrera |
| `public.profiles` como fuente de autorización | Desacopla autenticación (Auth) de autorización (perfiles) |
| `Auth.canDelete()` separada de `Auth.can()` | Separa permisos de navegación de permisos destructivos |
| Caché post-persistencia | Consistencia fuerte; evita UI inconsistente tras error BD |
| Sin Admin API / Edge Functions | Simplicidad operativa; Supabase Dashboard suficiente para admin interno |
| Sin service role en frontend | Principio de menor privilegio |
| `public.usuarios` + `password` eliminados | Eliminación de superficie de ataque crítica |

## 14. Limitaciones Conocidas

1. **Rol `tecnico`**: Validado estáticamente (código + RLS), prueba funcional pendiente (sin cuenta operativa)
2. **Sin API Admin**: Gestión usuarios solo vía Supabase Dashboard
3. **Importación Excel**: Solo activos; validación básica de duplicados
4. **Respaldo sensible F2G**: Externo, retención 30 días post-confirmación
5. **Sin PITR automático**: Respaldos manuales pg_dump requeridos
6. **Sin tests automatizados**: Regresión manual documentada en OPERATIONS.md