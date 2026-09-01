/* ====================================================
   REPORTS MODULE
   ==================================================== */

const ReportsModule = {
  filter: { dateFrom:'', dateTo:'', plant:'', type:'', responsible:'', status:'', asset:'' },
  reportType: 'assets',

  render() {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>📄 Reportes</h2>
        <p>Generación y exportación de reportes de la flota</p>
      </div>
    </div>

    <!-- Report type selector -->
    <div class="tabs mb-16">
      ${[
        ['assets','🚛 Activos'],['preventive','🔧 Mantenimiento Preventivo'],
        ['corrective','⚠️ Correctivo'],['kpis','📊 KPIs']
      ].map(([id,label])=>`<button class="tab-btn ${this.reportType===id?'active':''}" onclick="ReportsModule.setType('${id}')">${label}</button>`).join('')}
    </div>

    <!-- Filters -->
    <div class="card mb-16">
      <div class="card-header">
        <div class="card-title">🔍 Filtros del Reporte</div>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Fecha Desde</label>
          <input class="form-control" type="date" id="rf-from" value="${this.filter.dateFrom}" onchange="ReportsModule.setFilter('dateFrom',this.value)">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha Hasta</label>
          <input class="form-control" type="date" id="rf-to" value="${this.filter.dateTo}" onchange="ReportsModule.setFilter('dateTo',this.value)">
        </div>
        <div class="form-group">
        <label class="form-label">Activo (búsqueda)</label>
        <input class="form-control" id="rf-asset" list="rf-assets-list" placeholder="Código, placa, marca o modelo..." value="${this.filter.asset}" oninput="ReportsModule.setFilter('asset',this.value)">
        <datalist id="rf-assets-list">
          ${DB.getAssets().map(a=>`<option value="${a.code}">${[a.plate,a.brand,a.model].filter(Boolean).join(' · ')||a.code}</option>`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label class="form-label">Planta</label>
        <select class="form-control" onchange="ReportsModule.setFilter('plant',this.value)">
            <option value="">Todas las plantas</option>
            ${['Planta Norte','Planta Sur','Bodega Central','Finca Sur'].map(p=>`<option ${this.filter.plant===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Equipo</label>
          <select class="form-control" onchange="ReportsModule.setFilter('type',this.value)">
            <option value="">Todos los tipos</option>
            ${['Camión','Camioneta','Carro','Motocicleta','Montacarga','Cabezal','Remolque','Tractor','Generador','Equipo Industrial'].map(t=>`<option ${this.filter.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-control" onchange="ReportsModule.setFilter('status',this.value)">
            <option value="">Todos</option>
            <option value="operativo">Operativo</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="fuera">Fuera de Servicio</option>
            <option value="done">Completado</option>
            <option value="overdue">Vencido</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Responsable</label>
          <input class="form-control" id="rf-resp" placeholder="Nombre..." onchange="ReportsModule.setFilter('responsible',this.value)">
        </div>
      </div>
      <div class="flex-between mt-8" style="gap:10px">
        <div class="text-sm text-muted" id="rep-count"></div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" onclick="ReportsModule.exportExcel()">📥 Exportar Excel</button>
          <button class="btn btn-primary" onclick="ReportsModule.exportPDF()">📄 Exportar PDF</button>
        </div>
      </div>
    </div>

    <!-- Report preview -->
    <div class="card" id="report-preview"></div>`;
  },

  setType(type) {
    this.reportType = type;
    App.navigate('reports');
  },

  setFilter(key, val) {
    this.filter[key] = val;
    this.renderPreview();
  },

  init() {
    this.renderPreview();
  },

  getFilteredData() {
    const f = this.filter;
    const filterByDate = (items, field) => {
      let data = items;
      if (f.dateFrom) data = data.filter(i => (i[field]||'') >= f.dateFrom);
      if (f.dateTo)   data = data.filter(i => (i[field]||'') <= f.dateTo);
      return data;
    };

    switch (this.reportType) {
      case 'assets': {
        let data = DB.getAssets();
        if (f.type)    data = data.filter(a=>a.type===f.type);
        if (f.status)  data = data.filter(a=>a.status===f.status);
        if (f.plant)   data = data.filter(a=>a.location===f.plant);
        if (f.responsible) data = data.filter(a=>a.responsible?.toLowerCase().includes(f.responsible.toLowerCase()));
        if (f.asset) {
          const q = f.asset.toLowerCase();
          data = data.filter(a=>[a.code,a.plate,a.brand,a.model,a.type].filter(Boolean).some(v=>v.toLowerCase().includes(q)) || `${a.code} ${a.plate||''}`.toLowerCase().includes(q));
        }
        return data;
      }
      case 'preventive': {
        let data = filterByDate(DB.getPreventive(), 'lastDoneDate');
        if (f.plant)  data = data.filter(p=>p.plant===f.plant);
        if (f.asset)  data = data.filter(p=>(p.assetCode||'').toLowerCase().includes(f.asset.toLowerCase()));
        return data;
      }
      case 'corrective': {
        let data = filterByDate(DB.getCorrective(), 'failureDate');
        if (f.status) data = data.filter(c=>c.status===f.status);
        if (f.plant)  data = data.filter(c=>c.plant===f.plant);
        if (f.asset)  data = data.filter(c=>(c.assetCode||'').toLowerCase().includes(f.asset.toLowerCase()));
        return data;
      }
      case 'kpis': return [DB.calcKPIs()];
      default: return [];
    }
  },

  renderPreview() {
    const el = document.getElementById('report-preview');
    if (!el) return;
    const data = this.getFilteredData();
    const countEl = document.getElementById('rep-count');
    if (countEl) countEl.textContent = `${data.length} registros encontrados`;

    let html = '';
    switch(this.reportType) {
      case 'assets':
        html = this.tableHTML(['Código','Tipo','Marca','Modelo','Año','Placa','Ubicación','Estado','Medidor'],
          data.map(a=>[a.code,a.type,a.brand,a.model,a.year,a.plate||'—',a.location||'—',a.status,a.currentKm>0?fmtKm(a.currentKm):fmtHours(a.currentHours)]));
        break;
      case 'preventive':
        html = this.tableHTML(['Activo','Servicio','Fecha','Medidor','Costo','Técnico','Acciones'],
          data.map(p=>[p.assetCode,p.type,fmtDate(p.lastDoneDate),p.lastDoneKm?fmtKm(p.lastDoneKm):fmtHours(p.lastDoneHours),DB.fmtCurrency(p.cost||0),p.techName||'—',
          Auth.canDelete('maintenance') ? `<button class="btn btn-outline btn-icon btn-sm text-danger" style="border-color:var(--danger)" onclick="ReportsModule.deletePreventive('${p.id}')" title="Eliminar registro">🗑️</button>` : '']));
        break;
      case 'corrective':
        html = this.tableHTML(['Activo','Fecha','Categoría','Tiempo Muerto','Proveedor','Costo Total','Acciones'],
          data.map(c=>[c.assetCode,fmtDate(c.failureDate),c.failureCategory||'—',fmtHours(c.downtimeHours),c.provider||'—',DB.fmtCurrency((c.laborCost||0)+(c.partsCost||0)),
          Auth.canDelete('maintenance') ? `<button class="btn btn-outline btn-icon btn-sm text-danger" style="border-color:var(--danger)" onclick="ReportsModule.deleteCorrective('${c.id}')" title="Eliminar registro">🗑️</button>` : '']));
        break;
      case 'kpis':
        const kpis = data[0]||{};
        const cur = DB.getCurrencySymbol(DB.getSettings().currency);
        html = `<div class="grid-3" style="gap:12px">
          ${[
            ['Disponibilidad',`${kpis.disponibilidad}%`],
            ['MTBF',`${fmtNumber(kpis.mtbf,0)} hrs`],
            ['MTTR',fmtHours(kpis.mttr)],
            ['Gasto Mensual',DB.fmtCurrency(kpis.monthCost)],
            ['Gasto Anual',DB.fmtCurrency(kpis.yearCost)],
            ['% Preventivo',`${kpis.preventPct}%`],
            ['Mantenimientos Vencidos',kpis.overdue],
            ['Equipos Operativos',kpis.operativeAssets],
            ['Costo/Hora',`${cur} ${kpis.costPerHr}`],
          ].map(([l,v])=>`<div class="card" style="padding:14px;text-align:center">
            <div class="stat-number text-primary">${v}</div><div class="text-sm text-muted">${l}</div>
          </div>`).join('')}
        </div>`;
        break;
    }
    el.innerHTML = html || '<div class="empty-state"><div class="empty-icon">📄</div><h3>Sin datos</h3></div>';
  },

  tableHTML(headers, rows) {
    if (rows.length === 0) return '<div class="empty-state"><div class="empty-icon">📋</div><h3>Sin datos con los filtros aplicados</h3></div>';
    return `
    <div class="table-wrapper">
      <table>
        <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c||'—'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
  },

      async deletePreventive(id) {
    if (!Auth.canDelete('maintenance')) {
      showToast('No tiene permiso para eliminar mantenimientos', 'error');
      return;
    }
    if (!confirm('¿Eliminar este registro de mantenimiento preventivo? Esta acción no se puede deshacer.')) return;
    try {
      await DB.deletePreventive(id);
      DB.addAudit({ user:Auth.getSession()?.name||'', action:'DELETE', detail:'Mantenimiento preventivo eliminado desde reportes' });
      showToast('Registro eliminado exitosamente', 'success');
      this.renderPreview();
    } catch (e) {
      showToast(e.message || 'Error eliminando mantenimiento', 'error');
      return;
    }
  },

      async deleteCorrective(id) {
    if (!Auth.canDelete('maintenance')) {
      showToast('No tiene permiso para eliminar mantenimientos', 'error');
      return;
    }
    if (!confirm('¿Eliminar este registro de falla correctiva? Esta acción no se puede deshacer.')) return;
    try {
      await DB.deleteCorrective(id);
      DB.addAudit({ user:Auth.getSession()?.name||'', action:'DELETE', detail:'Correctivo eliminado desde reportes' });
      showToast('Registro eliminado exitosamente', 'success');
      this.renderPreview();
    } catch (e) {
      showToast(e.message || 'Error eliminando correctivo', 'error');
      return;
    }
  },

  exportExcel() {
    const data  = this.getFilteredData();
    if (!data.length) { showToast('Sin datos para exportar','error'); return; }
    let headers, rows;
    switch(this.reportType) {
      case 'assets':
        headers = ['Código','Tipo','Marca','Modelo','Año','Placa','Serie','Ubicación','Responsable','Estado'];
        rows = data.map(a=>[a.code,a.type,a.brand,a.model,a.year,a.plate,a.serial,a.location,a.responsible,a.status]);
        break;
      case 'preventive':
        headers = ['Activo','Servicio','Fecha de Servicio','Medidor','Costo','Técnico','Planta'];
        rows = data.map(p=>[p.assetCode,p.type,p.lastDoneDate,p.lastDoneKm||p.lastDoneHours,p.cost,p.techName,p.plant]);
        break;
      case 'corrective':
        headers = ['Activo','Fecha Falla','Categoría','Descripción','Tiempo Muerto','Fecha Reparación','Proveedor','Costo MO','Costo Repuestos','Costo Total'];
        rows = data.map(c=>[c.assetCode,c.failureDate,c.failureCategory,c.description,c.downtimeHours,c.repairDate,c.provider,c.laborCost,c.partsCost,c.totalCost]);
        break;
      default:
        headers = ['KPI','Valor'];
        rows = [['Disponibilidad',data[0]?.disponibilidad+'%'],['MTBF',data[0]?.mtbf+' hrs'],['Gasto Mensual',data[0]?.monthCost]];
    }

    // Use SheetJS if available, else CSV fallback
    if (window.XLSX) {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
      XLSX.writeFile(wb, `reporte-flota-${this.reportType}-${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Excel exportado correctamente','success');
    } else {
      const csv = [headers, ...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
      downloadFile(csv,`reporte-flota-${this.reportType}.csv`,'text/csv');
      showToast('CSV exportado (instale SheetJS para Excel nativo)','warning');
    }
  },

  exportPDF() {
    const data = this.getFilteredData();
    if (!data.length) { showToast('Sin datos para exportar','error'); return; }

    // Build a print-friendly page
    const printWin = window.open('','_blank','width=900,height=700');
    const cur  = DB.getCurrencySymbol(DB.getSettings().currency);
    let tableHtml = '';

    switch(this.reportType) {
      case 'assets':
        tableHtml = `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">
          <thead><tr style="background:#1a56db;color:#fff">${['Código','Tipo','Marca','Modelo','Año','Placa','Ubicación','Estado'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${data.map(a=>`<tr><td>${a.code}</td><td>${a.type}</td><td>${a.brand}</td><td>${a.model}</td><td>${a.year}</td><td>${a.plate||'—'}</td><td>${a.location||'—'}</td><td>${a.status}</td></tr>`).join('')}</tbody>
        </table>`;
        break;
      case 'preventive':
        tableHtml = `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">
          <thead><tr style="background:#1a56db;color:#fff">${['Activo','Servicio','Fecha','Medidor','Costo','Técnico','Planta'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${data.map(p=>`<tr><td>${p.assetCode}</td><td>${p.type}</td><td>${fmtDate(p.lastDoneDate)}</td><td>${p.lastDoneKm?fmtKm(p.lastDoneKm):fmtHours(p.lastDoneHours)}</td><td>${DB.fmtCurrency(p.cost||0)}</td><td>${p.techName||'—'}</td><td>${p.plant||'—'}</td></tr>`).join('')}</tbody>
        </table>`;
        break;
      case 'corrective':
        tableHtml = `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">
          <thead><tr style="background:#1a56db;color:#fff">${['Activo','Fecha Falla','Categoría','Tiempo Muerto','Proveedor','Costo Total'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${data.map(c=>`<tr><td>${c.assetCode}</td><td>${fmtDate(c.failureDate)}</td><td>${c.failureCategory||'—'}</td><td>${fmtHours(c.downtimeHours)}</td><td>${c.provider||'—'}</td><td>${DB.fmtCurrency((c.laborCost||0)+(c.partsCost||0))}</td></tr>`).join('')}</tbody>
        </table>`;
        break;
      case 'kpis': {
        const k = data[0] || {};
        tableHtml = `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">
          <thead><tr style="background:#1a56db;color:#fff"><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>
            ${[['Disponibilidad',`${k.disponibilidad}%`],['MTBF',`${fmtNumber(k.mtbf,0)} hrs`],['MTTR',fmtHours(k.mttr)],
               ['Gasto Mensual',DB.fmtCurrency(k.monthCost)],['Gasto Anual',DB.fmtCurrency(k.yearCost)],
               ['% Preventivo',`${k.preventPct}%`],['Correctivo',`${k.correctivePct}%`],
               ['Equipos Operativos',k.operativeAssets],['Fuera de Servicio',k.failedAssets],
               ['Fallas Este Año',k.totalCorrectiveThisYear],['Costo/Hora',`${cur} ${k.costPerHr}`],['Costo/Km',`${cur} ${k.costPerKm}`]
            ].map(([l,v])=>`<tr><td>${l}</td><td>${v}</td></tr>`).join('')}
          </tbody>
        </table>`;
        break;
      }
      default:
        tableHtml = `<p>${data.length} registros — ver pantalla para detalle</p>`;
    }

    printWin.document.write(`<!DOCTYPE html><html><head>
      <title>Reporte Flota — ${new Date().toLocaleDateString('es')}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#111}h1{color:#1a56db}table{border-collapse:collapse}td,th{padding:6px 10px;border:1px solid #ccc}th{background:#1a56db;color:#fff}</style>
    </head><body>
      <h1>🚛 Gestión Integral de Mantenimiento de Flota</h1>
      <p>Reporte: <strong>${this.reportType}</strong> — Fecha: ${new Date().toLocaleDateString('es')}</p>
      <hr>
      ${tableHtml}
      <p style="margin-top:20px;color:#666;font-size:11px">Generado por Fleet Management System — ${new Date().toLocaleString('es')}</p>
    </body></html>`);
    printWin.document.close();
    setTimeout(()=>{ printWin.print(); }, 500);
    showToast('Preparando PDF para impresión...','success');
  },
};
 
/* ====================================================
   SETTINGS MODULE
   ==================================================== */

const SettingsModule = {
  _saving: false,

  render() {
    if (!Auth.isAdmin()) return `<div class="empty-state"><div class="empty-icon">🔒</div><h3>Acceso Denegado</h3></div>`;
    const s = DB.getSettings();
    return `
    <div class="page-header">
      <div class="page-header-left"><h2>⚙️ Configuración</h2><p>Configuración general del sistema</p></div>
    </div>
    <div class="card" style="max-width:500px">
      <div class="card-title mb-16">Configuración General</div>
      <div class="form-group"><label class="form-label">Moneda</label>
        <input class="form-control" id="sett-cur" value="NIO" readonly placeholder="C$" title="Moneda fija: Córdoba nicaragüense (NIO)">
        <small class="text-muted">Córdoba nicaragüense (NIO) — Símbolo: C$</small>
      </div>
      <div class="form-group"><label class="form-label">Días de anticipación para alertas</label>
        <input class="form-control" type="number" id="sett-days" value="${s.alertDaysAhead||7}" min="1" max="30">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="settings-save-btn" onclick="SettingsModule.save()">💾 Guardar Configuración</button>
      </div>
    </div>
    <div class="card mt-16" style="max-width:500px">
      <div class="card-title mb-16">⚠️ Zona de Peligro</div>
      <button class="btn btn-danger" onclick="SettingsModule.resetData()">🗑️ Restablecer Datos de Ejemplo</button>
    </div>`;
  },

  async save() {
    if (this._saving) return;
    if (!Auth.isAdmin()) {
      showToast('Solo administradores pueden guardar configuración','error');
      return;
    }

    const daysEl = document.getElementById('sett-days');
    const days = parseInt(daysEl?.value, 10);

    if (!Number.isFinite(days) || days < 1) {
      showToast('Días de anticipación inválido','error');
      return;
    }

    const btn = document.getElementById('settings-save-btn');
    const prevDisabled = btn?.disabled;
    const prevHtml = btn?.innerHTML;

    this._saving = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Guardando...';
    }

    try {
      await DB.saveSettings({ currency: 'NIO', alertDaysAhead: days });
      DB.addAudit({ user: Auth.getSession()?.name || '', action: 'SETTINGS', detail: 'Configuración guardada' });
      showToast('Configuración guardada','success');
    } catch (err) {
      console.error('[Settings] Error guardando:', err);
      showToast('Error guardando configuración','error');
    } finally {
      this._saving = false;
      if (btn) {
        btn.disabled = prevDisabled;
        btn.innerHTML = prevHtml;
      }
    }
  },

  resetData() {
    if (!confirm('⚠️ ¿Restablecer todos los datos de ejemplo? Se perderán los cambios actuales.')) return;
    DB.resetData().then(() => {
      showToast('Datos restablecidos','success');
      App.navigate('dashboard');
    });
  },
};
