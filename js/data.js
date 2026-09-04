/* ====================================================
   DATA LAYER â€” Supabase CRUD + Cache + Migración LocalStorage
   ------------------------------------------------
   La capa de datos mantiene la MISMA API que antes
   (DB.getAssets(), DB.addAsset(), etc.) para no romper
   los módulos existentes.

   Arquitectura:
   - Todas las lecturas usan una caché en memoria que se
     llena desde Supabase durante `DB.bootstrap()`.
   - Todas las escrituras actualizan la caché al instante
     y se sincronizan con Supabase de forma asíncrona.
   - Si Supabase no está configurado o falla, se usa
     LocalStorage como respaldo (funcionalidad original).
   - La migración de datos desde LocalStorage hacia
     Supabase se ejecuta automáticamente en `bootstrap()`.
   ==================================================== */

const DB = {
  /* â”€â”€ Keys (compatibilidad con el código anterior) â”€â”€ */
  KEYS: {
    assets:     'fleet_assets',
    preventive: 'fleet_preventive',
    corrective: 'fleet_corrective',
    audit:      'fleet_audit',
    settings:   'fleet_settings',
    seeded:     'fleet_seeded_v9',
    expenses:   'fleet_expenses',
    vehicles:   'fleet_vehiculos',
    drivers:    'fleet_conductores',
    documents:  'fleet_documentos',
    alerts:     'fleet_alerts',
  },

  /* â”€â”€ Mapa colección â†’ tabla Supabase â”€â”€ */
  TABLES: {
    assets:     'activos',
    preventive: 'mantenimientos',
    corrective: 'mantenimientos',
    audit:      'auditoria',
    expenses:   'gastos',
    vehicles:   'vehiculos',
    drivers:    'conductores',
    documents:  'documentos',
    alerts:     'alertas',
    settings:   'configuracion',
  },

  /* â”€â”€ Estado interno â”€â”€ */
  supabase: null,
  mode: 'localstorage',          // 'localstorage' | 'supabase'
  _ready: null,
  _lastAlertSig: '',
  _cache: null,
  _queue: new Map(),  // Cola Promise por colección: _queue[colección] = Promise
  _recordQueues: new Map(),  // Cola Promise por registro: _recordQueues['collection:id'] = Promise

  /* â”€â”€ Helpers genéricos (compatibilidad) â”€â”€ */
  get(key) {
    const ck = this._keyToCache(key);
    if (ck) return this._cache[ck] || [];
    return [];
  },

  set(key, val) {
    const ck = this._keyToCache(key);
    if (!ck) return;
    this._cache[ck] = Array.isArray(val) ? val : (val || []);
    this._syncReplace(ck);
  },

  getObj(key, def = {}) {
    if (key === this.KEYS.settings) return this._cache.settings || def;
    return def;
  },

  /* â”€â”€ ID generator â”€â”€ */
newId() {
    return crypto.randomUUID();
  },

  /* â”€â”€ Cola Promise por colección â”€â”€ */
  _enqueue(coll, task) {
    const queue = this._queue.get(coll) || Promise.resolve();
    const next = queue.then(
      () => task(),
      (err) => {
        // Absorber el error anterior para permitir la siguiente operación
        // El error original ya fue propagado a su caller
        return task();
      }
    );
    this._queue.set(coll, next);
    return next;
  },

  /* â”€â”€ Cola Promise por registro (serialización completa por activo) â”€â”€ */
  _enqueueRecord(collection, recordId, task) {
    const key = collection + ':' + recordId;
    const prevQueue = this._recordQueues.get(key) || Promise.resolve();

    let opResolve, opReject;
    const opPromise = new Promise((resolve, reject) => {
      opResolve = resolve;
      opReject = reject;
    });

    let neutralResolve;
    const neutralPromise = new Promise((resolve) => {
      neutralResolve = resolve;
    });

    const runTask = prevQueue.then(async () => {
      try {
        const result = await task();
        opResolve(result);
      } catch (err) {
        opReject(err);
      } finally {
        neutralResolve();
      }
    });

    this._recordQueues.set(key, neutralPromise);

    runTask.finally(() => {
      const current = this._recordQueues.get(key);
      if (current === neutralPromise) {
        this._recordQueues.delete(key);
      }
    });

    return opPromise;
  },

/* ====================================================
     BOOTSTRAP — inicializa Supabase, migra y llena caché
     ==================================================== */
  async bootstrap(opts = {}) {
    const { loadData = true } = opts;
    if (this._ready) return this._ready;

    this._ready = (async () => {
      if (!this._cache) this._resetCache();
      this._setupSupabase();

      if (this.supabase) {
        if (loadData) {
          try {
            await this._loadAllFromSupabase();
            this.mode = 'supabase';

            const seeded   = await this.seed();
            if (seeded) await this._loadAllFromSupabase();

            console.log('[DB] Conectado a Supabase. Modo:', this.mode);
          } catch (err) {
            console.error('[DB] No se pudo inicializar Supabase, usando LocalStorage:', err);
            this.mode = 'localstorage';
            this._loadFromLocalStorage();
            await this.seed();
          }
        } else {
          this.mode = 'supabase';
        }
      } else {
        this.mode = 'localstorage';
        this._loadFromLocalStorage();
        await this.seed();
      }
    })();

    return this._ready;
  },

  /* â”€â”€ Configura el cliente de Supabase â”€â”€ */
  _setupSupabase() {
    const cfg = window.SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !window.supabase) return;
    try {
      this.supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch (e) {
      console.error('[DB] Error creando cliente Supabase:', e);
      this.supabase = null;
    }
  },

  /* â”€â”€ Ejecuta una operación asíncrona con manejo de errores â”€â”€ */
  _async(tag, fn) {
    if (this.mode !== 'supabase' || !this.supabase) return Promise.resolve();
    return Promise.resolve()
      .then(fn)
      .catch(err => {
        console.error(`[DB] ${tag} â†’`, err);
        throw err; // Propagar error al caller
      });
  },

  /* â”€â”€ Helper central de moneda â”€â”€ */
  getCurrencySymbol(currencyCode) {
    if (currencyCode === 'NIO') return 'C$';
    if (currencyCode === 'Q') return 'Q';
    return '?';
  },

  fmtCurrency(val, currencyCode) {
    // Resolver moneda: prioridad al argumento explícito, fallback a configuración global
    const resolvedCurrency = (currencyCode && typeof currencyCode === 'string' && currencyCode.trim() !== '')
      ? currencyCode
      : (this.getSettings?.()?.currency);

    const sym = this.getCurrencySymbol(resolvedCurrency);

    // Valores nulos, indefinidos, vacíos o no numéricos → indicador neutro
    if (val === null || val === undefined || val === '') {
      return `${sym} —`;
    }

    const num = parseFloat(val);

    // NaN, Infinity, -Infinity, o valor no numérico → indicador neutro
    if (!Number.isFinite(num) || isNaN(num)) {
      return `${sym} —`;
    }

    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    return `${sign}${sym} ${abs.toLocaleString('es', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  },

  /* â”€â”€ Parser seguro de fechas YYYY-MM-DD sin desplazamiento UTC â”€â”€ */
  _parseLocalDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const year = parseInt(trimmed.substring(0, 4), 10);
    const month = parseInt(trimmed.substring(5, 7), 10) - 1;
    const day = parseInt(trimmed.substring(8, 10), 10);
    if (year < 1900 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) return null;
    const d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
    return d;
  },

  /* â”€â”€ Parser estricto de costos â”€â”€ */
  _parseCost(val) {
    if (val === null || val === undefined || val === '' || (typeof val === 'string' && val.trim() === '')) {
      return { valid: false, value: null, reason: 'missing' };
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') return { valid: false, value: null, reason: 'missing' };
      // Verificar que la cadena es numérica limpia (sin caracteres extra)
      if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
        return { valid: false, value: null, reason: 'invalid' };
      }
    }
    const num = parseFloat(val);
    if (!Number.isFinite(num) || isNaN(num)) {
      return { valid: false, value: null, reason: 'invalid' };
    }
    if (num < 0) return { valid: true, value: num, reason: 'negative' };
    if (num === 0) return { valid: true, value: 0, reason: 'zero' };
    return { valid: true, value: num, reason: 'positive' };
  },

  /* â”€â”€ Evaluador de costo por registro â”€â”€ */
  getMaintenanceCost(record) {
    if (!record || !record.tipo) {
      return { value: null, status: 'invalid_type', maintenanceType: 'unknown', isIncluded: false, issue: 'Tipo de mantenimiento no definido' };
    }
    if (record.tipo === 'preventivo') {
      const costInfo = this._parseCost(record.cost);
      if (!costInfo.valid) {
        return { value: null, status: costInfo.reason, maintenanceType: 'preventivo', isIncluded: false, issue: costInfo.reason };
      }
      const statusMap = { positive: 'valid_positive', zero: 'valid_zero', negative: 'negative' };
      return {
        value: costInfo.value,
        status: statusMap[costInfo.reason] || 'valid_positive',
        maintenanceType: 'preventivo',
        isIncluded: costInfo.reason !== 'negative',
        issue: costInfo.reason === 'negative' ? 'Costo negativo detectado' : null
      };
    }
    if (record.tipo === 'correctivo') {
      const labor = this._parseCost(record.laborCost);
      const parts = this._parseCost(record.partsCost);
      if (!labor.valid && !parts.valid) {
        return { value: null, status: 'missing', maintenanceType: 'correctivo', isIncluded: false, issue: 'Ambos componentes ausentes' };
      }
      const laborValid = labor.valid;
      const partsValid = parts.valid;
      const laborVal = laborValid ? labor.value : 0;
      const partsVal = partsValid ? parts.value : 0;
      const total = laborVal + partsVal;
      const hasPartial = labor.valid !== parts.valid;
      const anyNegative = (labor.valid && labor.value < 0) || (parts.valid && parts.value < 0);
      if (anyNegative) {
        return { value: total, status: 'negative', maintenanceType: 'correctivo', isIncluded: false, issue: 'Componente negativo' };
      }
      if (total === 0) {
        return { value: 0, status: 'valid_zero', maintenanceType: 'correctivo', isIncluded: true, issue: null };
      }
      const status = labor.valid !== parts.valid ? 'partial_missing' : 'valid_positive';
      const issue = labor.valid !== parts.valid ? 'Cobertura parcial (solo mano de obra o solo repuestos)' : null;
      return { value: total, status, maintenanceType: 'correctivo', isIncluded: true, issue };
    }
    return { value: null, status: 'invalid_type', maintenanceType: record.tipo, isIncluded: false, issue: 'Tipo desconocido: ' + record.tipo };
  },

  /* â”€â”€ Agregador financiero central â”€â”€ */
  _aggregateFinancials(preventive, corrective, now, filter) {
    // Evaluar cada registro
    const prevEvaluated = preventive.map(p => ({ ...p, _cost: this.getMaintenanceCost(p) }));
    const corrEvaluated = corrective.map(c => ({ ...c, _cost: this.getMaintenanceCost(c) }));

    // Filtrar por fecha financiera (mes actual / año actual)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const inCurrentMonth = (dateStr) => {
      if (!dateStr) return false;
      const d = this._parseLocalDate(dateStr);
      if (!d) return false;
      return d >= monthStart && d <= monthEnd;
    };
    const inCurrentYear = (dateStr) => {
      if (!dateStr) return false;
      const d = this._parseLocalDate(dateStr);
      if (!d) return false;
      return d >= yearStart && d <= new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    };

    // Evaluar preventivos
    const prevInMonth = prevEvaluated.filter(p => p._cost.isIncluded && inCurrentMonth(p.lastDoneDate));
    const prevInYear = prevEvaluated.filter(p => p._cost.isIncluded && inCurrentYear(p.lastDoneDate));

    // Evaluar correctivos (fecha financiera = repairDate)
    const corrInMonth = corrEvaluated.filter(c => c._cost.isIncluded && inCurrentMonth(c.repairDate));
    const corrInYear = corrEvaluated.filter(c => c._cost.isIncluded && inCurrentYear(c.repairDate));

    // Costos
    const monthlyPreventiveCost = prevInMonth.reduce((s, p) => s + p._cost.value, 0);
    const monthlyCorrectiveCost = corrInMonth.reduce((s, c) => s + c._cost.value, 0);
    const monthCost = monthlyPreventiveCost + monthlyCorrectiveCost;

    const annualPreventiveCost = prevInYear.reduce((s, p) => s + p._cost.value, 0);
    const annualCorrectiveCost = corrInYear.reduce((s, c) => s + c._cost.value, 0);
    const yearCost = annualPreventiveCost + annualCorrectiveCost;

    // Distribución por costo
    let preventiveCostPct = 0, correctiveCostPct = 0, hasCostDistribution = false;
    const monthCostTotal = monthCost;
    if (monthCostTotal > 0) {
      preventiveCostPct = (monthlyPreventiveCost / monthCostTotal) * 100;
      correctiveCostPct = (monthlyCorrectiveCost / monthCostTotal) * 100;
      hasCostDistribution = true;
    }

    // Promedio positivo (solo value > 0)
    const positiveCostRecords = [
      ...prevEvaluated.filter(p => p._cost.isIncluded && p._cost.value > 0 && inCurrentMonth(p.lastDoneDate)),
      ...corrEvaluated.filter(c => c._cost.isIncluded && c._cost.value > 0 && inCurrentMonth(c.repairDate))
    ];
    const avgPositiveMaintenanceCost = positiveCostRecords.length > 0
      ? positiveCostRecords.reduce((s, r) => s + r._cost.value, 0) / positiveCostRecords.length
      : null;

    // Ranking mensual por activo
    const costByAsset = new Map();
    [...prevEvaluated.filter(p => p._cost.isIncluded && inCurrentMonth(p.lastDoneDate)),
     ...corrEvaluated.filter(c => c._cost.isIncluded && inCurrentMonth(c.repairDate))]
      .forEach(r => {
        if (!r.assetId) return;
        const existing = costByAsset.get(r.assetId) || { preventiveCost: 0, correctiveCost: 0, totalCost: 0, asset: r };
        if (r.tipo === 'preventivo') existing.preventiveCost += r._cost.value;
        else existing.correctiveCost += r._cost.value;
        existing.totalCost += r._cost.value;
        existing.asset = r;
        costByAsset.set(r.assetId, existing);
      });

    const topAssetsByMaintenanceCost = Array.from(costByAsset.entries())
      .map(([id, data]) => ({ assetId: id, ...data }))
      .sort((a, b) => b.totalCost - a.totalCost || (a.asset.assetCode || '').localeCompare(b.asset.assetCode || ''))
      .slice(0, 10)
      .map(({ assetId, asset, preventiveCost, correctiveCost, totalCost }) => ({
        assetId,
        code: asset?.assetCode || '',
        preventiveCost,
        correctiveCost,
        totalCost
      }));

    // Ranking anual por activo
    const costByAssetYear = new Map();
    [...prevInYear, ...corrInYear].forEach(r => {
      if (!r.assetId) return;
      const existing = costByAssetYear.get(r.assetId) || { preventiveCost: 0, correctiveCost: 0, totalCost: 0, assetCode: r.assetCode };
      if (r.tipo === 'preventivo') existing.preventiveCost += r._cost.value;
      else existing.correctiveCost += r._cost.value;
      existing.totalCost += r._cost.value;
      if (!existing.assetCode && r.assetCode) existing.assetCode = r.assetCode;
      costByAssetYear.set(r.assetId, existing);
    });

    const topAssetsByAnnualMaintenanceCost = Array.from(costByAssetYear.entries())
      .map(([id, data]) => ({ assetId: id, ...data }))
      .filter(d => d.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost || (a.assetCode || '').localeCompare(b.assetCode || ''))
      .slice(0, 10)
      .map(({ assetId, assetCode, preventiveCost, correctiveCost, totalCost }) => ({
        assetId,
        code: assetCode || '',
        preventiveCost,
        correctiveCost,
        totalCost
      }));

    // financialCoverage
    const evaluatedRecords = prevEvaluated.length + corrEvaluated.length;
    const includedRecords = prevEvaluated.filter(p => p._cost.isIncluded).length + corrEvaluated.filter(c => c._cost.isIncluded).length;
    const positiveCostCount = prevEvaluated.filter(p => p._cost.status === 'valid_positive').length + corrEvaluated.filter(c => c._cost.status === 'valid_positive').length;
    const zeroCosts = prevEvaluated.filter(p => p._cost.status === 'valid_zero').length + corrEvaluated.filter(c => c._cost.status === 'valid_zero').length;
    const partialMissingCosts = prevEvaluated.filter(p => p._cost.status === 'partial_missing').length + corrEvaluated.filter(c => c._cost.status === 'partial_missing').length;
    const missingCosts = prevEvaluated.filter(p => p._cost.status === 'missing').length + corrEvaluated.filter(c => c._cost.status === 'missing').length;
    const invalidCosts = prevEvaluated.filter(p => p._cost.status === 'invalid').length + corrEvaluated.filter(c => c._cost.status === 'invalid').length;
    const negativeCosts = prevEvaluated.filter(p => p._cost.status === 'negative').length + corrEvaluated.filter(c => c._cost.status === 'negative').length;
    const invalidTypes = prevEvaluated.filter(p => p._cost.status === 'invalid_type').length + corrEvaluated.filter(c => c._cost.status === 'invalid_type').length;

    // Fechas financieras faltantes (solo para registros con costo incluido o potencialmente incluido)
    const missingFinancialDates = prevEvaluated.filter(p => p._cost.isIncluded && !p.lastDoneDate).length +
                                  corrEvaluated.filter(c => c._cost.isIncluded && !c.repairDate).length;

    // assetId faltante para ranking (solo en registros con costo incluido)
    const missingAssetIdForRanking = prevEvaluated.filter(p => p._cost.isIncluded && !p.assetId).length +
                                     corrEvaluated.filter(c => c._cost.isIncluded && !c.assetId).length;

    const financialCoverage = {
      evaluatedRecords,
      includedRecords,
      positiveCostCount,
      zeroCosts,
      partialMissingCosts,
      missingCosts,
      invalidCosts,
      negativeCosts,
      invalidTypes,
      missingFinancialDates,
      missingAssetIdForRanking
    };

    return {
      monthlyPreventiveCost,
      monthlyCorrectiveCost,
      monthCost,
      annualPreventiveCost,
      annualCorrectiveCost,
      yearCost,
      preventiveCostPct,
      correctiveCostPct,
      hasCostDistribution,
      avgPositiveMaintenanceCost,
      topAssetsByMaintenanceCost,
      topAssetsByAnnualMaintenanceCost,
      financialCoverage
    };
  },

  /* â”€â”€ Lecturas desde Supabase â”€â”€ */
  async _selectAll(table, orderBy = 'created_at', ascending = true) {
    let q = this.supabase.from(table).select('*');
    if (orderBy) q = q.order(orderBy, { ascending });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async _selectWhere(table, col, val) {
    const { data, error } = await this.supabase.from(table).select('*').eq(col, val).order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async _getSettingsRow() {
    const { data, error } = await this.supabase.from('configuracion').select('*').eq('id', 'default').maybeSingle();
    if (error) throw error;
    return data;
  },

  async _upsertRows(table, rows) {
    if (!rows || !rows.length) return;
    const { error } = await this.supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async _upsertSettingsRow(s) {
    const { error } = await this.supabase.from('configuracion').upsert([{
      id: 'default',
currency: s.currency || 'NIO',
      date_format: s.dateFormat || 'DD/MM/YYYY',
      alert_days_ahead: parseInt(s.alertDaysAhead) || 7,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'id' });
    if (error) throw error;
  },

  async _loadAllFromSupabase() {
    const [assets, preventive, corrective, audit, expenses, vehicles, drivers, alerts, docs] = await Promise.all([
      this._selectAll('activos'),
      this._selectWhere('mantenimientos', 'tipo', 'preventivo'),
      this._selectWhere('mantenimientos', 'tipo', 'correctivo'),
      this._selectAll('auditoria', 'ts', false),
      this._selectAll('gastos'),
      this._selectAll('vehiculos'),
      this._selectAll('conductores'),
      this._selectAll('alertas'),
      this._selectAll('documentos'),
    ]);

    this._cache.assets     = assets.map(r => this._fromRow('assets', r));
    this._cache.preventive = preventive.map(r => this._fromRow('preventive', r));
    this._cache.corrective = corrective.map(r => this._fromRow('corrective', r));
    this._cache.audit      = audit.map(r => this._fromRow('audit', r));
    this._cache.expenses   = expenses.map(r => this._fromRow('expenses', r));
    this._cache.vehicles   = vehicles.map(r => this._fromRow('vehicles', r));
    this._cache.drivers    = drivers.map(r => this._fromRow('drivers', r));
    this._cache.alerts     = alerts.map(r => this._fromRow('alerts', r));
    this._cache.documents  = docs.map(r => this._fromRow('documents', r));

    const s = await this._getSettingsRow();
    this._cache.settings = s
      ? { currency: s.currency || 'NIO', dateFormat: s.date_format || 'DD/MM/YYYY', alertDaysAhead: parseInt(s.alert_days_ahead) || 7 }
      : { currency: 'NIO', dateFormat: 'DD/MM/YYYY', alertDaysAhead: 7 };
  },

  /* ====================================================
     LOAD OPERATIONAL DATA — Carga explícita tras autenticación
     ==================================================== */
  async loadOperationalData() {
    if (this.mode !== 'supabase' || !this.supabase) {
      throw new Error('Cliente Supabase no disponible o modo inválido');
    }

    const session = Auth.getSession();
    if (!session || !session.id || !session.role || session.active !== true) {
      throw new Error('Sesión Supabase inválida o perfil no disponible');
    }

    const { data: { session: sdkSession } } = await this.supabase.auth.getSession();
    if (!sdkSession?.user || sdkSession.user.id !== session.id) {
      throw new Error('Sesión SDK no coincide con adapter');
    }

    const [
      assets, preventive, corrective, audit, expenses,
      vehicles, drivers, alerts, docs
    ] = await Promise.all([
      this._selectAll('activos'),
      this._selectWhere('mantenimientos', 'tipo', 'preventivo'),
      this._selectWhere('mantenimientos', 'tipo', 'correctivo'),
      this._selectAll('auditoria', 'ts', false),
      this._selectAll('gastos'),
      this._selectAll('vehiculos'),
      this._selectAll('conductores'),
      this._selectAll('alertas'),
      this._selectAll('documentos'),
    ]);

    const s = await this._getSettingsRow();

    const tempCache = {
      assets: assets.map(r => this._fromAssetRow(r)),
      preventive: preventive.map(r => this._fromPreventiveRow(r)),
      corrective: corrective.map(r => this._fromCorrectiveRow(r)),
      audit: audit.map(r => ({ ...r, user: r.user_name })),
      expenses: expenses.map(r => this._fromExpenseRow(r)),
      vehicles: vehicles.map(r => this._fromRow('vehicles', r)),
      drivers: drivers.map(r => this._fromRow('drivers', r)),
      alerts: alerts.map(r => this._fromAlertRow(r)),
      documents: docs.map(r => this._fromRow('documents', r)),
      settings: s
        ? { currency: s.currency || 'NIO', dateFormat: s.date_format || 'DD/MM/YYYY', alertDaysAhead: parseInt(s.alert_days_ahead) || 7 }
        : { currency: 'NIO', dateFormat: 'DD/MM/YYYY', alertDaysAhead: 7 }
    };

    Object.assign(this._cache, tempCache);
  },

  /* ====================================================
     SEED DATA
     ==================================================== */
  async seed() {
    if (this.mode === 'supabase') {
      const { count, error } = await this.supabase.from('activos').select('*', { count: 'exact', head: true });
      if (error) throw error;
      if (count > 0) return false;
      await this._writeSeed();
      return true;
    }
    if (localStorage.getItem(this.KEYS.seeded)) return false;
    this._writeSeedLocal();
    try { localStorage.setItem(this.KEYS.seeded, '1'); } catch {}
    return true;
  },

  _seedData() {
    const users = [];
    const assets = [];
    const preventive = [];
    const corrective = [];

    return { users, assets, preventive, corrective };
  },

  async _writeSeed() {
    const { users, assets, preventive, corrective } = this._seedData();
    const nowIso = new Date().toISOString();

    await this._upsertRows('activos', assets.map(a => this._toAssetRow(a)));
    await this._upsertRows('mantenimientos', preventive.map(p => ({ ...this._toPreventiveRow(p), tipo: 'preventivo' })));
    await this._upsertRows('mantenimientos', corrective.map(c => ({ ...this._toCorrectiveRow(c), tipo: 'correctivo' })));
    await this._upsertSettingsRow({ currency: 'NIO', dateFormat: 'DD/MM/YYYY', alertDaysAhead: 7 });

    const vehicularTypes = ['Camión','Camioneta','Carro','Motocicleta','Cabezal','Remolque','Tractor'];
    const vehicles = assets
      .filter(a => vehicularTypes.includes(a.type))
      .map(a => ({ id: 'vh_' + a.id, code: a.code, tipo: a.type, marca: a.brand, modelo: a.model, anio: a.year, placa: a.plate, serial: a.serial, current_km: a.currentKm, status: a.status, notes: a.notes, created_at: nowIso, updated_at: nowIso }));

    await this._upsertRows('vehiculos', vehicles);
    await this._upsertRows('conductores', []);
    await this._upsertRows('documentos', []);

    console.log('[DB] Seed data subida a Supabase (v9)');
  },

  _writeSeedLocal() {
    const { users, assets, preventive, corrective } = this._seedData();
    this.set(this.KEYS.assets, assets);
    this.set(this.KEYS.preventive, preventive);
    this.set(this.KEYS.corrective, corrective);
    this.saveSettings({ currency: 'NIO', dateFormat: 'DD/MM/YYYY', alertDaysAhead: 7 });
    console.log('[DB] Seed data loaded successfully (v9)');
  },

  /* ====================================================
     Asset CRUD
     ==================================================== */
  getAssets()        { return this._cache.assets; },
  saveAssets(arr)    { this._cache.assets = arr || []; this._syncReplace('assets'); },
  addAsset(obj) {
    if (!obj || !obj.code || !obj.type || !obj.brand || !obj.model) {
      throw new Error('addAsset: campos requeridos faltantes (code, type, brand, model)');
    }
    const id = obj.id || this.newId();
    const code = obj.code;

    return this._enqueueRecord('assets', id, async () => {
      if (this._cache.assets.some(a => a.code === code)) {
        throw new Error('addAsset: código duplicado: ' + code);
      }
      if (this._cache.assets.some(a => a.id === id)) {
        throw new Error('addAsset: id duplicado: ' + id);
      }
      const record = {
        ...obj,
        id,
        createdAt: obj.createdAt || new Date().toISOString()
      };
      this._cache.assets.push(record);
      try {
        await this._persistInsertAsset(record);
        return record;
      } catch (err) {
        const idx = this._cache.assets.findIndex(r => r.id === id);
        if (idx >= 0) this._cache.assets.splice(idx, 1);
        throw err;
      }
    });
  },
  updateAsset(id, d) {
    return this._enqueueRecord('assets', id, async () => {
      const idx = this._cache.assets.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('updateAsset: activo no encontrado: ' + id);
      const previous = { ...this._cache.assets[idx] };
      this._cache.assets[idx] = { ...previous, ...d, updatedAt: new Date().toISOString() };
      try {
        await this._persistUpdateAsset(this._cache.assets[idx]);
      } catch (err) {
        const currentIdx = this._cache.assets.findIndex(r => r.id === id);
        if (currentIdx >= 0) {
          this._cache.assets[currentIdx] = previous;
        }
        throw err;
      }
    });
  },
  deleteAsset(id) {
    return this._enqueueRecord('assets', id, async () => {
      const idx = this._cache.assets.findIndex(a => a.id === id);
      if (idx < 0) throw new Error('deleteAsset: activo no encontrado: ' + id);
      const deleted = { ...this._cache.assets[idx] };
      const originalIndex = idx;
      this._cache.assets.splice(idx, 1);
      try {
        await this._persistDeleteAsset(id);
      } catch (err) {
        if (!this._cache.assets.some(r => r.id === id)) {
          const safeIdx = Math.min(originalIndex, this._cache.assets.length);
          this._cache.assets.splice(safeIdx, 0, deleted);
        }
        throw err;
      }
    });
  },
  getAsset(id)       { return this._cache.assets.find(x => x.id === id); },
  async bulkAddAssets(arr) {
    const ready = [];
    for (const obj of arr) {
      obj.id = obj.id || this.newId();
      obj.createdAt = obj.createdAt || new Date().toISOString();
      ready.push(obj);
    }
    this._cache.assets = this._cache.assets.concat(ready);
    if (this.mode === 'supabase' && this.supabase) {
      await this._async('bulk insert activos', () => this._upsertRows('activos', ready.map(a => this._toAssetRow(a))));
    } else {
      this._writeLS('assets');
    }
    return arr;
  },

  /* ====================================================
     Preventive CRUD
     ==================================================== */
  getPreventive()      { return this._cache.preventive; },
  savePreventive(arr)  { this._cache.preventive = arr || []; this._syncReplace('preventive'); },
  addPreventive(obj) {
    obj.id = obj.id || this.newId();
    obj.createdAt = obj.createdAt || new Date().toISOString();
    return this._enqueueRecord('preventive', obj.id, async () => {
      if (this._cache.preventive.some(a => a.id === obj.id)) {
        throw new Error('addPreventive: id duplicado: ' + obj.id);
      }
      const record = { ...obj };
      this._cache.preventive.push(record);
      try {
        await this._persistInsert('preventive', 'mantenimientos', record, this._toPreventiveRow.bind(this), { tipo: 'preventivo' });
        return record;
      } catch (err) {
        const idx = this._cache.preventive.findIndex(r => r.id === obj.id);
        if (idx >= 0) this._cache.preventive.splice(idx, 1);
        throw err;
      }
    });
  },
  updatePreventive(id, d) {
    return this._enqueueRecord('preventive', id, async () => {
      const idx = this._cache.preventive.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('updatePreventive: mantenimiento no encontrado: ' + id);
      const previous = { ...this._cache.preventive[idx] };
      this._cache.preventive[idx] = { ...previous, ...d, updatedAt: new Date().toISOString() };
      try {
        await this._persistUpdate('preventive', 'mantenimientos', this._cache.preventive[idx], this._toPreventiveRow.bind(this), { tipo: 'preventivo' });
      } catch (err) {
        const currentIdx = this._cache.preventive.findIndex(r => r.id === id);
        if (currentIdx >= 0) {
          this._cache.preventive[currentIdx] = previous;
        }
        throw err;
      }
    });
  },
  deletePreventive(id) {
    return this._enqueueRecord('preventive', id, async () => {
      const idx = this._cache.preventive.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('deletePreventive: mantenimiento no encontrado: ' + id);
      try {
        await this._persistDelete('preventive', 'mantenimientos', id);
        this._cache.preventive.splice(idx, 1);
      } catch (err) {
        throw err;
      }
    });
  },

  /* ====================================================
     Corrective CRUD
     ==================================================== */
  getCorrective()      { return this._cache.corrective; },
  saveCorrective(arr)  { this._cache.corrective = arr || []; this._syncReplace('corrective'); },
  addCorrective(obj) {
    obj.id = obj.id || this.newId();
    obj.createdAt = obj.createdAt || new Date().toISOString();
    return this._enqueueRecord('corrective', obj.id, async () => {
      if (this._cache.corrective.some(a => a.id === obj.id)) {
        throw new Error('addCorrective: id duplicado: ' + obj.id);
      }
      const record = { ...obj };
      this._cache.corrective.push(record);
      try {
        await this._persistInsert('corrective', 'mantenimientos', record, this._toCorrectiveRow.bind(this), { tipo: 'correctivo' });
        return record;
      } catch (err) {
        const idx = this._cache.corrective.findIndex(r => r.id === obj.id);
        if (idx >= 0) this._cache.corrective.splice(idx, 1);
        throw err;
      }
    });
  },
  updateCorrective(id, d) {
    return this._enqueueRecord('corrective', id, async () => {
      const idx = this._cache.corrective.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('updateCorrective: correctivo no encontrado: ' + id);
      const previous = { ...this._cache.corrective[idx] };
      this._cache.corrective[idx] = { ...previous, ...d, updatedAt: new Date().toISOString() };
      try {
        await this._persistUpdate('corrective', 'mantenimientos', this._cache.corrective[idx], this._toCorrectiveRow.bind(this), { tipo: 'correctivo' });
      } catch (err) {
        const currentIdx = this._cache.corrective.findIndex(r => r.id === id);
        if (currentIdx >= 0) {
          this._cache.corrective[currentIdx] = previous;
        }
        throw err;
      }
    });
  },
  deleteCorrective(id) {
    return this._enqueueRecord('corrective', id, async () => {
      const idx = this._cache.corrective.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('deleteCorrective: correctivo no encontrado: ' + id);
      try {
        await this._persistDelete('corrective', 'mantenimientos', id);
        this._cache.corrective.splice(idx, 1);
      } catch (err) {
        throw err;
      }
    });
  },

  /* ====================================================
     Audit log
     ==================================================== */
  getAudit() { return this._cache.audit; },
  addAudit(entry) {
    entry.id = this.newId();
    entry.ts = new Date().toISOString();
    const a = this._cache.audit;
    a.unshift(entry);
    if (a.length > 500) a.length = 500;
    const row = { id: entry.id, user_name: entry.user || '', action: entry.action || '', detail: entry.detail || '', ts: entry.ts };
    this._persistAuditRow(row).catch(err => console.warn('[DB] Auditoría no disponible:', err.message));
  },

  /* ====================================================
     Settings
     ==================================================== */
  getSettings() { return this._cache.settings; },
  async saveSettings(s) {
    const nextSettings = { currency: 'NIO', dateFormat: 'DD/MM/YYYY', alertDaysAhead: 7, ...s };
    await this._syncUpsertSettings(nextSettings);
    this._cache.settings = nextSettings;
    return nextSettings;
  },

  /* ====================================================
     Expenses CRUD
     ==================================================== */
  getExpenses()       { return this._cache.expenses; },
  saveExpenses(arr)   { this._cache.expenses = arr || []; this._syncReplace('expenses'); },
  addExpense(obj) {
    obj.id = obj.id || this.newId();
    obj.createdAt = obj.createdAt || new Date().toISOString();
    return this._enqueueRecord('expenses', obj.id, async () => {
      if (this._cache.expenses.some(a => a.id === obj.id)) {
        throw new Error('addExpense: id duplicado: ' + obj.id);
      }
      const record = { ...obj };
      this._cache.expenses.push(record);
      try {
        await this._persistInsert('expenses', 'gastos', record, this._toExpenseRow.bind(this));
        return record;
      } catch (err) {
        const idx = this._cache.expenses.findIndex(r => r.id === obj.id);
        if (idx >= 0) this._cache.expenses.splice(idx, 1);
        throw err;
      }
    });
  },
  updateExpense(id, d) {
    return this._enqueueRecord('expenses', id, async () => {
      const idx = this._cache.expenses.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('updateExpense: gasto no encontrado: ' + id);
      const previous = { ...this._cache.expenses[idx] };
      this._cache.expenses[idx] = { ...previous, ...d };
      try {
        await this._persistUpdate('expenses', 'gastos', this._cache.expenses[idx], this._toExpenseRow.bind(this));
      } catch (err) {
        const currentIdx = this._cache.expenses.findIndex(r => r.id === id);
        if (currentIdx >= 0) {
          this._cache.expenses[currentIdx] = previous;
        }
        throw err;
      }
    });
  },
  deleteExpense(id) {
    return this._enqueueRecord('expenses', id, async () => {
      const idx = this._cache.expenses.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('deleteExpense: gasto no encontrado: ' + id);
      const deleted = { ...this._cache.expenses[idx] };
      const originalIndex = idx;
      this._cache.expenses.splice(idx, 1);
      try {
        await this._persistDelete('expenses', 'gastos', id);
      } catch (err) {
        if (!this._cache.expenses.some(r => r.id === id)) {
          const safeIdx = Math.min(originalIndex, this._cache.expenses.length);
          this._cache.expenses.splice(safeIdx, 0, deleted);
        }
        throw err;
      }
    });
  },

  /* ====================================================
     Vehículos CRUD
     ==================================================== */
  getVehiculos()      { return this._cache.vehicles; },
  saveVehiculos(arr)  { this._cache.vehicles = arr || []; this._syncReplace('vehicles'); },
  addVehiculo(obj) {
    obj.id = obj.id || this.newId();
    obj.created_at = obj.created_at || new Date().toISOString();
    this._cache.vehicles.push(obj);
    this._syncUpsertRow('vehiculos', obj, 'vehicles');
    return obj;
  },
  updateVehiculo(id, d) {
    const i = this._cache.vehicles.findIndex(x => x.id === id);
    if (i < 0) return;
    this._cache.vehicles[i] = { ...this._cache.vehicles[i], ...d, updated_at: new Date().toISOString() };
    this._syncUpsertRow('vehiculos', this._cache.vehicles[i], 'vehicles');
  },
  deleteVehiculo(id)  { this._cache.vehicles = this._cache.vehicles.filter(x => x.id !== id); this._syncDeleteRow('vehiculos', id, 'vehicles'); },

  /* ====================================================
     Conductores CRUD
     ==================================================== */
  getConductores()       { return this._cache.drivers; },
  saveConductores(arr)   { this._cache.drivers = arr || []; this._syncReplace('drivers'); },
  addConductor(obj) {
    obj.id = obj.id || this.newId();
    obj.created_at = obj.created_at || new Date().toISOString();
    this._cache.drivers.push(obj);
    this._syncUpsertRow('conductores', obj, 'drivers');
    return obj;
  },
  updateConductor(id, d) {
    const i = this._cache.drivers.findIndex(x => x.id === id);
    if (i < 0) return;
    this._cache.drivers[i] = { ...this._cache.drivers[i], ...d, updated_at: new Date().toISOString() };
    this._syncUpsertRow('conductores', this._cache.drivers[i], 'drivers');
  },
  deleteConductor(id)  { this._cache.drivers = this._cache.drivers.filter(x => x.id !== id); this._syncDeleteRow('conductores', id, 'drivers'); },

  /* ====================================================
     Documentos CRUD
     ==================================================== */
  getDocumentos()       { return this._cache.documents; },
  saveDocumentos(arr)   { this._cache.documents = arr || []; this._syncReplace('documents'); },
  addDocumento(obj) {
    obj.id = obj.id || this.newId();
    obj.created_at = obj.created_at || new Date().toISOString();
    this._cache.documents.push(obj);
    this._syncUpsertRow('documentos', obj, 'documents');
    return obj;
  },
  updateDocumento(id, d) {
    const i = this._cache.documents.findIndex(x => x.id === id);
    if (i < 0) return;
    this._cache.documents[i] = { ...this._cache.documents[i], ...d, updated_at: new Date().toISOString() };
    this._syncUpsertRow('documentos', this._cache.documents[i], 'documents');
  },
  deleteDocumento(id)  { this._cache.documents = this._cache.documents.filter(x => x.id !== id); this._syncDeleteRow('documentos', id, 'documents'); },

  /* ====================================================
     Alertas (módulo independiente)
     ==================================================== */
  getAlertas() { return this._cache.alerts; },
  saveAlertas(arr) { this._cache.alerts = arr || []; this._syncReplace('alerts'); },
  addAlerta(obj) {
    obj.id = obj.id || this.newId();
    obj.createdAt = obj.createdAt || new Date().toISOString();
    return this._enqueueRecord('alerts', obj.id, async () => {
      if (this._cache.alerts.some(a => a.id === obj.id)) {
        throw new Error('addAlerta: id duplicado: ' + obj.id);
      }
      const record = { ...obj };
      this._cache.alerts.push(record);
      try {
        await this._persistInsert('alerts', 'alertas', record, this._toAlertRow.bind(this));
        return record;
      } catch (err) {
        const idx = this._cache.alerts.findIndex(r => r.id === obj.id);
        if (idx >= 0) this._cache.alerts.splice(idx, 1);
        throw err;
      }
    });
  },
  updateAlerta(id, d) {
    return this._enqueueRecord('alerts', id, async () => {
      const idx = this._cache.alerts.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('updateAlerta: alerta no encontrada: ' + id);
      const previous = { ...this._cache.alerts[idx] };
      this._cache.alerts[idx] = { ...previous, ...d, updatedAt: new Date().toISOString() };
      try {
        await this._persistUpdate('alerts', 'alertas', this._cache.alerts[idx], this._toAlertRow.bind(this));
      } catch (err) {
        const currentIdx = this._cache.alerts.findIndex(r => r.id === id);
        if (currentIdx >= 0) {
          this._cache.alerts[currentIdx] = previous;
        }
        throw err;
      }
    });
  },
  deleteAlerta(id) {
    return this._enqueueRecord('alerts', id, async () => {
      const idx = this._cache.alerts.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('deleteAlerta: alerta no encontrada: ' + id);
      try {
        await this._persistDelete('alertas', 'alertas', id);
        this._cache.alerts.splice(idx, 1);
      } catch (err) {
        throw err;
      }
    });
  },
  clearAlertas() {
    this._cache.alerts = [];
    this._syncReplace('alerts');
  },

  /* ====================================================
     Reset / restablecer datos de ejemplo
     ==================================================== */
  async resetData() {
    const tables = ['activos','mantenimientos','auditoria','configuracion','gastos','vehiculos','conductores','alertas','documentos'];
    if (this.mode === 'supabase' && this.supabase) {
      for (const t of tables) {
        try { await this.supabase.from(t).delete().neq('id', '__none__'); }
        catch (e) { console.error('[DB] reset', t, e); }
      }
    } else {
      Object.values(this.KEYS).forEach(k => { try { localStorage.removeItem(k); } catch {} });
    }
    this._resetCache();
    await this.seed();
    if (this.mode === 'supabase') await this._loadAllFromSupabase();
  },

  /* ====================================================
     Sincronización con Supabase (escrituras)
     ==================================================== */
  _syncUpsertRow(table, row, coll) {
    if (this.mode !== 'supabase' || !this.supabase) {
      if (coll) this._writeLS(coll);
      return;
    }
    this._async(`upsert ${table}`, () =>
      this.supabase.from(table).upsert([row], { onConflict: 'id' }).then(({ error }) => { if (error) throw error; })
    );
  },

  _persistAuditRow(row) {
    if (this.mode !== 'supabase' || !this.supabase) {
      return Promise.resolve();
    }
    return this.supabase.from('auditoria').insert([row]).then(({ error }) => {
      if (error) throw error;
    });
  },

  _syncDeleteRow(table, id, coll) {
    if (this.mode !== 'supabase' || !this.supabase) {
      if (coll) this._writeLS(coll);
      return;
    }
    this._async(`delete ${table}`, () =>
      this.supabase.from(table).delete().eq('id', id).then(({ error }) => { if (error) throw error; })
    );
  },

  _syncUpsertSettings(s) {
    if (this.mode !== 'supabase' || !this.supabase) {
      try { localStorage.setItem(this.KEYS.settings, JSON.stringify(s)); } catch {}
      return Promise.resolve();
    }
    return this._async('upsert configuracion', () => this._upsertSettingsRow(s));
  },

  _syncReplace(ck) {
    if (ck === 'settings') { this._syncUpsertSettings(this._cache.settings); return; }
    if (ck === 'preventive' || ck === 'corrective') {
      this._syncReplaceMaintenance(ck === 'preventive' ? 'preventivo' : 'correctivo', this._cache[ck] || []);
      return;
    }
    const table = this.TABLES[ck];
    if (!table) return;

    if (this.mode !== 'supabase' || !this.supabase) { this._writeLS(ck); return; }

    this._async(`replace ${table}`, async () => {
      const { error: delErr } = await this.supabase.from(table).delete().neq('id', '__none__');
      if (delErr) throw delErr;
      const rows = (this._cache[ck] || []).map(r => this._toRow(ck, r));
      if (rows.length) {
        const { error: insErr } = await this.supabase.from(table).insert(rows);
        if (insErr) throw insErr;
      }
    });
  },

  _syncReplaceMaintenance(tipo, rows) {
    if (this.mode !== 'supabase' || !this.supabase) {
      this._writeLS(tipo === 'preventivo' ? 'preventive' : 'corrective');
      return;
    }
    this._async(`replace mantenimientos ${tipo}`, async () => {
      const { error: delErr } = await this.supabase.from('mantenimientos').delete().eq('tipo', tipo);
      if (delErr) throw delErr;
      if (rows.length) {
        const mapped = rows.map(r => tipo === 'preventivo'
          ? { ...this._toPreventiveRow(r), tipo: 'preventivo' }
          : { ...this._toCorrectiveRow(r), tipo: 'correctivo' });
        const { error: insErr } = await this.supabase.from('mantenimientos').insert(mapped);
        if (insErr) throw insErr;
      }
    });
  },

  /* ====================================================
     Caché y respaldo LocalStorage
     ==================================================== */
  _resetCache() {
    this._cache = {
      assets: [], preventive: [], corrective: [], audit: [],
      expenses: [], vehicles: [], drivers: [], alerts: [], documents: [],
      settings: { currency: 'NIO', dateFormat: 'DD/MM/YYYY', alertDaysAhead: 7 },
    };
  },

  _loadFromLocalStorage() {
    const read = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } };
    this._cache.assets     = read(this.KEYS.assets, []);
    this._cache.preventive = read(this.KEYS.preventive, []);
    this._cache.corrective = read(this.KEYS.corrective, []);
    this._cache.audit      = read(this.KEYS.audit, []);
    this._cache.expenses   = read(this.KEYS.expenses, []);
    this._cache.vehicles   = read(this.KEYS.vehicles, []);
    this._cache.drivers    = read(this.KEYS.drivers, []);
    this._cache.documents  = read(this.KEYS.documents, []);
    this._cache.alerts     = read(this.KEYS.alerts, []);
    this._cache.settings   = read(this.KEYS.settings, { currency: 'NIO', dateFormat: 'DD/MM/YYYY', alertDaysAhead: 7 });
  },

  _keyToCache(key) {
    return {
      [this.KEYS.assets]: 'assets', [this.KEYS.preventive]: 'preventive', [this.KEYS.corrective]: 'corrective',
      [this.KEYS.audit]: 'audit', [this.KEYS.settings]: 'settings',
      [this.KEYS.expenses]: 'expenses', [this.KEYS.vehicles]: 'vehicles', [this.KEYS.drivers]: 'drivers',
      [this.KEYS.documents]: 'documents', [this.KEYS.alerts]: 'alerts',
    }[key] || null;
  },

  _cacheKeyToLS(ck) {
    return {
      assets: this.KEYS.assets, preventive: this.KEYS.preventive, corrective: this.KEYS.corrective,
      audit: this.KEYS.audit, expenses: this.KEYS.expenses,
      vehicles: this.KEYS.vehicles, drivers: this.KEYS.drivers, documents: this.KEYS.documents,
      alerts: this.KEYS.alerts,
    }[ck] || null;
  },

  _writeLS(ck) {
    const key = this._cacheKeyToLS(ck);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(this._cache[ck] || [])); } catch (e) { console.error(e); }
  },

  /* â”€â”€ Escritura LocalStorage estricta para helpers con rollback (propaga errores) â”€â”€ */
  _writeLSStrict(ck) {
    const key = this._cacheKeyToLS(ck);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(this._cache[ck] || []));
  },

  /* â”€â”€ Persistencia según modo para helpers de Activos (evita duplicar _sync*) â”€â”€ */
  _persistInsertAsset(record) {
    if (this.mode !== 'supabase' || !this.supabase) {
      this._writeLSStrict('assets');
      return Promise.resolve({ success: true, local: true });
    }
    return this._syncUpsertRow('activos', this._toAssetRow(record), 'assets');
  },

  _persistUpdateAsset(record) {
    if (this.mode !== 'supabase' || !this.supabase) {
      this._writeLSStrict('assets');
      return Promise.resolve({ success: true, local: true });
    }
    return this._syncUpsertRow('activos', this._toAssetRow(record), 'assets');
  },

_persistDeleteAsset(id) {
    if (this.mode !== 'supabase' || !this.supabase) {
      this._writeLSStrict('assets');
      return Promise.resolve({ success: true, local: true });
    }
    return this._syncDeleteRow('activos', id, 'assets');
  },

  /* â”€â”€ Helpers genéricos de persistencia (reutilizan _enqueueRecord) â”€â”€ */
  _persistInsert(collection, table, record, toRowFn, extraFields = {}) {
    if (this.mode !== 'supabase' || !this.supabase) {
      this._writeLSStrict(collection);
      return Promise.resolve({ success: true, local: true });
    }
    const row = toRowFn(record);
    Object.assign(row, extraFields);
    return this._syncUpsertRow(table, row, collection);
  },

  _persistUpdate(collection, table, record, toRowFn, extraFields = {}) {
    if (this.mode !== 'supabase' || !this.supabase) {
      this._writeLSStrict(collection);
      return Promise.resolve({ success: true, local: true });
    }
    const row = toRowFn(record);
    Object.assign(row, extraFields);
    return this._syncUpsertRow(table, row, collection);
  },

  _persistDelete(collection, table, id) {
    if (this.mode !== 'supabase' || !this.supabase) {
      this._writeLSStrict(collection);
      return Promise.resolve({ success: true, local: true });
    }
    return this._syncDeleteRow(table, id, collection);
  },

  /* ====================================================
     Mapeo de filas (snake_case en Supabase ↔ camelCase en la app)
     ==================================================== */
  _toRow(ck, obj) {
    switch (ck) {
      case 'assets':     return this._toAssetRow(obj);
      case 'preventive': return { ...this._toPreventiveRow(obj), tipo: 'preventivo' };
      case 'corrective': return { ...this._toCorrectiveRow(obj), tipo: 'correctivo' };
      case 'audit':      return { id: obj.id, user_name: obj.user || '', action: obj.action || '', detail: obj.detail || '', ts: obj.ts };
      case 'expenses':   return this._toExpenseRow(obj);
      case 'alerts':     return this._toAlertRow(obj);
      default:           return obj;
    }
  },

  _fromRow(ck, row) {
    switch (ck) {
      case 'assets':     return this._fromAssetRow(row);
      case 'preventive': return this._fromPreventiveRow(row);
      case 'corrective': return this._fromCorrectiveRow(row);
      case 'audit':      return { ...row, user: row.user_name };
      case 'expenses':   return this._fromExpenseRow(row);
      case 'alerts':     return this._fromAlertRow(row);
      default:           return row;
    }
  },

  _toAssetRow(a) {
    return {
      id: a.id, code: a.code, tipo: a.type, marca: a.brand, modelo: a.model, anio: a.year,
      placa: a.plate || '', serial: a.serial || '', location: a.location || '', area: a.area || '',
      localidad: a.localidad || '', departamento: a.departamento || '', usuario: a.usuario || '',
      responsible: a.responsible || '', status: a.status || 'operativo',
      current_km: parseFloat(a.currentKm) || 0, current_hours: parseFloat(a.currentHours) || 0,
      inspection_date: a.inspectionDate || null, notes: a.notes || '',
      created_at: a.createdAt, updated_at: a.updatedAt,
    };
  },

  _fromAssetRow(r) {
    return {
      id: r.id, code: r.code, type: r.tipo, brand: r.marca, model: r.modelo, year: r.anio,
      plate: r.placa, serial: r.serial, location: r.location, area: r.area,
      localidad: r.localidad, departamento: r.departamento, usuario: r.usuario,
      responsible: r.responsible, status: r.status,
      currentKm: parseFloat(r.current_km) || 0, currentHours: parseFloat(r.current_hours) || 0,
      inspectionDate: r.inspection_date || '', notes: r.notes || '',
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  },

  _toPreventiveRow(o) {
    return {
      id: o.id, activo_id: o.assetId, activo_code: o.assetCode, service_type: o.type,
      frequency: o.frequency, frequency_value: o.frequencyValue,
      last_done_km: o.lastDoneKm, last_done_date: o.lastDoneDate,
      next_due_km: o.nextDueKm, next_due_hours: o.nextDueHours, next_due_date: o.nextDueDate,
      tech_name: o.techName, cost: o.cost, labor_cost: o.laborCost, parts_cost: o.partsCost,
      parts: o.parts, observations: o.observations, plant: o.plant, provider: o.provider || '',
      created_at: o.createdAt, updated_at: o.updatedAt,
    };
  },

  _fromPreventiveRow(r) {
    return {
      id: r.id, assetId: r.activo_id, assetCode: r.activo_code, type: r.service_type,
      tipo: 'preventivo',
      frequency: r.frequency, frequencyValue: r.frequency_value,
      lastDoneKm: r.last_done_km, lastDoneDate: r.last_done_date,
      nextDueKm: r.next_due_km, nextDueHours: r.next_due_hours, nextDueDate: r.next_due_date,
      techName: r.tech_name, cost: r.cost, laborCost: r.labor_cost, partsCost: r.parts_cost,
      parts: r.parts, observations: r.observations, plant: r.plant, provider: r.provider || '',
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  },

  _toCorrectiveRow(o) {
    return {
      id: o.id, activo_id: o.assetId, activo_code: o.assetCode,
      service_type: o.failureType, failure_date: o.failureDate, failure_category: o.failureCategory,
      description: o.description, downtime_hours: o.downtimeHours, repair_date: o.repairDate,
      provider: o.provider, last_done_km: o.meterKm || null, last_done_hours: o.meterHours || null,
      labor_cost: o.laborCost, parts_cost: o.partsCost, cost: o.totalCost,
      root_cause: o.rootCause, corrective_actions: o.correctiveActions, status: o.status,
      plant: o.plant, responsible: o.responsible, created_at: o.createdAt, updated_at: o.updatedAt,
    };
  },

  _fromCorrectiveRow(r) {
    return {
      id: r.id, assetId: r.activo_id, assetCode: r.activo_code,
      tipo: 'correctivo',
      failureDate: r.failure_date, failureType: r.service_type, failureCategory: r.failure_category,
      description: r.description, downtimeHours: r.downtime_hours, repairDate: r.repair_date,
      provider: r.provider, meterKm: r.last_done_km || null, meterHours: r.last_done_hours || null,
      laborCost: r.labor_cost, partsCost: r.parts_cost, totalCost: r.cost,
      rootCause: r.root_cause, correctiveActions: r.corrective_actions, status: r.status,
      plant: r.plant, responsible: r.responsible, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  },

  _toExpenseRow(e) {
    return {
      id: e.id, date: e.date || null, category: e.category || '', amount: e.amount || 0,
      asset_id: e.assetId || null, description: e.description || '',
      cost_center: e.costCenter || '', plant: e.plant || '', provider: e.provider || '', invoice: e.invoice || '',
      created_at: e.createdAt, updated_at: e.updatedAt,
    };
  },

  _fromExpenseRow(r) {
    return {
      id: r.id, date: r.date, category: r.category, amount: r.amount, assetId: r.asset_id,
      description: r.description, costCenter: r.cost_center, plant: r.plant,
      provider: r.provider, invoice: r.invoice, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  },

  /* â”€â”€ Alertas: el objeto completo se guarda como JSON en `mensaje`,
     con campos de resumen en las columnas estándar (compatible con el esquema actual) â”€â”€ */
  _toAlertRow(a) {
    return {
      id: a.id,
      tipo: a.tipoMantenimiento || a.tipo || '',
      severity: a.severity || 'info',
      titulo: `${a.tipoMantenimiento || 'Alerta'} â€” ${a.vehiculo || ''}`.trim(),
      mensaje: JSON.stringify({
        assetId: a.assetId || null,
        vehiculo: a.vehiculo || '',
        tipoVehiculo: a.tipoVehiculo || '',
        currentKm: a.currentKm || 0,
        tipoMantenimiento: a.tipoMantenimiento || '',
        fecha: a.fecha || '',
        estado: a.estado || 'Pendiente',
        usuario: a.usuario || '',
        area: a.area || '',
        departamento: a.departamento || '',
        localidad: a.localidad || '',
        placa: a.placa || '',
        intervaloKm: a.intervaloKm || 0,
        nextKm: a.nextKm || 0,
        remainingKm: a.remainingKm || 0,
        severity: a.severity || 'info',
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }),
      module: 'alerts',
      activo_id: a.assetId || a.vehiculo || null,
      fecha: a.fecha || null,
      leida: false,
      created_at: a.createdAt,
    };
  },

  _fromAlertRow(r) {
    let d = {};
    try { d = JSON.parse(r.mensaje || '{}'); } catch (e) { d = {}; }
    return {
      id: r.id,
      assetId: d.assetId || null,
      vehiculo: d.vehiculo || r.activo_id || '',
      tipoVehiculo: d.tipoVehiculo || '',
      currentKm: parseFloat(d.currentKm) || 0,
      tipoMantenimiento: d.tipoMantenimiento || r.tipo || '',
      fecha: d.fecha || r.fecha || '',
      estado: d.estado || 'Pendiente',
      usuario: d.usuario || '',
      area: d.area || '',
      departamento: d.departamento || '',
      localidad: d.localidad || '',
      placa: d.placa || '',
      intervaloKm: parseFloat(d.intervaloKm) || 0,
      nextKm: parseFloat(d.nextKm) || 0,
      remainingKm: parseFloat(d.remainingKm) || 0,
      severity: d.severity || r.severity || 'info',
      createdAt: d.createdAt || r.created_at,
      updatedAt: d.updatedAt || r.created_at,
    };
  },

  /* ====================================================
     KPI Calculation Engine (sin cambios de lógica)
     ==================================================== */
  calcKPIs(f = {}) {
    let assets = this.getAssets();

    if (f.area)         assets = assets.filter(a => a.area === f.area);
    if (f.localidad)    assets = assets.filter(a => a.localidad === f.localidad);
    if (f.departamento) assets = assets.filter(a => a.departamento === f.departamento);

    const validAssetIds = new Set(assets.map(a => a.id));
    const assetById     = new Map(assets.map(a => [a.id, a]));

    const preventive = this.getPreventive().filter(p => validAssetIds.has(p.assetId));
    const corrective = this.getCorrective().filter(c => validAssetIds.has(c.assetId));
    const now        = new Date();

    const expenses = [];
    preventive.forEach(p => expenses.push({ date: p.lastDoneDate, amount: p.cost, assetId: p.assetId, category: 'preventivo' }));
    corrective.forEach(c => expenses.push({ date: c.repairDate, amount: c.totalCost, assetId: c.assetId, category: 'correctivo' }));

    // Motor financiero F4.5: agregación con parseo estricto y fechas financieras
    const financials = this._aggregateFinancials(preventive, corrective, now, f);
    const {
      monthlyPreventiveCost,
      monthlyCorrectiveCost,
      annualPreventiveCost,
      annualCorrectiveCost,
      monthCost,
      yearCost,
      preventiveCostPct,
      correctiveCostPct,
      hasCostDistribution,
      avgPositiveMaintenanceCost,
      topAssetsByMaintenanceCost,
      financialCoverage
    } = financials;

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const correctiveYear = corrective.filter(c => new Date(c.failureDate) >= yearStart);
    const totalDownHrs = correctiveYear.reduce((s, c) => s + (parseFloat(c.downtimeHours)||0), 0);
    const totalEquip   = assets.length || 1;
    const totalAvailHrs = totalEquip * 8760;
    const disponibilidad = Math.max(0, Math.min(100, ((totalAvailHrs - totalDownHrs) / totalAvailHrs * 100)));

    const failures = corrective.length || 1;
    const totalRepairHrs = corrective.reduce((s,c)=>s+(parseFloat(c.downtimeHours)||0),0);
    const totalOperHrs   = totalAvailHrs - totalDownHrs;
    const mtbf = totalOperHrs / failures;
    const mttr = totalRepairHrs / failures;

    const totalCost = expenses.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    const thisMonth = expenses.filter(e=>{const d=new Date(e.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
    const thisYear  = expenses.filter(e=>new Date(e.date).getFullYear()===now.getFullYear());

    const totalMaint = preventive.length + corrective.length || 1;
    const preventPct = Math.round(preventive.length / totalMaint * 100);

    const kpiToday = new Date(); kpiToday.setHours(0,0,0,0);
    const kpiSoon  = new Date(kpiToday); kpiSoon.setDate(kpiSoon.getDate()+7);
    let overdue = 0, upcomingSoon = 0;
    preventive.forEach(p => {
      const a = assetById.get(p.assetId);
      if (p.frequency === 'km' && p.nextDueKm && a) {
        if ((parseFloat(a.currentKm)||0) >= p.nextDueKm) overdue++;
        else if ((parseFloat(a.currentKm)||0) >= p.nextDueKm - 500) upcomingSoon++;
      } else if (p.frequency === 'hours' && p.nextDueHours && a) {
        if ((parseFloat(a.currentHours)||0) >= p.nextDueHours) overdue++;
        else if ((parseFloat(a.currentHours)||0) >= p.nextDueHours - 50) upcomingSoon++;
      } else if (p.nextDueDate) {
        const due = new Date(p.nextDueDate);
        if (due < kpiToday) overdue++;
        else if (due <= kpiSoon) upcomingSoon++;
      }
    });
    assets.forEach(a => {
      if (a.inspectionDate) {
        const inspDays = Math.ceil((new Date(a.inspectionDate) - kpiToday) / 86400000);
        if (inspDays < 0) overdue++;
        else if (inspDays <= 7) upcomingSoon++;
      }
    });

    const totalHrs = assets.reduce((s,a)=>s+(parseFloat(a.currentHours)||0),0) || 1;
    const totalKm  = assets.reduce((s,a)=>s+(parseFloat(a.currentKm)||0),0) || 1;
    const costPerHr = totalCost / totalHrs;
    const costPerKm = totalCost / totalKm;

    const costByEquip = {};
    expenses.forEach(e => {
      if (!e.assetId) return;
      costByEquip[e.assetId] = (costByEquip[e.assetId]||0) + (parseFloat(e.amount)||0);
    });
    const topEquip = Object.entries(costByEquip)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,10)
      .map(([id,cost])=>({ asset: assetById.get(id), cost }))
      .filter(x=>x.asset);

    const failsByEquip = {};
    corrective.forEach(c=>{
      if(!c.assetId) return;
      failsByEquip[c.assetId] = (failsByEquip[c.assetId]||0)+1;
    });
    const topFails = Object.entries(failsByEquip)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,5)
      .map(([id,cnt])=>({ asset: assetById.get(id), count: cnt }))
      .filter(x=>x.asset);

    const monthlyCosts = [];
    for(let i=11;i>=0;i--){
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const mon = expenses.filter(e=>{
        if (!e.date) return false;
        const ed=new Date(e.date);
        return ed.getMonth()===d.getMonth()&&ed.getFullYear()===d.getFullYear();
      });
      monthlyCosts.push({
        label: d.toLocaleDateString('es',{month:'short',year:'2-digit'}),
        total: mon.reduce((s,e)=>s+(parseFloat(e.amount)||0),0),
        preventive: mon.filter(e=>e.category==='preventivo').reduce((s,e)=>s+(parseFloat(e.amount)||0),0),
        corrective: mon.filter(e=>e.category==='correctivo').reduce((s,e)=>s+(parseFloat(e.amount)||0),0),
        fuel: 0,
      });
    }

    const catCosts = {};
    expenses.forEach(e=>{
      catCosts[e.category] = (catCosts[e.category]||0)+(parseFloat(e.amount)||0);
    });

    const fuelByAsset = {};
    expenses.filter(e=>e.category==='combustible').forEach(e=>{
      fuelByAsset[e.assetId] = (fuelByAsset[e.assetId]||0)+(parseFloat(e.amount)||0);
    });

    return {
      disponibilidad: disponibilidad.toFixed(1),
      mtbf: mtbf.toFixed(1),
      mttr: mttr.toFixed(1),
      totalCost, monthCost, yearCost,
      preventPct, correctivePct: 100-preventPct,
      overdue, upcomingSoon,
      costPerHr: costPerHr.toFixed(2),
      costPerKm: costPerKm.toFixed(2),
      topEquip, topFails,
      monthlyCosts, catCosts, fuelByAsset,
      totalAssets: assets.length,
      operativeAssets: assets.filter(a=>a.status==='operativo').length,
      inMaintAssets: assets.filter(a=>a.status==='mantenimiento').length,
      failedAssets: assets.filter(a=>a.status==='fuera').length,
      totalCorrectiveThisYear: correctiveYear.length,
      assets,
      corrective,
      // Nuevas propiedades financieras F4.5
      monthlyPreventiveCost,
      monthlyCorrectiveCost,
      annualPreventiveCost,
      annualCorrectiveCost,
      preventiveCostPct,
      correctiveCostPct,
      hasCostDistribution,
      avgPositiveMaintenanceCost,
      topAssetsByMaintenanceCost,
      financialCoverage
    };
  },
};
