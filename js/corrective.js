/* ====================================================
   CORRECTIVE MAINTENANCE MODULE
   ==================================================== */

const CorrectiveModule = {
  filter: { search:'', status:'', category:'', assetId:'' },

  render() {
    const all  = DB.getCorrective();
    const open = all.filter(c=>c.status==='in-progress').length;
    const done = all.filter(c=>c.status==='repaired').length;
    const totalDown  = all.reduce((s,c)=>s+(parseFloat(c.downtimeHours)||0),0);
    const totalCostC = all.reduce((s,c)=>s+(parseFloat(c.totalCost)||0),0);
    const assets = DB.getAssets();
    const canEdit = Auth.getSession()?.role !== 'consulta';

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>⚠️ Mantenimiento Correctivo</h2>
        <p>Registro de fallas, averías y reparaciones no planificadas</p>
      </div>
      <div class="page-header-right">
        ${canEdit?`<button class="btn btn-danger" onclick="CorrectiveModule.openModal()">🚨 Registrar Falla</button>`:''}
      </div>
    </div>

    <div class="summary-stats mb-16">
      <div class="summary-stat"><div class="summary-stat-val">${all.length}</div><div class="summary-stat-lbl">Total Fallas</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-warning">${open}</div><div class="summary-stat-lbl">En Proceso</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-success">${done}</div><div class="summary-stat-lbl">Reparadas</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-danger">${fmtHours(totalDown)}</div><div class="summary-stat-lbl">Tiempo Muerto</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-primary">${fmtCurrency(totalCostC)}</div><div class="summary-stat-lbl">Costo Total</div></div>
    </div>

    <div class="filter-bar">
      <div class="search-input">
        <span class="search-icon">🔍</span>
        <input class="form-control" type="text" placeholder="Buscar activo, descripción..." id="cm-search"
          value="${this.filter.search}" oninput="CorrectiveModule.setFilter('search',this.value)">
      </div>
      <select class="form-control" onchange="CorrectiveModule.setFilter('status',this.value)" style="width:160px">
        <option value="">Todos los estados</option>
        <option value="in-progress" ${this.filter.status==='in-progress'?'selected':''}>🔧 En Proceso</option>
        <option value="repaired"    ${this.filter.status==='repaired'?'selected':''}>✅ Reparado</option>
      </select>
      <select class="form-control" onchange="CorrectiveModule.setFilter('category',this.value)" style="width:160px">
        <option value="">Todas las categorías</option>
        ${['Mecánica','Eléctrica','Hidráulica','Neumática','Transmisión','Motor','Carrocería','Otro'].map(c=>`<option value="${c}" ${this.filter.category===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <select class="form-control" onchange="CorrectiveModule.setFilter('assetId',this.value)" style="width:200px">
        <option value="">Todos los activos</option>
        ${assets.map(a=>`<option value="${a.id}" ${this.filter.assetId===a.id?'selected':''}>${a.code} — ${a.brand} ${a.model}</option>`).join('')}
      </select>
    </div>

    <div id="cm-content">${this.renderContent()}</div>
    <div id="cm-modal-placeholder"></div>`;
  },

  setFilter(key, val) {
    this.filter[key] = val;
    document.getElementById('cm-content').innerHTML = this.renderContent();
  },

  renderContent() {
    let data = DB.getCorrective();
    const f = this.filter;
    if (f.search)   data = data.filter(c=>`${c.assetCode}${c.description}${c.failureType}`.toLowerCase().includes(f.search.toLowerCase()));
    if (f.status)   data = data.filter(c=>c.status===f.status);
    if (f.category) data = data.filter(c=>c.failureCategory===f.category);
    if (f.assetId)  data = data.filter(c=>c.assetId===f.assetId);

    // Sort by date desc (copy to avoid mutating the cache array)
    data = [...data].sort((a,b)=>new Date(b.failureDate)-new Date(a.failureDate));

    if (data.length === 0) return `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Sin fallas registradas</h3><p>Cuando ocurra una falla, regístrala aquí.</p></div>`;

    const canEdit = Auth.getSession()?.role !== 'consulta';
    return `
    <div class="card" style="padding:0">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Estado</th><th>Activo</th><th>Fecha Falla</th><th>Categoría</th>
            <th>Descripción</th><th>Tiempo Muerto</th><th>Medidor</th><th>Proveedor</th><th>Costo Total</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${data.map(c=>`
            <tr>
              <td>${statusBadge(c.status)}</td>
              <td><strong>${c.assetCode}</strong></td>
              <td>${fmtDate(c.failureDate)}</td>
              <td><span class="badge badge-muted">${c.failureCategory||c.failureType||'—'}</span></td>
              <td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.description}">${c.description}</td>
              <td>${fmtHours(c.downtimeHours)}</td>
              <td class="text-sm text-muted">${c.meterKm ? fmtKm(c.meterKm) : (c.meterHours ? fmtHours(c.meterHours) : '—')}</td>
              <td class="text-sm text-muted">${c.provider||'—'}</td>
              <td class="fw-700 text-danger">${fmtCurrency(c.totalCost)}</td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-outline btn-icon btn-sm" onclick="CorrectiveModule.viewDetail('${c.id}')" title="Ver detalle">👁️</button>
                  ${canEdit?`
                  ${c.status==='in-progress'?`<button class="btn btn-success btn-sm" onclick="CorrectiveModule.markRepaired('${c.id}')">✅ Reparado</button>`:''}
                  <button class="btn btn-outline btn-icon btn-sm" onclick="CorrectiveModule.openModal('${c.id}')" title="Editar">✏️</button>
                  <button class="btn btn-outline btn-icon btn-sm" onclick="CorrectiveModule.delete('${c.id}')" title="Eliminar">🗑️</button>`:''}
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  },

  openModal(id = null) {
    const cm = id ? DB.getCorrective().find(c=>c.id===id) : null;
    const assets = DB.getAssets();
    const title = cm ? '✏️ Editar Registro de Falla' : '🚨 Registrar Falla Correctiva';
    const v = cm || { assetId:'', failureDate:'', failureType:'Mecánica', failureCategory:'Mecánica', description:'', downtimeHours:0, repairDate:'', provider:'', laborCost:0, partsCost:0, totalCost:0, rootCause:'', correctiveActions:'', responsible:'', plant:'', status:'in-progress' };

    const editAsset = v.assetId ? DB.getAsset(v.assetId) : null;
    const isKm = editAsset ? ['Motocicleta','Camioneta','Carro','Camión','Cabezal'].includes(editAsset.type) : true;
    const meterLabel = isKm ? 'Odómetro al servicio (km)' : 'Horómetro al servicio (horas)';
    const meterVal = isKm ? (v.meterKm || (editAsset?.currentKm) || 0) : (v.meterHours || (editAsset?.currentHours) || 0);

    showModal('cm-modal-placeholder', title, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Activo (Escribe para buscar) *</label>
        <input type="text" class="form-control" id="cmf-asset-search" list="cmf-asset-list" placeholder="🔍 Escribe código, marca o modelo..." oninput="CorrectiveModule.onAssetChange()" value="${v.assetId ? (assets.find(a=>a.id===v.assetId)?.code + ' — ' + assets.find(a=>a.id===v.assetId)?.brand + ' ' + assets.find(a=>a.id===v.assetId)?.model) : ''}">
        <datalist id="cmf-asset-list">
          ${assets.map(a=>`<option value="${a.code} — ${a.brand} ${a.model}">${a.type}</option>`).join('')}
        </datalist>
        <input type="hidden" id="cmf-asset" value="${v.assetId||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de Falla *</label>
        <input class="form-control" type="date" id="cmf-faildate" value="${v.failureDate}">
      </div>
      <div class="form-group">
        <label class="form-label">Categoría de Avería</label>
        <select class="form-control" id="cmf-category">
          ${['Mecánica','Eléctrica','Hidráulica','Neumática','Transmisión','Motor','Carrocería','Otro'].map(c=>`<option ${v.failureCategory===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Horas Fuera de Servicio</label>
        <input class="form-control" type="number" id="cmf-downtime" value="${v.downtimeHours||0}" min="0" step="0.5">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de Reparación</label>
        <input class="form-control" type="date" id="cmf-repairdate" value="${v.repairDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label" id="cmf-meter-label">${meterLabel}</label>
        <input class="form-control" type="number" id="cmf-meter" value="${meterVal}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor / Taller</label>
        <input class="form-control" id="cmf-provider" value="${v.provider||''}" placeholder="Taller XYZ">
      </div>
      <div class="form-group">
        <label class="form-label">Costo Mano de Obra</label>
        <input class="form-control" type="number" id="cmf-labor" value="${v.laborCost||0}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Costo Repuestos</label>
        <input class="form-control" type="number" id="cmf-parts" value="${v.partsCost||0}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Responsable</label>
        <input class="form-control" id="cmf-resp" value="${v.responsible||Auth.getSession()?.name||''}" readonly style="background:var(--bg-secondary)">
      </div>
      <div class="form-group">
        <label class="form-label">Planta</label>
        <input class="form-control" id="cmf-plant" value="${v.plant||''}" placeholder="Planta Norte">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción del Problema *</label>
      <textarea class="form-control" id="cmf-desc" placeholder="Descripción detallada de la avería...">${v.description||''}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Causa Raíz</label>
      <textarea class="form-control" id="cmf-root" placeholder="Análisis de causa raíz...">${v.rootCause||''}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Acciones Correctivas</label>
      <textarea class="form-control" id="cmf-actions" placeholder="Acciones realizadas para corregir la falla...">${v.correctiveActions||''}</textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal('cm-modal-placeholder')">Cancelar</button>
     <button class="btn btn-danger" onclick="CorrectiveModule.save('${id||''}')">💾 Guardar</button>`
    );
  },

  onAssetChange() {
    const searchVal = document.getElementById('cmf-asset-search').value;
    const assets = DB.getAssets();
    const a = assets.find(x => `${x.code} — ${x.brand} ${x.model}` === searchVal);
    
    if (!a) {
      document.getElementById('cmf-asset').value = '';
      return;
    }
    
    document.getElementById('cmf-asset').value = a.id;
    const isKm = ['Motocicleta','Camioneta','Carro','Camión','Cabezal'].includes(a.type);
    const label = document.getElementById('cmf-meter-label');
    const meter = document.getElementById('cmf-meter');
    if (label) label.textContent = isKm ? 'Odómetro al servicio (km)' : 'Horómetro al servicio (horas)';
    if (meter && !meter.value) meter.value = isKm ? a.currentKm : a.currentHours;
  },

  async save(id) {
    const get = sel => document.getElementById(sel)?.value?.trim();
    const assetId = get('cmf-asset');
    const failDate = get('cmf-faildate');
    if (!assetId || !failDate) { showToast('Activo y fecha son obligatorios','error'); return; }

    const asset  = DB.getAsset(assetId);
    const labor  = parseFloat(document.getElementById('cmf-labor')?.value||0);
    const parts  = parseFloat(document.getElementById('cmf-parts')?.value||0);
    const repairDate = get('cmf-repairdate');
    const meter  = parseFloat(document.getElementById('cmf-meter')?.value||0);
    const isKm   = ['Motocicleta','Camioneta','Carro','Camión','Cabezal'].includes(asset?.type);

    const data = {
      assetId, assetCode: asset?.code||'',
      failureDate: failDate, failureType: get('cmf-category'), failureCategory: get('cmf-category'),
      description: get('cmf-desc'), downtimeHours: parseFloat(document.getElementById('cmf-downtime')?.value||0),
      repairDate, provider: get('cmf-provider'),
      laborCost: labor, partsCost: parts, totalCost: labor+parts,
      rootCause: get('cmf-root'), correctiveActions: get('cmf-actions'),
      responsible: get('cmf-resp'), plant: get('cmf-plant'),
      meterKm: isKm ? meter : 0, meterHours: isKm ? 0 : meter,
      status: repairDate ? 'repaired' : 'in-progress',
    };

    const session = Auth.getSession();
    if (id) {
      try {
        await DB.updateCorrective(id, data);
        DB.addAudit({ user:session.name, action:'UPDATE', detail:'Correctivo actualizado: ' + data.assetCode });
        showToast('Registro actualizado','success');
      } catch (e) {
        showToast(e.message || 'Error actualizando correctivo', 'error');
        return;
      }
    } else {
      try {
        await DB.addCorrective(data);
        // Update asset status
        await DB.updateAsset(assetId, { status: data.status==='repaired'?'operativo':'fuera' });
        DB.addAudit({ user:session.name, action:'CREATE', detail:'Falla registrada: ' + data.assetCode + ' — ' + data.failureCategory });
        showToast('Falla registrada','success');
      } catch (e) {
        showToast(e.message || 'Error registrando falla', 'error');
        return;
      }
    }
    if (meter > 0 && asset) {
      if (isKm && meter > asset.currentKm) await DB.updateAsset(assetId, { currentKm: meter });
      else if (!isKm && meter > asset.currentHours) await DB.updateAsset(assetId, { currentHours: meter });
    }
    closeModal('cm-modal-placeholder');
    App.navigate('corrective');
  },

  async markRepaired(id) {
    const cm = DB.getCorrective().find(c=>c.id===id);
    if (!cm) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      await DB.updateCorrective(id, { status:'repaired', repairDate: today });
      await DB.updateAsset(cm.assetId, { status:'operativo' });
      DB.addAudit({ user:Auth.getSession()?.name||'', action:'COMPLETE', detail:`Correctivo reparado: ${cm.assetCode}` });
      showToast('Equipo marcado como reparado','success');
      App.navigate('corrective');
    } catch (e) {
      showToast(e.message || 'Error marcando como reparado', 'error');
      return;
    }
  },

  async delete(id) {
    const cm = DB.getCorrective().find(c=>c.id===id);
    if (!confirm('¿Eliminar este registro de falla?')) return;
    try {
      await DB.deleteCorrective(id);
      DB.addAudit({ user:Auth.getSession()?.name||'', action:'DELETE', detail:`Correctivo eliminado: ${cm?.assetCode}` });
      showToast('Registro eliminado','success');
      App.navigate('corrective');
    } catch (e) {
      showToast(e.message || 'Error eliminando correctivo', 'error');
      return;
    }
  },

  viewDetail(id) {
    const c = DB.getCorrective().find(x=>x.id===id);
    if (!c) return;
    showModal('cm-modal-placeholder', `⚠️ Detalle de Falla — ${c.assetCode}`, `
    <div class="form-grid" style="gap:12px;margin-bottom:16px">
      ${[['Activo',c.assetCode],['Fecha Falla',fmtDate(c.failureDate)],['Categoría',c.failureCategory],
         ['Estado',c.status],['Tiempo Muerto',fmtHours(c.downtimeHours)],['Fecha Reparación',fmtDate(c.repairDate)||'—'],
         ['Proveedor',c.provider||'—'],['Medidor',c.meterKm ? fmtKm(c.meterKm) : (c.meterHours ? fmtHours(c.meterHours) : '—')],['Responsable',c.responsible||'—'],['Planta',c.plant||'—']].map(([l,v])=>`
      <div><div class="form-label">${l}</div><div class="fw-700">${l==='Estado'?statusBadge(v):v}</div></div>`).join('')}
    </div>
    <div class="divider"></div>
    <div class="grid-3 mb-16" style="gap:12px">
      <div class="card" style="padding:12px;text-align:center">
        <div class="stat-number text-primary">${fmtCurrency(c.laborCost)}</div><div class="text-sm text-muted">Mano de Obra</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div class="stat-number text-warning">${fmtCurrency(c.partsCost)}</div><div class="text-sm text-muted">Repuestos</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div class="stat-number text-danger">${fmtCurrency(c.totalCost)}</div><div class="text-sm text-muted">Costo Total</div>
      </div>
    </div>
    ${c.description?`<div class="mb-16"><div class="form-label">Descripción del Problema</div><div style="margin-top:6px;color:var(--text)">${c.description}</div></div>`:''}
    ${c.rootCause?`<div class="mb-16"><div class="form-label">Causa Raíz</div><div style="margin-top:6px;color:var(--text)">${c.rootCause}</div></div>`:''}
    ${c.correctiveActions?`<div><div class="form-label">Acciones Correctivas</div><div style="margin-top:6px;color:var(--text)">${c.correctiveActions}</div></div>`:''}
    `,
    `<button class="btn btn-secondary" onclick="closeModal('cm-modal-placeholder')">Cerrar</button>`);
  },
};
