# Flota Vehicular ECOM — Gestión Integral de Mantenimiento

## Propósito y Alcance

Aplicación interna para registrar, controlar y analizar la operación de una flota vehicular. Diseñada para un grupo interno reducido, no es una aplicación comercial.

**Módulos principales:**
- Registro y control de **activos** (vehículos, equipos, maquinaria)
- **Mantenimientos preventivos** programados
- **Mantenimientos correctivos** (fallas y reparaciones)
- Control de **gastos** operativos
- Gestión de **documentos** asociados a activos
- **Alertas** de mantenimiento por kilometraje/horas
- Registro de **conductores** y **vehículos**
- **Auditoría** de acciones relevantes
- **Reportes** y exportación (Excel/PDF)
- **Indicadores KPI** de disponibilidad, MTBF, MTTR, costos

## Arquitectura Resumida

```
Navegador → Supabase Auth → public.profiles → RLS → Tablas operativas
```

- **Autenticación**: Exclusivamente Supabase Auth (no login legacy)
- **Autorización**: `public.profiles` (name, role, active) + Row Level Security
- **Datos**: PostgreSQL en Supabase (10 tablas operativas)
- **Frontend**: HTML, CSS, JavaScript vanilla (ES6+)
- **Despliegue**: Vercel + Supabase
- **Control de versiones**: GitHub

## Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Backend/BaaS**: Supabase (PostgreSQL + Auth + Realtime)
- **Autenticación**: Supabase Auth (email/password)
- **Base de datos**: PostgreSQL con Row Level Security
- **Despliegue**: Vercel (CI/CD automático desde GitHub)
- **Control de versiones**: Git + GitHub

## Requisitos

- Navegador moderno con soporte ES6+
- Proyecto Supabase configurado
- Vercel account para despliegue (opcional, para CI/CD)

## Configuración Inicial

1. Crear proyecto en [Supabase](https://supabase.com)
2. Ejecutar `supabase/schema.sql` en SQL Editor de Supabase
3. Copiar `js/supabase-config.js` y configurar:
   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'https://TU-PROYECTO.supabase.co',
     anonKey: 'TU-ANON-KEY',
     authMode: 'supabase'
   };
   ```
4. Abrir `index.html` en navegador

## Ejecución Local

Abrir `index.html` directamente en navegador moderno. Para desarrollo con servidor local:
```bash
# Opcional: servidor local simple
npx serve .
# o
python -m http.server 8000
```

## Validación JavaScript

```bash
# Verificar sintaxis
node --check js/reports.js
node --check js/alerts.js
node --check js/auth.js
node --check js/data.js

# Validación completa (requiere npm)
npm.cmd run validate
```

## Despliegue

1. Push a `main` en GitHub
2. Vercel detecta cambios automáticamente
3. Verificar en Vercel:
   - ✅ Validation PASSED
   - ✅ Build Completed
   - ✅ Deployment Ready
   - ✅ Production / Current

## Administración de Usuarios

**La aplicación NO administra usuarios desde la interfaz.**

Toda la gestión de usuarios se realiza en **Supabase Dashboard**:

1. **Crear usuario**: Authentication → Users → Invite/Add User
2. **Verificar profile**: Table Editor → `public.profiles` → confirmar creación automática (trigger)
3. **Asignar rol**: Editar `public.profiles.role` → `admin`, `supervisor`, `tecnico` o `consulta`
4. **Activar**: Confirmar `active = true`
5. **Probar**: Login en la aplicación

**Roles disponibles:**
- `admin`: Acceso total (incluye DELETE en todas las tablas)
- `supervisor`: Gestión operativa (DELETE en alertas y mantenimientos)
- `tecnico`: Operación (sin DELETE en mantenimientos, con DELETE en alertas)
- `consulta`: Solo lectura

## Seguridad

- **Autenticación**: Exclusivamente Supabase Auth (JWT + refresh tokens)
- **Autorización**: Row Level Security en todas las tablas operativas
- **Sesión**: Restauración automática via `onAuthStateChange` + `getSession`
- **Logout**: Auditado antes de `signOut()`; limpieza defensiva de `fleet_session`/`fleet_users`
- **Credenciales**: Sin credenciales hardcodeadas; demo removidas
- **Service Role**: Nunca expuesta en frontend
- **Auditoría**: LOGIN, LOGOUT, CREATE, UPDATE, DELETE en `public.auditoria`

## Documentos Relacionados

- [ARQUITECTURA.md](ARCHITECTURE.md) — Arquitectura técnica detallada
- [OPERACIONES.md](OPERATIONS.md) — Procedimientos operativos y administración
- [MIGRACION-SUPABASE.md](MIGRACION-SUPABASE.md) — Historial de migración completa

## Estado Actual

- ✅ Migración a Supabase completada (F2F.1-F2F.9, F2F.10, F2G, F2H)
- ✅ Autenticación exclusivamente Supabase Auth
- ✅ RLS restrictiva en todas las tablas operativas
- ✅ `public.usuarios` y `password` legacy eliminadas (F2G)
- ✅ Autenticación legacy eliminada (F2F.10-B)
- ✅ Permisos DELETE alineados con RLS (F2H-UI)
- ✅ Caché mutada solo tras persistencia exitosa
- ✅ Producción estable en Vercel

## Limitaciones Conocidas

- Rol `tecnico` validado estáticamente; prueba funcional pendiente (sin cuenta operativa activa)
- No hay API administrativa en la aplicación (gestión vía Supabase Dashboard)
- No hay Edge Functions ni service role en frontend
- Importación Excel limitada a activos (validación de encabezados y duplicados)
- Respaldo sensible F2G externo con retención de 30 días post-confirmación

---

**Commit baseline documentación**: `338a0b4` — fix: correct maintenance delete button syntax