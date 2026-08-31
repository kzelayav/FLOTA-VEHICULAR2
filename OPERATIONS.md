# OPERACIONES — Flota Vehicular ECOM

## 1. Administración de Usuarios

La aplicación **NO administra usuarios desde la interfaz**. Toda la gestión se realiza en **Supabase Dashboard**.

### Crear Usuario
1. Supabase Dashboard → **Authentication** → **Users** → **Invite User** / **Add User**
2. Email + contraseña temporal → usuario recibe email para confirmar
3. Verificar creación automática de profile: **Table Editor** → `public.profiles` → confirmar fila creada (trigger `on_auth_user_created`)
3. Editar `public.profiles`:
   - `role`: `admin` | `supervisor` | `tecnico` | `consulta`
   - `active`: `true`
4. Probar login en la aplicación

### Modificar Rol
1. **Table Editor** → `public.profiles` → editar fila del usuario
2. Cambiar `role` a: `admin`, `supervisor`, `tecnico` o `consulta`
3. Pedir al usuario que haga logout/login (o cerrar sesión desde Auth Dashboard)

### Desactivar Usuario
1. **Table Editor** → `public.profiles` → `active = false`
2. Opcional: **Authentication** → **Users** → **Ban** / **Delete** (cuando corresponda)
3. Confirmar que RLS bloquea operaciones (usuario no puede hacer login ni operaciones)

### Recuperar Contraseña
1. **Authentication** → **Users** → usuario → **Reset Password** / **Send Magic Link**
2. **No registrar** la nueva contraseña
2. **No comunicar** contraseñas por repositorio, documentación o mensajería insegura

## 2. Despliegue

### Flujo Estándar
```
1. Commit selectivo en main (git add archivos_específicos)
2. Push a origin/main
3. Vercel detecta push → Build automático
4. Verificar en Vercel Dashboard:
   ✅ Validation PASSED (12/12)
   ✅ Build Completed
   ✅ Deployment Ready
   ✅ Production / Current
```

### Validación Antes del Push
```bash
git status --short
git diff --name-only
git diff --cached --name-only

# Validar sintaxis
node --check js/reports.js
node --check js/alerts.js
node --check js/auth.js
node --check js/data.js

# Validación completa (si npm disponible)
npm.cmd run validate
```

**Resultado requerido:**
```
Passed: 12
Failed: 0
Validation PASSED
```

### Reglas de Commit
- ❌ No `git add .` ni `git add -A`
- ✅ `git add archivo1 archivo2` (selectivo)
- ✅ Revisar `git diff --cached` antes de commit
- ✅ Confirmar `HEAD == origin/main` antes de cambios importantes

### Push
```bash
git add archivo1 archivo2
git commit -m "tipo: descripción breve"
git push origin main
```

## 3. Importación de Excel (Activos)

### Requisitos
- **Solo admin** (UI + RLS)
- Archivo `.xlsx` con hoja "Activos" o primera hoja

### Columnas Requeridas (mínimas)
| Columna | Descripción | Ejemplo |
|---|---|---|
| `Código` | Código único del activo | `ACT-001` |
| `Tipo` | Tipo de equipo | `Camión`, `Camioneta`, `Motocicleta` |
| `Marca` | Marca del equipo | `Toyota`, `Ford` |
| `Modelo` | Modelo del equipo | `Hilux`, `F-150` |

### Columnas Opcionales
`Año`, `Placa`, `Serie`, `Ubicación`, `Área`, `Localidad`, `Departamento`, `Usuario`, `Responsable`, `Estado`, `Kilometraje Actual`, `Horas Actuales`, `Fecha Inspección`, `Observaciones`

### Proceso
1. **Admin** → Módulo **Activos** → **Importar Excel**
2. Seleccionar archivo → **Validar** (revisa encabezados, requeridos, duplicados internos)
3. **Vista previa** → Revisar resumen (nuevos, duplicados, errores)
6. **Confirmar** → Upsert masivo (`onConflict: 'id'`)
7. **Auditoría**: Registro `IMPORT_ACTIVOS` con conteos
8. **Recarga**: `DB.loadOperationalData()` automática
9. Verificar: Conteos, auditoría `IMPORT_ACTIVOS`, Console limpio

### Validaciones
- ✅ Headers requeridos presentes
- ✅ Campos obligatorios no vacíos
- ✅ Códigos únicos (internos y vs BD)
- ✅ Tipos válidos (numéricos, fechas)
- ❌ No sobrescribir existentes sin regla aprobada (usa `onConflict: 'id'`)

## 4. Respaldo y Recuperación

### Respaldo Programado (Recomendado)
```bash
# Respaldo completo (pg_dump)
pg_dump -h db.xxx.supabase.co -U postgres -d postgres \
  --schema=public --data-only --no-owner --no-privileges \
  -f backup_$(date +%Y%m%d_%H%M%S).sql

# Respaldo solo tabla sensible (ejemplo)
pg_dump ... -t public.activos -t public.mantenimientos ... > backup_operativo.sql
```

### Respaldo Sensible F2G (Específico)
- **Qué**: `public.usuarios` (tabla eliminada en F2G, contenía passwords legacy)
- **Cuándo**: Antes de ejecutar migración F2G (`DROP TABLE public.usuarios`)
- **Cómo**: `pg_dump -t public.usuarios --data-only --column-inserts > backup_usuarios_f2g.sql`
- **Verificación**: SHA-256 + conteo filas
- **Almacenamiento**: Ubicación segura, fuera del repo, no pública, no compartida
- **Retención**: 30 días post-confirmación estable de F2G
- **Eliminación segura**: `shred` / eliminación segura autorizada tras retención

### Recuperación Segura (Disaster Recovery)
```bash
# 1. Verificar estado actual
psql -h db.xxx.supabase.co -U postgres -d postgres -c "SELECT COUNT(*) FROM public.activos;"

# 2. Restaurar desde respaldo (ejemplo tabla única)
psql -h db.xxx.supabase.co -U postgres -d postgres -f backup_activos.sql

# 3. O restauración completa (si BD completa)
pg_restore -h db.xxx.supabase.co -U postgres -d postgres backup.dump

# 4. Verificar integridad
psql ... -c "SELECT COUNT(*) FROM public.activos; SELECT COUNT(*) FROM public.mantenimientos;"
```

### Reglas de Recuperación
- ✅ **Git rollback** = restaura código, **NO** datos BD
- ✅ **Rollback BD** = requiere respaldo verificado (pg_restore / COPY FROM)
- ❌ No restaurar `loginLegacy`, credenciales demo, `public.usuarios` como solución
- ✅ Recuperación de tabla requiere respaldo seguro verificado (pg_restore / COPY FROM)
- ❌ No usar `CASCADE` sin diagnóstico previo
- ✅ Confirmar conteos y dependencias antes de cualquier `DROP`
- ✅ Respaldos sensibles fuera del repo, no en OneDrive/correo/mensajería sin cifrar
- ✅ Documentar hash, fecha, conteo, retención

## 5. Importación de Excel (Detalle Operativo)

Ver sección **4. Importación de Excel (Activos)** arriba.

## 5. Respaldo y Recuperación (Detalle)

Ver sección **4. Respaldo y Recuperación** arriba.

## 6. Recuperación Segura

Ver sección **4. Recuperación Segura (Disaster Recovery)** arriba.

## 7. Auditoría

### Eventos Registrados
| Acción | Código | Detalle típico |
|---|---|---|
| Login | `LOGIN` | `Inicio de sesión supabase` |
| Logout | `LOGOUT` | `Cierre de sesión supabase` |
| Crear | `CREATE` | `Activo creado: COD-001` |
| Actualizar | `UPDATE` | `Activo actualizado: COD-001` |
| Eliminar | `DELETE` | `Alerta eliminada: Cambio de aceite — ACT-001` |
| Configuración | `SETTINGS` | `Configuración guardada` |
| Importar | `IMPORT_ACTIVOS` | `12 activos importados, 0 duplicados` |
| Migración | `MIGRATE` | `Migración LocalStorage → Supabase completada` |

### Consultar Auditoría
```sql
-- Últimos 50 eventos
SELECT * FROM public.auditoria ORDER BY ts DESC LIMIT 50;

-- Por usuario
SELECT * FROM public.auditoria WHERE user_name = 'Juan Pérez' ORDER BY ts DESC;

-- Por acción
SELECT * FROM public.auditoria WHERE action = 'DELETE' ORDER BY ts DESC;
```

## 10. Manejo de Incidentes

### Error de Despliegue (Vercel)
1. Revisar logs en Vercel Dashboard → Functions / Build Logs
2. Común: `npm run validate` falla → corregir sintaxis JS
3. Revertir commit si crítico: `git revert HEAD && git push origin main`

### Error RLS en Producción
1. Verificar policy en Supabase SQL Editor
2. Confirmar `public.profiles` tiene `active=true` y `role` correcto
3. Verificar `auth.uid()` coincide con `profiles.id`
4. Revisar logs Supabase → Logs → PostgREST / Realtime

### Error de Caché Inconsistente
1. Recargar página (F5) → fuerza `DB.loadOperationalData()`
2. Si persiste: `localStorage.clear()` + `sessionStorage.clear()` + recargar
3. Verificar `DB.mode === 'supabase'` en Console

### Credenciales Comprometidas
1. Rotar inmediatamente en Supabase Dashboard → Settings → API
2. Actualizar `js/supabase-config.js` con nueva anon key
3. Commit + push → deployment automático
4. Invalidar sesiones: Auth → Users → Log out all sessions

## 11. Revisión de KPI (Mensual)

Ejecutar en módulo **Reportes** → **KPIs** o consultar `DB.calcKPIs()` en Console:

| KPI | Umbral Alerta | Acción |
|---|---|---|
| Disponibilidad | < 85% | Revisar mantenimientos vencidos |
| MTBF | < 500 hrs | Revisar plan preventivo |
| MTTR | > 48 hrs | Revisar proceso correctivo |
| % Preventivo | < 60% | Aumentar preventivos programados |
| Gastos Mes | > Presupuesto | Revisar gastos por categoría/activo |
| Mantenimientos Vencidos | > 5 | Generar alertas / reprogramar |

## 11. Validaciones de Seguridad (Checklist)

Ejecutar búsquedas periódicas en código versionado:

```bash
# Credenciales/demo/legacy
grep -r "admin123\|1234\|demo-user-btn\|handleDemoLogin\|loginLegacy" --include="*.js" --include="*.html"

# Auth legacy
grep -r "loginLegacy\|fleet_session\|fleet_users" --include="*.js"

# Supabase/service role
grep -r "service_role\|SUPABASE_SERVICE_ROLE_KEY" --include="*.js" --include="*.html"

# Policies permisivas
grep -r "allow_all_\|USING true\|WITH CHECK true" supabase/schema.sql

# Legacy users table
grep -r "public\.usuarios\|TABLES\.users\|DB\.getUsers\|DB\.addUser" --include="*.js"

# Service role en frontend
grep -r "service_role\|SUPABASE_SERVICE_ROLE_KEY" --include="*.js" --include="*.html"

# Password legacy
grep -r "password.*legacy\|password.*texto plano" --include="*.js" --include="*.md"
```

**Resultado obligatorio**: Cero coincidencias operativas (solo historial/documentación)

## 12. Retención Respaldo Sensible F2G

| Ítem | Valor |
|---|---|
| **Qué** | `public.usuarios` dump (pg_dump --data-only --column-inserts) |
| **Cuándo** | Pre-F2G (antes de DROP TABLE) |
| **Hash** | SHA-256 registrado en bitácora |
| **Conteo** | Filas verificadas vs `SELECT COUNT(*) FROM public.usuarios` |
| **Ubicación** | `../fleet-management-backups/` (local) / almacenamiento seguro externo |
| **Retención** | 30 días post-confirmación estable (post-F2G confirmado) |
| **Eliminación** | `shred -n 3 archivo.sql` o eliminación segura autorizada |
| **Registro** | Bitácora con fecha, hash, responsable, autorización |

## 13. Checklist Pre-Deploy

```bash
# 1. Estado Git
git status --short                    # Solo archivos intencionales
git diff --cached --name-only         # Solo archivos intencionados

# 2. Sintaxis
node --check js/reports.js
node --check js/alerts.js
node --check js/auth.js
node --check js/data.js

# 3. Validación (si npm)
npm.cmd run validate

# 3. Commit selectivo
git add archivo1 archivo2
git commit -m "tipo: descripción"
git push origin main
```

## 13. Contactos y Escalación

| Problema | Contacto | SLA |
|---|---|---|
| Despliegue fallido | DevOps / Vercel Support | 1h |
| Error RLS/BD | Supabase Support / DBA | 2h |
| Credenciales comprometidas | Security / Supabase | Inmediato (15 min) |
| Despliegue fallido crítico | Git revert + push | 15 min |

---

**Documento**: OPERATIONS.md  
**Versión**: 1.0 (baseline `338a0b4`)  
**Actualizado**: 2026-08-31