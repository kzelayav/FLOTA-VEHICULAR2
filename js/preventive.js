/* ====================================================
   PREVENTIVE MAINTENANCE MODULE (NEW FLOW)
   ==================================================== */

const PreventiveModule = {
  filter: { search:'', plant:'' },

  render() {
    const assets = DB.getAssets();
    const prev = DB.getPreventive(); // Now acts as historical logs + next due state

    // Group logs by asset to avoid re-filtering the full list per asset
    const logsByAsset = {};
    prev.forEach(p => { (logsByAsset[p.assetId] = logsByAsset[p.assetId] || []).push(p); });

    // We calculate the next due state for each asset based on its latest PM record
    const assetStatus = assets.map(a => {
      const logs = (logsByAsset[a.id] || []).sort((x,y) => new Date(y.lastDoneDate) - new Date(x.lastDoneDate));
      const last = logs[0];
      return {
        asset: a,
        lastLog: last,
        isOverdue: this.checkOverdue(a, last),
        isUpcoming: this.checkUpcoming(a, last),
      };
    });

    // Stats
    const totalAssets = assets.length;
    const overdueCount = assetStatus.filter(x=>x.isOverdue).length;
    const upcomingCount = assetStatus.filter(x=>x.isUpcoming).length;
    const okCount = totalAssets - overdueCount - upcomingCount;

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>🔧 Mantenimiento Preventivo</h2>
        <p>Control de mantenimientos realizados y próximos servicios requeridos</p>
      </div>
      <div class="page-header-right">
        ${Auth.getSession()?.role !== 'consulta' ? `<button class="btn btn-primary" onclick="PreventiveModule.openModal()">➕ Registrar Servicio Realizado</button>` : ''}
      </div>
    </div>

    <!-- Stats -->
    <div class="summary-stats mb-16">
      <div class="summary-stat"><div class="summary-stat-val">${totalAssets}</div><div class="summary-stat-lbl">Equipos Totales</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-success">${okCount}</div><div class="summary-stat-lbl">Al día</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-warning">${upcomingCount}</div><div class="summary-stat-lbl">Próximos</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-danger">${overdueCount}</div><div class="summary-stat-lbl">Vencidos</div></div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" class="form-control" placeholder="Buscar equipo..." value="${this.filter.search}" oninput="PreventiveModule.setFilter('search',this.value)">
      </div>
      <select class="form-control" onchange="PreventiveModule.setFilter('plant',this.value)" style="width:180px">
        <option value="">Todas las plantas</option>
        ${['Planta Norte','Planta Sur','Bodega Central','Finca Sur'].map(p=>`<option value="${p}" ${this.filter.plant===p?'selected':''}>${p}</option>`).join('')}
      </select>
    </div>

    <div id="prev-content">${this.renderTable(assetStatus)}</div>
    <div id="prev-modal-placeholder"></div>`;
  },

  setFilter(key, val) {
    this.filter[key] = val;
    App.navigate('preventive');
  },

  checkOverdue(asset, lastLog) {
    if (!lastLog) return false;
    if (lastLog.frequency === 'km' && lastLog.nextDueKm && asset.currentKm >= lastLog.nextDueKm) return true;
    if (lastLog.frequency === 'hours' && lastLog.nextDueHours && asset.currentHours >= lastLog.nextDueHours) return true;
    if (lastLog.nextDueDate && new Date(lastLog.nextDueDate) < new Date()) return true;
    return false;
  },

  checkUpcoming(asset, lastLog) {
    if (!lastLog || this.checkOverdue(asset, lastLog)) return false;
    if (lastLog.frequency === 'km' && lastLog.nextDueKm && asset.currentKm >= lastLog.nextDueKm - 500) return true;
    if (lastLog.frequency === 'hours' && lastLog.nextDueHours && asset.currentHours >= lastLog.nextDueHours - 50) return true;
    if (lastLog.nextDueDate) {
      const due = new Date(lastLog.nextDueDate);
      const ahead = new Date(); ahead.setDate(ahead.getDate() + (DB.getSettings().alertDaysAhead||7));
      if (due <= ahead) return true;
    }
    return false;
  },

  renderTable(assetStatus) {
    let data = assetStatus;
    const f = this.filter;
    if (f.search) data = data.filter(x => (x.asset.code+' '+x.asset.brand+' '+x.asset.model).toLowerCase().includes(f.search.toLowerCase()));
    if (f.plant)  data = data.filter(x => x.asset.location === f.plant);

    // Sort: Overdue first, then upcoming, then OK
    data.sort((a,b) => (b.isOverdue - a.isOverdue) || (b.isUpcoming - a.isUpcoming) || a.asset.code.localeCompare(b.asset.code));

    if (data.length === 0) return `<div class="empty-state"><h3>Sin equipos</h3></div>`;

    return `
    <div class="card" style="padding:0">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Estado</th><th>Equipo</th><th>Tipo</th><th>Planta</th>
            <th>Último Mantenimiento</th><th>Kilometraje/Horas Actual</th><th>Próximo Mantenimiento</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${data.map(item => {
              const a = item.asset;
              const l = item.lastLog;
              const badge = item.isOverdue ? '<span class="badge badge-danger">Vencido</span>' : 
                            item.isUpcoming ? '<span class="badge badge-warning">Próximo</span>' : 
                            '<span class="badge badge-success">Al Día</span>';
              
              let nextTxt = '—';
              let lastTxt = '—';
              let currentTxt = '—';

              if (['Motocicleta','Camioneta','Carro','Camión','Cabezal'].includes(a.type)) {
                currentTxt = fmtKm(a.currentKm);
                if (l) {
                  lastTxt = `${fmtDate(l.lastDoneDate)}<br><span class="text-xs text-muted">${fmtKm(l.lastDoneKm)}</span>`;
                  nextTxt = `<b>${fmtKm(l.nextDueKm)}</b>`;
                }
              } else {
                currentTxt = fmtHours(a.currentHours);
                if (l) {
                  lastTxt = `${fmtDate(l.lastDoneDate)}<br><span class="text-xs text-muted">${fmtHours(l.lastDoneHours)}</span>`;
                  nextTxt = `<b>${fmtHours(l.nextDueHours)}</b>`;
                }
              }

              return `<tr>
                <td>${badge}</td>
                <td class="fw-700">${a.code}<br><span class="text-xs text-muted">${a.brand} ${a.model}</span></td>
                <td><span class="badge badge-muted">${a.type}</span></td>
                <td>${a.location||'—'}</td>
                <td class="text-sm">${lastTxt}</td>
                <td class="text-sm">${currentTxt}</td>
                <td class="text-sm ${item.isOverdue?'text-danger':item.isUpcoming?'text-warning':''}">${nextTxt}</td>
                <td>
                  <div class="table-actions">
                    <button class="btn btn-outline btn-sm" onclick="PreventiveModule.openModal('${a.id}')" title="Registrar Servicio">📝 Registrar</button>
                    <button class="btn btn-outline btn-icon btn-sm" onclick="PreventiveModule.viewHistory('${a.id}')" title="Historial">📋</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  },

  openModal(assetId = null) {
    const assets = DB.getAssets();
    const today = new Date().toISOString().split('T')[0];

    showModal('prev-modal-placeholder', '➕ Registrar Mantenimiento Realizado', `
    <div class="form-grid">
      <div class="form-group" style="grid-column: span 2">
        <label class="form-label">Equipo (Escribe para buscar) *</label>
        <input type="text" class="form-control" id="pm-asset-search" list="pm-asset-list" placeholder="🔍 Escribe código, marca o modelo..." oninput="PreventiveModule.onAssetChange()" value="${assetId ? (assets.find(a=>a.id===assetId)?.code + ' — ' + assets.find(a=>a.id===assetId)?.brand + ' ' + assets.find(a=>a.id===assetId)?.model) : ''}">
        <datalist id="pm-asset-list">
          ${assets.map(a=>`<option value="${a.code} — ${a.brand} ${a.model}">${a.type}</option>`).join('')}
        </datalist>
        <input type="hidden" id="pm-asset" value="${assetId||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de Servicio *</label>
        <input class="form-control" id="pm-type" placeholder="Ej. Cambio de aceite y filtros">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de Realización *</label>
        <input class="form-control" type="date" id="pm-date" value="${today}">
      </div>
      <div class="form-group">
        <label class="form-label" id="pm-meter-label">Odómetro / Horómetro al servicio *</label>
        <input class="form-control" type="number" id="pm-meter" value="0">
      </div>
      <div class="form-group">
        <label class="form-label">Técnico / Responsable</label>
        <input class="form-control" id="pm-tech" value="${Auth.getSession()?.name||''}" readonly style="background:var(--bg-secondary)">
      </div>
      <div class="form-group">
        <label class="form-label">Costo Mano de Obra</label>
        <input class="form-control" type="number" id="pm-labor" value="0" oninput="PreventiveModule.calcTotal()">
      </div>
      <div class="form-group">
        <label class="form-label">Costo Repuestos</label>
        <input class="form-control" type="number" id="pm-partsCost" value="0" oninput="PreventiveModule.calcTotal()">
      </div>
      <div class="form-group">
        <label class="form-label">Costo Total</label>
        <input class="form-control" type="number" id="pm-total" value="0" readonly style="background:var(--bg-secondary);font-weight:bold">
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor / Taller</label>
        <input class="form-control" id="pm-provider" placeholder="Taller XYZ">
      </div>
    </div>
    <div class="form-group mt-16">
      <label class="form-label">Repuestos Utilizados</label>
      <input class="form-control" id="pm-parts" placeholder="Ej. Filtro de aceite, 5 litros de aceite 15w40...">
    </div>
    <div class="form-group">
      <label class="form-label">Observaciones</label>
      <textarea class="form-control" id="pm-obs"></textarea>
    </div>
    
    <div class="alert-box" style="margin-top:16px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);padding:10px;border-radius:6px;font-size:12px;color:var(--text-secondary)">
      ℹ️ El sistema programará automáticamente la próxima alerta basado en el tipo de vehículo (Motocicletas: +3,000km, Camionetas/Carros/Camiones: +5,000km).
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal('prev-modal-placeholder')">Cancelar</button>
     <button class="btn btn-primary" onclick="PreventiveModule.save()">💾 Guardar Registro</button>`
    );
    
    if (assetId) setTimeout(() => this.onAssetChange(), 100);
  },

  onAssetChange() {
    const searchVal = document.getElementById('pm-asset-search').value;
    const assets = DB.getAssets();
    const a = assets.find(x => `${x.code} — ${x.brand} ${x.model}` === searchVal);
    
    if (!a) {
      document.getElementById('pm-asset').value = '';
      return;
    }
    
    document.getElementById('pm-asset').value = a.id;
    const isKm = ['Motocicleta','Camioneta','Carro','Camión','Cabezal'].includes(a.type);
    document.getElementById('pm-meter-label').textContent = isKm ? 'Kilometraje al realizar servicio *' : 'Horómetro al realizar servicio *';
    document.getElementById('pm-meter').value = isKm ? a.currentKm : a.currentHours;
  },

  calcTotal() {
    const l = parseFloat(document.getElementById('pm-labor')?.value||0);
    const p = parseFloat(document.getElementById('pm-partsCost')?.value||0);
    document.getElementById('pm-total').value = l + p;
  },

  async save() {
    const aid = document.getElementById('pm-asset').value;
    const type = document.getElementById('pm-type').value.trim();
    const date = document.getElementById('pm-date').value;
    const meter = parseFloat(document.getElementById('pm-meter').value||0);

    if (!aid || !type || !date) { showToast('Faltan campos obligatorios', 'error'); return; }

    const asset = DB.getAsset(aid);
    const isKm = ['Motocicleta','Camioneta','Carro','Camión','Cabezal'].includes(asset.type);

    let freqKm = 5000;
    if (asset.type === 'Motocicleta') freqKm = 3000;

    const data = {
      assetId: aid,
      assetCode: asset.code,
      type: type,
      frequency: isKm ? 'km' : 'hours',
      frequencyValue: isKm ? freqKm : 250,
      lastDoneDate: date,
      techName: document.getElementById('pm-tech').value.trim(),
      laborCost: parseFloat(document.getElementById('pm-labor').value||0),
      partsCost: parseFloat(document.getElementById('pm-partsCost').value||0),
      cost: parseFloat(document.getElementById('pm-total').value||0),
      parts: document.getElementById('pm-parts').value.trim(),
      observations: document.getElementById('pm-obs').value.trim(),
      plant: asset.location,
      provider: document.getElementById('pm-provider').value.trim(),
    };

    if (isKm) {
      data.lastDoneKm = meter;
      data.nextDueKm = meter + freqKm;
      if (meter > asset.currentKm) DB.updateAsset(aid, { currentKm: meter });
    } else {
      data.lastDoneHours = meter;
      data.nextDueHours = meter + 250;
      if (meter > asset.currentHours) DB.updateAsset(aid, { currentHours: meter });
    }

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 180);
    data.nextDueDate = nextDate.toISOString().split('T')[0];

    try {
      await DB.addPreventive(data);
      DB.addAudit({ user:Auth.getSession()?.name||'', action:'CREATE', detail:'Mantenimiento registrado para ' + asset.code });
      showToast('Mantenimiento registrado y próximo servicio calculado', 'success');
    } catch (e) {
      showToast(e.message || 'Error registrando mantenimiento', 'error');
      return;
    }
    closeModal('prev-modal-placeholder');
    App.navigate('preventive');
  },

  viewHistory(assetId) {
    const a = DB.getAsset(assetId);
    const logs = DB.getPreventive().filter(p => p.assetId === assetId).sort((x,y) => new Date(y.lastDoneDate) - new Date(x.lastDoneDate));

    showModal('prev-modal-placeholder', `📋 Historial de Servicios — ${a.code}`, `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Fecha</th><th>Servicio</th><th>Medidor</th><th>Costo</th><th>Técnico</th><th>Acciones</th></tr></thead>
        <tbody>
          ${logs.length===0 ? '<tr><td colspan="6" class="text-center text-muted">No hay historial registrado</td></tr>' : 
          logs.map(l => `
            <tr>
              <td class="text-sm">${fmtDate(l.lastDoneDate)}</td>
              <td>${l.type}</td>
              <td class="text-sm">${l.lastDoneKm ? fmtKm(l.lastDoneKm) : fmtHours(l.lastDoneHours)}</td>
              <td class="fw-700">${fmtCurrency(l.cost)}</td>
              <td class="text-sm text-muted">${l.techName}</td>
              <td>
                <button class="btn btn-outline btn-icon btn-sm text-danger" style="border-color:var(--danger)" onclick="PreventiveModule.delete('${l.id}', '${assetId}')" title="Eliminar registro">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    `);
  },

async delete(id, assetId) {
    if (!confirm('¿Eliminar este registro de mantenimiento preventivo? Esta acción no se puede deshacer.')) return;
    try {
      await DB.deletePreventive(id);
      DB.addAudit({ user:Auth.getSession()?.name||'', action:'DELETE', detail:`Mantenimiento preventivo eliminado para ${assetId}` });
      showToast('Registro eliminado exitosamente', 'success');
      App.navigate('preventive');
    } catch (e) {
      showToast(e.message || 'Error eliminando mantenimiento', 'error');
      return;
    }
  },
}