/* ====================================================
   EXPENSES MODULE — Control de Gastos
   ==================================================== */

const ExpensesModule = {
  filter: { category:'', assetId:'', costCenter:'', plant:'', month:'', year:'' },
  activeCategory: '',

  render() {
    const all = DB.getExpenses();
    const now = new Date();
    const monthExp = all.filter(e=>{const d=new Date(e.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
    const yearExp  = all.filter(e=>new Date(e.date).getFullYear()===now.getFullYear());
    const monthTotal = monthExp.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    const yearTotal  = yearExp.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    const total = all.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    const assets = DB.getAssets();
    const canEdit = Auth.getSession()?.role !== 'consulta';

    const years = [...new Set(all.map(e=>new Date(e.date).getFullYear()))].sort((a,b)=>b-a);
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>💰 Control de Gastos</h2>
        <p>Seguimiento de todos los gastos operativos de la flota</p>
      </div>
      <div class="page-header-right">
        ${canEdit?`<button class="btn btn-primary" onclick="ExpensesModule.openModal()">➕ Registrar Gasto</button>`:''}
      </div>
    </div>

    <div class="summary-stats mb-16">
      <div class="summary-stat"><div class="summary-stat-val text-primary">${fmtCurrency(monthTotal)}</div><div class="summary-stat-lbl">Este Mes</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-warning">${fmtCurrency(yearTotal)}</div><div class="summary-stat-lbl">Este Año</div></div>
      <div class="summary-stat"><div class="summary-stat-val">${fmtCurrency(total)}</div><div class="summary-stat-lbl">Total Histórico</div></div>
      <div class="summary-stat"><div class="summary-stat-val text-success">${all.length}</div><div class="summary-stat-lbl">Registros</div></div>
    </div>

    <!-- Category pills -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <span class="expense-category-pill ${this.activeCategory===''?'active':''}" onclick="ExpensesModule.setCategory('')">🔹 Todos</span>
      ${['combustible','lubricantes','llantas','baterias','repuestos','taller','manodeobra','seguro','matricula','otros'].map(c=>`
      <span class="expense-category-pill ${this.activeCategory===c?'active':''}" onclick="ExpensesModule.setCategory('${c}')">
        ${getCategoryIcon(c)} ${getCategoryLabel(c)}
      </span>`).join('')}
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <select class="form-control" onchange="ExpensesModule.setFilter('assetId',this.value)" style="width:200px">
        <option value="">Todos los activos</option>
        ${assets.map(a=>`<option value="${a.id}" ${this.filter.assetId===a.id?'selected':''}>${a.code} — ${a.brand} ${a.model}</option>`).join('')}
      </select>
      <select class="form-control" onchange="ExpensesModule.setFilter('plant',this.value)" style="width:160px">
        <option value="">Todas las plantas</option>
        ${['Planta Norte','Planta Sur','Bodega Central','Finca Sur'].map(p=>`<option value="${p}" ${this.filter.plant===p?'selected':''}>${p}</option>`).join('')}
      </select>
      <select class="form-control" onchange="ExpensesModule.setFilter('month',this.value)" style="width:130px">
        <option value="">Todos los meses</option>
        ${months.map((m,i)=>`<option value="${i}" ${this.filter.month===String(i)?'selected':''}>${m}</option>`).join('')}
      </select>
      <select class="form-control" onchange="ExpensesModule.setFilter('year',this.value)" style="width:110px">
        <option value="">Todos los años</option>
        ${years.map(y=>`<option value="${y}" ${this.filter.year===String(y)?'selected':''}>${y}</option>`).join('')}
      </select>
    </div>

    <div id="exp-content">${this.renderContent()}</div>
    <div id="exp-modal-placeholder"></div>`;
  },

  setCategory(cat) {
    this.activeCategory = cat;
    this.filter.category = cat;
    App.navigate('expenses');
  },

  setFilter(key, val) {
    this.filter[key] = val;
    document.getElementById('exp-content').innerHTML = this.renderContent();
  },

  renderContent() {
    let data = DB.getExpenses();
    const f = this.filter;
    if (f.category)   data = data.filter(e=>e.category===f.category);
    if (f.assetId)    data = data.filter(e=>e.assetId===f.assetId);
    if (f.plant)      data = data.filter(e=>e.plant===f.plant);
    if (f.month!=='') data = data.filter(e=>new Date(e.date).getMonth()===parseInt(f.month));
    if (f.year)       data = data.filter(e=>new Date(e.date).getFullYear()===parseInt(f.year));

    data = [...data].sort((a,b)=>new Date(b.date)-new Date(a.date));

    const total = data.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);

    if (data.length === 0) return `<div class="empty-state"><div class="empty-icon">💰</div><h3>Sin gastos</h3><p>Registra el primer gasto operativo.</p></div>`;

    const canEdit = Auth.getSession()?.role !== 'consulta';
    return `
    <div class="card" style="padding:0">
      <div class="flex-between" style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div class="text-sm text-muted">${data.length} registros</div>
        <div class="fw-700 text-primary">${fmtCurrency(total)} total filtrado</div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Fecha</th><th>Categoría</th><th>Activo</th><th>Descripción</th>
            <th>C. Costo</th><th>Planta</th><th>Factura</th><th>Monto</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${data.slice(0,50).map(e=>{
              const asset = DB.getAsset(e.assetId);
              return `<tr>
                <td class="text-sm">${fmtDate(e.date)}</td>
                <td><span class="badge badge-muted">${getCategoryIcon(e.category)} ${getCategoryLabel(e.category)}</span></td>
                <td class="fw-700">${asset?.code||'—'}</td>
                <td class="text-sm text-muted" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.description||'—'}</td>
                <td class="text-sm text-muted">${e.costCenter||'—'}</td>
                <td class="text-sm text-muted">${e.plant||'—'}</td>
                <td class="text-sm text-muted">${e.invoice||'—'}</td>
                <td class="fw-700">${fmtCurrency(e.amount)}</td>
                <td>
                  <div class="table-actions">
                    ${canEdit?`
                    <button class="btn btn-outline btn-icon btn-sm" onclick="ExpensesModule.openModal('${e.id}')" title="Editar">✏️</button>
                    <button class="btn btn-outline btn-icon btn-sm" onclick="ExpensesModule.delete('${e.id}')" title="Eliminar">🗑️</button>`:''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  },

  openModal(id = null) {
    const exp = id ? DB.getExpenses().find(e=>e.id===id) : null;
    const assets = DB.getAssets();
    const title = exp ? '✏️ Editar Gasto' : '➕ Registrar Gasto Operativo';
    const v = exp || { date:'', category:'combustible', amount:0, assetId:'', description:'', costCenter:'', plant:'', provider:'', invoice:'' };

    showModal('exp-modal-placeholder', title, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input class="form-control" type="date" id="ef-date" value="${v.date||new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group">
        <label class="form-label">Categoría *</label>
        <select class="form-control" id="ef-cat">
          ${['combustible','lubricantes','llantas','baterias','repuestos','taller','manodeobra','seguro','matricula','otros'].map(c=>`<option value="${c}" ${v.category===c?'selected':''}>${getCategoryIcon(c)} ${getCategoryLabel(c)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Monto (${DB.getSettings().currency||'Q'}) *</label>
        <input class="form-control" type="number" id="ef-amount" value="${v.amount||0}" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Activo</label>
        <select class="form-control" id="ef-asset">
          <option value="">Sin activo específico</option>
          ${assets.map(a=>`<option value="${a.id}" ${v.assetId===a.id?'selected':''}>${a.code} — ${a.brand} ${a.model}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Centro de Costo</label>
        <input class="form-control" id="ef-cc" value="${v.costCenter||''}" placeholder="CC-01">
      </div>
      <div class="form-group">
        <label class="form-label">Planta</label>
        <select class="form-control" id="ef-plant">
          <option value="">Sin planta</option>
          ${['Planta Norte','Planta Sur','Bodega Central','Finca Sur'].map(p=>`<option ${v.plant===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Proveedor</label>
        <input class="form-control" id="ef-provider" value="${v.provider||''}" placeholder="Nombre del proveedor">
      </div>
      <div class="form-group">
        <label class="form-label">No. Factura / Comprobante</label>
        <input class="form-control" id="ef-invoice" value="${v.invoice||''}" placeholder="FAC-0001">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <textarea class="form-control" id="ef-desc" placeholder="Detalle del gasto...">${v.description||''}</textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal('exp-modal-placeholder')">Cancelar</button>
     <button class="btn btn-primary" onclick="ExpensesModule.save('${id||''}')">💾 Guardar</button>`
    );
  },

  save(id) {
    const get = sel => document.getElementById(sel)?.value?.trim();
    const date = get('ef-date');
    const amount = parseFloat(document.getElementById('ef-amount')?.value||0);
    if (!date || !amount) { showToast('Fecha y monto son obligatorios','error'); return; }

    const data = {
      date, category: get('ef-cat'), amount,
      assetId: get('ef-asset'), description: get('ef-desc'),
      costCenter: get('ef-cc'), plant: get('ef-plant'),
      provider: get('ef-provider'), invoice: get('ef-invoice'),
    };

    const session = Auth.getSession();
    if (id) {
      DB.updateExpense(id, data);
      DB.addAudit({ user:session.name, action:'UPDATE', detail:`Gasto actualizado: ${getCategoryLabel(data.category)} ${fmtCurrency(data.amount)}` });
      showToast('Gasto actualizado','success');
    } else {
      DB.addExpense(data);
      DB.addAudit({ user:session.name, action:'CREATE', detail:`Gasto registrado: ${getCategoryLabel(data.category)} ${fmtCurrency(data.amount)}` });
      showToast('Gasto registrado','success');
    }
    closeModal('exp-modal-placeholder');
    document.getElementById('exp-content').innerHTML = this.renderContent();
  },

  delete(id) {
    const e = DB.getExpenses().find(x=>x.id===id);
    if (!confirm('¿Eliminar este registro de gasto?')) return;
    DB.deleteExpense(id);
    DB.addAudit({ user:Auth.getSession()?.name||'', action:'DELETE', detail:`Gasto eliminado: ${fmtCurrency(e?.amount)}` });
    showToast('Gasto eliminado','success');
    document.getElementById('exp-content').innerHTML = this.renderContent();
  },
};
