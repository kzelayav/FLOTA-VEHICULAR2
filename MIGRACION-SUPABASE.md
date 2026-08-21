# Migración a Supabase — Flota Vehicular ECOM

Documento que explica todos los cambios realizados para migrar el almacenamiento
de datos de **LocalStorage** hacia **Supabase**, sin romper ninguna funcionalidad
existente.

---

## 1. Resumen

La aplicación usaba `localStorage` como única capa de persistencia (objeto `DB` en
`js/data.js`). Se migró toda la persistencia a **Supabase (PostgreSQL)** manteniendo
la misma API del `DB` (por ejemplo `DB.getAssets()`, `DB.addAsset()`), de modo que
**ninguno de los módulos tuvo que reescribirse** para seguir funcionando.

| Antes | Después |
|---|---|
| `localStorage.getItem/setItem` en `data.js` y otros | CRUD contra tablas de Supabase (`activos`, `mantenimientos`, `usuarios`, etc.) |
| Lecturas síncronas del navegador | Caché en memoria alimentada por Supabase + escrituras asíncronas |
| Datos por navegador/equipo | Datos compartidos en la nube |
| Sin migración | Migración automática LocalStorage → Supabase en el primer ingreso |
| Sin manejo de errores | Manejo de errores y respaldo a LocalStorage si Supabase falla |

---

## 2. Archivos creados

| Archivo | Descripción |
|---|---|
| `supabase/schema.sql` | Esquema completo de Supabase (10 tablas, índices, RLS y permisos). Ejecutar en el SQL Editor de Supabase. |
| `js/supabase-config.js` | Configuración del cliente: `url` y `anonKey`. Ahí se colocan los datos del proyecto. |

## 3. Archivos modificados

| Archivo | Cambio |
|---|---|
| `index.html` | Se agregó el CDN de `@supabase/supabase-js@2`, el script `supabase-config.js` y un overlay de carga mientras se descargan los datos. |
| `js/data.js` | **Reescrito por completo**: capa de datos con caché + Supabase + migración + respaldo LocalStorage. La API pública (`DB.getAssets`, `DB.addAsset`, `DB.calcKPIs`, etc.) se conservó idéntica. |
| `js/app.js` | `App.init()` ahora es asíncrono: espera `DB.bootstrap()` antes de mostrar login/app. `updateAlertBadge()` lee las alertas registradas (módulo independiente) y muestra el contador en la campana. |
| `js/reports.js` | `SettingsModule.resetData()` ahora usa `DB.resetData()` (limpia Supabase + siembra datos de ejemplo) en lugar de borrar claves de LocalStorage. |
| `js/assets.js` | La importación masiva de Excel ahora usa `DB.bulkAddAssets()` (un solo batch upsert a Supabase en lugar de un insert por fila). |

---

## 4. Estructura SQL creada (`supabase/schema.sql`)

Todas las tablas usan `id text primary key` porque la app genera los IDs en el
cliente (`DB.newId()`), lo que preserva las referencias entre registros y facilita
la migración de los datos existentes.

### Tablas solicitadas y su uso

| Tabla | Entidad | Mapeo con la app |
|---|---|---|
| `activos` | Activos | Módulo **Registro de Activos** (vehículos y equipos). |
| `vehiculos` | Vehículos | Subconjunto vehicular de los activos (Camión, Camioneta, Carro, Motocicleta, etc.). |
| `conductores` | Conductores | Registro de conductores (licencia, teléfono, estado). |
| `mantenimientos` | Mantenimientos | Preventivos y correctivos en **una sola tabla** discriminados por la columna `tipo` (`preventivo` / `correctivo`). |
| `alertas` | Alertas | Snapshot de las alertas generadas por el sistema (`AlertEngine`). |
| `usuarios` | Usuarios | Cuentas con roles (admin, supervisor, tecnico, consulta). |
| `documentos` | Documentos | Documentos asociados a activos (tarjeta de circulación, pólizas, etc.). |

### Tablas de soporte

| Tabla | Propósito |
|---|---|
| `auditoria` | Bitácora de auditoría (módulo Auditoría). |
| `gastos` | Gastos operativos (referenciados por `expenses.js` y reportes). |
| `configuracion` | Configuración del sistema (moneda, días de anticipación). Una sola fila `id='default'`. |

### Convención de columnas

- Supabase usa **snake_case** (`current_km`, `inspection_date`, `activo_id`, ...).
- La app usa **camelCase** (`currentKm`, `inspectionDate`, `assetId`, ...).
- El mapeo se hace en `js/data.js` (`_toAssetRow`, `_fromAssetRow`, `_toPreventiveRow`, etc.).

---

## 5. Sustitución de operaciones LocalStorage → Supabase

Todas las operaciones quedaron centralizadas en `js/data.js`:

| Operación anterior | Operación nueva (Supabase) |
|---|---|
| `localStorage.getItem(key)` → arreglo | `_selectAll(table)` / `_selectWhere(table, col, val)` al iniciar; lecturas desde caché en memoria |
| `localStorage.setItem(key, json)` | `upsert({ onConflict: 'id' })`, `insert()`, o `delete().eq('id', id)` |
| `localStorage.removeItem(key)` | `delete().eq('id', id)` / `delete().eq('tipo', ...)` / `delete().neq('id', '__none__')` para reemplazos |

Los **métodos públicos** del `DB` no cambian de nombre ni de firma, por lo que los
módulos (`assets.js`, `preventive.js`, `corrective.js`, `alerts.js`, `audit.js`,
`dashboard.js`, `reports.js`, `auth.js`) siguen funcionando sin cambios:

- Lecturas: `getAssets`, `getPreventive`, `getCorrective`, `getUsers`, `getAudit`, `getSettings`, `getAsset`, `calcKPIs`.
- Escrituras: `addAsset`, `updateAsset`, `deleteAsset`, `saveAssets`, `addPreventive`, `updatePreventive`, `deletePreventive`, `savePreventive`, y equivalentes para correctivo, usuarios, auditoría, configuración y gastos.

### Mapa clave LocalStorage → tabla

| Clave antigua | Tabla Supabase |
|---|---|
| `fleet_assets` | `activos` |
| `fleet_preventive` | `mantenimientos` (`tipo='preventivo'`) |
| `fleet_corrective` | `mantenimientos` (`tipo='correctivo'`) |
| `fleet_users` | `usuarios` |
| `fleet_audit` | `auditoria` |
| `fleet_settings` | `configuracion` |
| `fleet_expenses` | `gastos` |

---

## 6. Migración automática (primer ingreso)

`DB.bootstrap()` se ejecuta antes de mostrar la interfaz y hace lo siguiente:

1. Crea el cliente de Supabase con `js/supabase-config.js`.
2. Carga todas las tablas hacia la caché en memoria.
3. **Detecta si existe data antigua en LocalStorage** (`fleet_assets`, `fleet_preventive`, etc.).
4. Si existe, hace **upsert masivo** de esa data hacia Supabase (preservando IDs y relaciones).
5. Si la migración fue exitosa, **elimina las claves de LocalStorage** y registra un evento `MIGRATE` en la auditoría.
6. Si la base está vacía (sin migración y sin datos), el seed solo crea la fila de configuración por defecto (moneda `Q`, 7 días de anticipación). **No siembra datos de ejemplo**: los usuarios y activos se cargan desde Supabase.
7. Vuelve a recargar la caché para reflejar el estado final.

> La migración ocurre **una sola vez** (la primera vez que el usuario abre la app tras
> configurar Supabase). Después de migrar, LocalStorage queda vacío y los datos viven en la nube.

---

## 7. Dashboards y lectura desde Supabase

Los dashboards y todas las vistas leen siempre desde `DB`, que ahora obtiene los
datos de Supabase. No se modificó la lógica de `calcKPIs`, gráficas, filtros ni
alertas: solo cambió el origen de los datos.

---

## 8. Manejo de errores y carga asíncrona

- **Overlay de carga**: se muestra `#boot-loading` hasta que `DB.bootstrap()` termina.
- **Escrituras asíncronas**: `addAsset`, `updateAsset`, `deleteAsset`, etc. actualizan
  la caché al instante y sincronizan con Supabase en segundo plano (`_async`). Si una
  escritura falla, se muestra un toast de error y se registra en consola.
- **Respaldo LocalStorage**: si Supabase no está configurado, no carga el CDN, o la red
  falla, la app **cae automáticamente al modo LocalStorage** y sigue funcionando como
  antes (sin pérdida de funcionalidad).
- **Importación Excel** ahora es en lote (`DB.bulkAddAssets`).

---

## 9. Configuración para ponerlo en marcha

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve al **SQL Editor** de tu proyecto, pega el contenido de `supabase/schema.sql` y ejecútalo.
3. Ve a **Settings → API** y copia el **Project URL** y la **anon key**.
4. Edita `js/supabase-config.js`:
   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://TU-PROYECTO.supabase.co',
     anonKey: 'TU-ANON-KEY',
   };
   ```
5. Abre `index.html`. En la primera carga, los datos de LocalStorage se migrarán
   automáticamente a Supabase.

Usuarios existentes en Supabase (login rápido en la pantalla de inicio): `admin@flota.com / Samigol` (Administrador), `JakelingSilva@flota.com / 1234` (admin), `JasonAviles@flota.com / 1234` (supervisor), `AngieMendoza@flota.com / 1234` (supervisor).

---

## 10. Seguridad

- El script `schema.sql` activa **Row Level Security** con políticas **permisivas**
  (`using(true) with check(true)`) para que la app funcione con la anon key.
- ⚠️ **Para producción** se recomienda:
  - Adoptar **Supabase Auth** para el login (en lugar del login propio con la tabla `usuarios`).
  - Reemplazar las políticas permisivas por políticas basadas en `auth.uid()` y roles.
  - No exponer nunca la `service_role key` en el frontend (la anon key sí puede ir).
  - Encriptar/almacenar contraseñas con hash (por ejemplo con `bcrypt` en una Edge Function).

---

## 11. Notas de compatibilidad

- La **sesión de usuario** se mantiene en `sessionStorage` (no es dato de dominio y
  no se migra a Supabase). Solo se migraron las tablas de datos.
- El módulo `expenses.js` no está referenciado en `index.html`, pero su API
  (`DB.getExpenses`, `DB.addExpense`, etc.) ya existe sobre la tabla `gastos`.
- Los IDs de los registros se conservan al migrar, por lo que las relaciones
  (mantenimiento → activo, alerta → activo) se mantienen intactas.
