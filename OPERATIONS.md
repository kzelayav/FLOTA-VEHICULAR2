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

### Secuencia Operativa Aceptada
1. Revisión estática
2. Staging selectivo
3. Commit controlado
4. Push a origin/main
5. Build y despliegue en Vercel
6. Validación funcional en la aplicación desplegada

- El propietario no usa pruebas locales o de vista previa como puerta de aceptación.
- La validación local con npm solo se ejecuta cuando Node.js ya está disponible; no se instala Node.js solo para una puerta del proyecto.
- **Vercel es el entorno oficial de validación y despliegue de JavaScript.**
- La aceptación de runtime ocurre después de commit y push. No se exige prueba local en navegador.

### Validación Antes del Push
```bash
git status --short
git diff --name-only
git diff --cached --name-only

# Validar sintaxis (solo si Node.js ya está disponible)
node --check js/reports.js
node --check js/alerts.js
node --check js/auth.js
node --check js/data.js
node --check js/expenses.js

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
3. **Vista previa** → Revisar resumen (nuevos, actualizaciones, errores bloqueantes)
4. Límite: máximo 500 filas no vacías
5. Las filas existentes se clasifican como actualización por ID preservado; las nuevas reciben ID
6. **Confirmar** → `DB.bulkAddAssets` (upsert masivo `onConflict: 'id'`)
7. **Orden seguro**: persistencia Supabase antes de reconciliación de caché (sin filas fantasma ante fallo)
8. **Recarga**: `DB.loadOperationalData()` autoritativa tras persistencia exitosa
9. **Auditoría**: Registro `IMPORT_ACTIVOS` con conteos, solo tras persistencia exitosa
10. **Éxito total**: toast de éxito, vista actualizada, modal cerrado
11. **Fallo de persistencia**: toast de error veraz (nada guardado), modal abierto, reintento permitido
12. **Éxito parcial** (persistencia confirmada + fallo de recarga): advertencia veraz, `DB.reconcileImportedAssets`, botón bloqueado; recargar y verificar antes de cualquier reintento; prohibido reconfirmar a ciegas
13. Verificar: Conteos, auditoría `IMPORT_ACTIVOS`, Console limpio

### Validaciones
- ✅ Headers requeridos presentes
- ✅ Campos obligatorios no vacíos
- ✅ Códigos únicos (internos y vs BD)
- ✅ Tipos válidos (numéricos, fechas)
- ✅ Máximo 500 filas no vacías
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

## 5. Operación de Gastos (admin y supervisor)

Solo admin y supervisor ven el módulo **Gastos** (navegación bajo Gestión). Tecnico y consulta no tienen acceso.

1. **Crear**: Gastos → Registrar Gasto → completar Fecha y Monto (obligatorios) → Guardar (el botón se bloquea durante la persistencia)
2. **Editar**: fila → ✏️ → modificar → Guardar (el ID existente se preserva)
3. **Eliminar**: fila → 🗑️ (solo admin/supervisor) → confirmar → eliminación persistida
4. **Filtros**: activo, planta, mes, año; pills por categoría; resumen del mes/año/histórico
5. **Persistencia antes del éxito**: el mensaje de éxito aparece solo tras persistencia confirmada
6. **Auditoría**: CREATE/UPDATE/DELETE tras persistencia exitosa; sin auditoría de éxito ante fallo
7. **Doble envío**: protegido por bloqueo de botón y guardas internas; sin reintento automático
8. **Éxito parcial**: advertencia veraz; recargar o reabrir Gastos antes de reintentar; no reenviar el formulario
9. **Error**: toast de error, modal abierto, valores conservados, reintento permitido
10. Dashboard no incluye Gastos; Reportes no incluye Gastos (alcance opcional separado, no autorizado)

## 6. Auditoría

### Eventos Registrados
| Acción | Código | Detalle típico |
|---|---|---|
| Logout | `LOGOUT` | `Cierre de sesión supabase` |
| Crear | `CREATE` | `Activo creado: COD-001` (incluye Gastos tras persistencia) |
| Actualizar | `UPDATE` | `Activo actualizado: COD-001` (incluye Gastos tras persistencia) |
| Eliminar | `DELETE` | `Alerta eliminada: Cambio de aceite — ACT-001` (incluye Gastos tras persistencia) |
| Completar | `COMPLETE` | `Correctivo reparado: COD-001` |
| Configuración | `SETTINGS` | `Configuración guardada` |
| Importar | `IMPORT_ACTIVOS` | `Importación finalizada: nuevos N, actualizados M, rechazados 0` |
| Migración | `MIGRATE` | Histórico, evento único (`Migración LocalStorage → Supabase completada`) |

LOGIN no está implementado y no forma parte de los eventos activos. Los escritos fallidos no generan auditoría de éxito.

### Consultar Auditoría
```sql
-- Últimos 50 eventos
SELECT * FROM public.auditoria ORDER BY ts DESC LIMIT 50;

-- Por usuario
SELECT * FROM public.auditoria WHERE user_name = 'Juan Pérez' ORDER BY ts DESC;

-- Por acción
SELECT * FROM public.auditoria WHERE action = 'DELETE' ORDER BY ts DESC;
```

## 7. Manejo de Incidentes

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

## 8. Revisión de KPI (Mensual)

Ejecutar en módulo **Reportes** → **KPIs** o consultar `DB.calcKPIs()` en Console:

| KPI | Umbral Alerta | Acción |
|---|---|---|
| Disponibilidad | < 85% | Revisar mantenimientos vencidos |
| MTBF | < 500 hrs | Revisar plan preventivo |
| MTTR | > 48 hrs | Revisar proceso correctivo |
| % Preventivo | < 60% | Aumentar preventivos programados |
| Gastos Mes | > Presupuesto | Revisar gastos por categoría/activo |
| Mantenimientos Vencidos | > 5 | Generar alertas / reprogramar |

## 9. Validaciones de Seguridad (Checklist)

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

## 10. Retención Respaldo Sensible F2G

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

**Estado actual**: F2H-D está en pausa porque los requisitos de retención o evidencia permanecen incompletos. El repositorio no contiene ningún respaldo sensible versionado; la existencia externa del respaldo no fue verificada por la auditoría de documentación; el período de 30 días no ha sido probado. **No se autoriza ninguna eliminación.** Toda eliminación futura requiere autorización explícita del propietario con evidencia registrada. F2H-D es independiente de esta actualización documental.

## 11. Checklist Pre-Deploy

```bash
# 1. Estado Git
git status --short                    # Solo archivos intencionales
git diff --cached --name-only         # Solo archivos intencionados

# 2. Sintaxis (solo si Node.js ya está disponible; Vercel es el entorno oficial)
node --check js/reports.js
node --check js/alerts.js
node --check js/auth.js
node --check js/data.js
node --check js/expenses.js

# 3. Validación (si npm)
npm.cmd run validate

# 4. Commit selectivo
git add archivo1 archivo2
git commit -m "tipo: descripción"
git push origin main

# 5. Validación en la aplicación desplegada (Vercel)
```

## 12. Contactos y Escalación

| Problema | Contacto | SLA |
|---|---|---|
| Despliegue fallido | DevOps / Vercel Support | 1h |
| Error RLS/BD | Supabase Support / DBA | 2h |
| Credenciales comprometidas | Security / Supabase | Inmediato (15 min) |
| Despliegue fallido crítico | Git revert + push | 15 min |

---

**Documento**: OPERATIONS.md  
**Versión**: 1.1 (baseline `c45c46c`: F-01 cerrado en `0ff9426`, F-02 cerrado en `c45c46c`, F2H-C cerrada, F2H-D en pausa)