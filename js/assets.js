/* ====================================================
   ASSETS MODULE — Registro de Activos
   ==================================================== */

const AssetsModule = {
  view: 'table', // 'table' | 'cards'
  filter: { search:'', type:'', status:'', location:'', area:'', localidad:'', departamento:'' },
  currentPage: 1,
  perPage: 10,

  render() {
    const assets      = DB.getAssets();
    const types       = [...new Set(assets.map(a=>a.type))].filter(Boolean);
    const locations   = [...new Set(assets.map(a=>a.location))].filter(Boolean);
    const areas       = [...new Set(assets.map(a=>a.area))].filter(Boolean);
    const localidades = [...new Set(assets.map(a=>a.localidad))].filter(Boolean);
    const deptos      = [...new Set(assets.map(a=>a.departamento))].filter(Boolean);
    const total = assets.length;
    const op    = assets.filter(a=>a.status==='operativo').length;
    const mnt   = assets.filter(a=>a.status==='mantenimiento').length;
    const out   = assets.filter(a=>a.status==='fuera').length;

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>🚛 Registro de Activos</h2>
        <p>Gestión de vehículos, equipos y maquinaria de la flota</p>
      </div>
      <div class="page-header-right">
        <button class="btn btn-outline btn-sm" onclick="AssetsModule.toggleView()" id="btn-toggle-view">📋 Vista Tarjetas</button>
        ${Auth.can('assets') && !['consulta'].includes(Auth.getSession()?.role) ? `
          <button class="btn btn-outline btn-sm" onclick="AssetsModule.downloadTemplate()">📂 Plantilla Excel</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('assets-import-file').click()" style="display:inline-flex; align-items:center; gap:6px;">
            📤 Importar Excel
          </button>
          <input type="file" id="assets-import-file" style="display:none" accept=".xlsx,.xls,.csv" onchange="AssetsModule.importExcel(event)">
          <button class="btn btn-primary" onclick="AssetsModule.openModal()">➕ Nuevo Activo</button>
        ` : ''}
      </div>
    </div>

    <!-- Summary -->
    <div class="summary-stats mb-16">
      <div class="summary-stat">
        <div class="summary-stat-val">${total}</div>
        <div class="summary-stat-lbl">Total Activos</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-val text-success">${op}</div>
        <div class="summary-stat-lbl">Operativos</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-val text-warning">${mnt}</div>
        <div class="summary-stat-lbl">En Mantenimiento</div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-val text-danger">${out}</div>
        <div class="summary-stat-lbl">Fuera de Servicio</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="search-input">
        <span class="search-icon">🔍</span>
        <input class="form-control" type="text" placeholder="Buscar código, marca, modelo, placa..." id="asset-search"
          value="${this.filter.search}" oninput="AssetsModule.setFilter('search',this.value)">
      </div>
      <select class="form-control" onchange="AssetsModule.setFilter('type',this.value)" style="width:160px">
        <option value="">Todos los tipos</option>
        ${['Motocicleta','Camioneta','Carro','Camión','Montacarga','Cabezal','Remolque','Tractor','Generador','Equipo Industrial'].map(t=>`<option value="${t}" ${this.filter.type===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <select class="form-control" onchange="AssetsModule.setFilter('status',this.value)" style="width:170px">
        <option value="">Todos los estados</option>
        <option value="operativo"    ${this.filter.status==='operativo'?'selected':''}>✅ Operativo</option>
        <option value="mantenimiento"${this.filter.status==='mantenimiento'?'selected':''}>🔧 Mantenimiento</option>
        <option value="fuera"        ${this.filter.status==='fuera'?'selected':''}>🔴 Fuera de Servicio</option>
      </select>
      <select class="form-control" onchange="AssetsModule.setFilter('location',this.value)" style="width:150px">
        <option value="">Todas las plantas</option>
        ${locations.map(l=>`<option value="${l}" ${this.filter.location===l?'selected':''}>${l}</option>`).join('')}
      </select>
      <select class="form-control" onchange="AssetsModule.setFilter('area',this.value)" style="width:140px">
        <option value="">Todas las áreas</option>
        ${areas.map(a=>`<option value="${a}" ${this.filter.area===a?'selected':''}>${a}</option>`).join('')}
      </select>
      <select class="form-control" onchange="AssetsModule.setFilter('localidad',this.value)" style="width:140px">
        <option value="">Todas las localidades</option>
        ${localidades.map(l=>`<option value="${l}" ${this.filter.localidad===l?'selected':''}>${l}</option>`).join('')}
      </select>
      <select class="form-control" onchange="AssetsModule.setFilter('departamento',this.value)" style="width:150px">
        <option value="">Todos los departamentos</option>
        ${deptos.map(d=>`<option value="${d}" ${this.filter.departamento===d?'selected':''}>${d}</option>`).join('')}
      </select>
    </div>

    <!-- Content -->
    <div id="assets-content">${this.renderContent()}</div>

    <!-- Modal placeholder -->
    <div id="asset-modal-placeholder"></div>`;
  },

  renderContent() {
    let data = DB.getAssets();
    const f  = this.filter;
    if (f.search)       data = data.filter(a => `${a.code}${a.brand}${a.model}${a.plate}${a.type}${a.area||''}${a.localidad||''}${a.departamento||''}`.toLowerCase().includes(f.search.toLowerCase()));
    if (f.type)         data = data.filter(a => a.type === f.type);
    if (f.status)       data = data.filter(a => a.status === f.status);
    if (f.location)     data = data.filter(a => a.location === f.location);
    if (f.area)         data = data.filter(a => a.area === f.area);
    if (f.localidad)    data = data.filter(a => a.localidad === f.localidad);
    if (f.departamento) data = data.filter(a => a.departamento === f.departamento);

    if (data.length === 0) return `<div class="empty-state"><div class="empty-icon">🚛</div><h3>Sin activos</h3><p>Agrega el primer activo de tu flota.</p></div>`;

    if (this.view === 'cards') return this.renderCards(data);
    return this.renderTable(data);
  },

  renderTable(data) {
    const start = (this.currentPage-1)*this.perPage;
    const page  = data.slice(start, start+this.perPage);
    const pages = Math.ceil(data.length/this.perPage);
    const canEdit = Auth.getSession()?.role !== 'consulta';

    return `
    <div class="card" style="padding:0">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>•</th><th>Código</th><th>Tipo</th><th>Marca / Modelo</th><th>Año</th>
            <th>Placa</th><th>Ubicación</th><th>Área</th><th>Localidad</th><th>Departamento</th>
            <th>Responsable</th><th>Estado</th><th>Medidor</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${page.map(a=>`
            <tr>
              <td><span class="semaphore ${a.status==='operativo'?'sem-green':a.status==='mantenimiento'?'sem-yellow':'sem-red'}"></span></td>
              <td><strong>${a.code}</strong></td>
              <td>${getAssetIcon(a.type)} ${a.type}</td>
              <td>${a.brand} ${a.model}</td>
              <td>${a.year}</td>
              <td>${a.plate||'—'}</td>
              <td>${a.location||'—'}</td>
              <td class="text-sm">${a.area||'—'}</td>
              <td class="text-sm">${a.localidad||'—'}</td>
              <td class="text-sm">${a.departamento||'—'}</td>
              <td class="text-sm text-muted">${a.responsible||'—'}</td>
              <td>${statusBadge(a.status)}</td>
              <td class="text-sm">${a.currentKm>0?fmtKm(a.currentKm):''}${a.currentHours>0?fmtHours(a.currentHours):''}</td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-outline btn-icon btn-sm" onclick="AssetsModule.viewDetail('${a.id}')" title="Ver detalle">👁️</button>
                  ${canEdit?`<button class="btn btn-outline btn-icon btn-sm" onclick="AssetsModule.openModal('${a.id}')" title="Editar">✏️</button>
                  <button class="btn btn-outline btn-icon btn-sm" onclick="AssetsModule.deleteAsset('${a.id}')" title="Eliminar">🗑️</button>`:''}
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${pages>1?`<div class="pagination">${Array.from({length:pages},(_,i)=>`<button class="page-btn ${i+1===this.currentPage?'active':''}" onclick="AssetsModule.goPage(${i+1})">${i+1}</button>`).join('')}</div>`:''}
    </div>`;
  },

  renderCards(data) {
    return `<div class="asset-cards-grid">${data.map(a=>`
    <div class="asset-card">
      <div class="asset-card-header">
        <div class="asset-type-icon">${getAssetIcon(a.type)}</div>
        <div>
          <div class="asset-code">${a.code}</div>
          <div class="asset-name">${a.brand} ${a.model}</div>
        </div>
        <div class="asset-card-status">${statusBadge(a.status)}</div>
      </div>
      <div class="asset-meta">
        <div class="asset-meta-item"><div class="asset-meta-label">Tipo</div><div class="asset-meta-value">${a.type}</div></div>
        <div class="asset-meta-item"><div class="asset-meta-label">Año</div><div class="asset-meta-value">${a.year}</div></div>
        <div class="asset-meta-item"><div class="asset-meta-label">Placa</div><div class="asset-meta-value">${a.plate||'—'}</div></div>
        <div class="asset-meta-item"><div class="asset-meta-label">Ubicación</div><div class="asset-meta-value">${a.location||'—'}</div></div>
        <div class="asset-meta-item"><div class="asset-meta-label">Área</div><div class="asset-meta-value">${a.area||'—'}</div></div>
        <div class="asset-meta-item"><div class="asset-meta-label">Localidad</div><div class="asset-meta-value">${a.localidad||'—'}</div></div>
        <div class="asset-meta-item"><div class="asset-meta-label">Depto.</div><div class="asset-meta-value">${a.departamento||'—'}</div></div>
      </div>
      <div class="asset-card-footer">
        <div class="meter-info">📍 ${a.responsible||'Sin responsable'}</div>
        <div class="meter-value">${a.currentKm>0?fmtKm(a.currentKm):''}${a.currentHours>0?`${fmtHours(a.currentHours)}`:'—'}</div>
      </div>
    </div>`).join('')}</div>`;
  },

  setFilter(key, val) {
    this.filter[key] = val;
    this.currentPage = 1;
    document.getElementById('assets-content').innerHTML = this.renderContent();
  },

  goPage(p) { this.currentPage = p; document.getElementById('assets-content').innerHTML = this.renderContent(); },

  toggleView() {
    this.view = this.view === 'table' ? 'cards' : 'table';
    document.getElementById('btn-toggle-view').textContent = this.view==='table'?'📋 Vista Tarjetas':'📊 Vista Tabla';
    document.getElementById('assets-content').innerHTML = this.renderContent();
  },

  openModal(id = null) {
    const asset = id ? DB.getAsset(id) : null;
    const title = asset ? `✏️ Editar Activo — ${asset.code}` : '➕ Nuevo Activo';
    const v = asset || { code:'',type:'Camión',brand:'',model:'',year:new Date().getFullYear(),plate:'',serial:'',location:'',responsible:'',usuario:'',area:'',localidad:'',departamento:'',status:'operativo',currentKm:0,currentHours:0,notes:'',inspectionDate:'' };

    showModal('asset-modal-placeholder', title, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Código de Activo *</label>
        <input class="form-control" id="af-code" value="${v.code}" placeholder="CAM-001">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de Equipo *</label>
        <select class="form-control" id="af-type">
          ${['Motocicleta','Camioneta','Carro','Camión','Montacarga','Cabezal','Remolque','Tractor','Generador','Equipo Industrial'].map(t=>`<option ${v.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Marca *</label>
        <input class="form-control" id="af-brand" value="${v.brand}" placeholder="Freightliner">
      </div>
      <div class="form-group">
        <label class="form-label">Modelo *</label>
        <input class="form-control" id="af-model" value="${v.model}" placeholder="Cascadia">
      </div>
      <div class="form-group">
        <label class="form-label">Año</label>
        <input class="form-control" type="number" id="af-year" value="${v.year}" min="1990" max="2030">
      </div>
      <div class="form-group">
        <label class="form-label">Placa</label>
        <input class="form-control" id="af-plate" value="${v.plate}" placeholder="P-1234-A">
      </div>
      <div class="form-group">
        <label class="form-label">Número de Serie</label>
        <input class="form-control" id="af-serial" value="${v.serial}" placeholder="VIN/Serial">
      </div>
      <div class="form-group">
        <label class="form-label">Ubicación / Planta</label>
        <input class="form-control" id="af-location" value="${v.location}" placeholder="Planta Norte">
      </div>
      <div class="form-group">
        <label class="form-label">Área</label>
        <input class="form-control" id="af-area" value="${v.area||''}" placeholder="Área operativa">
      </div>
      <div class="form-group">
        <label class="form-label">Localidad</label>
        <input class="form-control" id="af-localidad" value="${v.localidad||''}" placeholder="Ciudad / Localidad">
      </div>
      <div class="form-group">
        <label class="form-label">Departamento</label>
        <input class="form-control" id="af-departamento" value="${v.departamento||''}" placeholder="Departamento">
      </div>
      <div class="form-group">
        <label class="form-label">Usuario</label>
        <input class="form-control" id="af-usuario" value="${v.usuario||''}" placeholder="Usuario asignado">
      </div>
      <div class="form-group">
        <label class="form-label">Responsable</label>
        <input class="form-control" id="af-responsible" value="${v.responsible}" placeholder="Nombre del responsable">
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-control" id="af-status">
          <option value="operativo"     ${v.status==='operativo'?'selected':''}>✅ Operativo</option>
          <option value="mantenimiento" ${v.status==='mantenimiento'?'selected':''}>🔧 En Mantenimiento</option>
          <option value="fuera"         ${v.status==='fuera'?'selected':''}>🔴 Fuera de Servicio</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Odómetro actual (km)</label>
        <input class="form-control" type="number" id="af-km" value="${v.currentKm||0}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Horómetro actual (hrs)</label>
        <input class="form-control" type="number" id="af-hours" value="${v.currentHours||0}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Venc. Inspección Mec. y Gases</label>
        <input class="form-control" type="date" id="af-inspection" value="${v.inspectionDate||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Observaciones</label>
      <textarea class="form-control" id="af-notes" placeholder="Notas adicionales...">${v.notes||''}</textarea>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal('asset-modal-placeholder')">Cancelar</button>
     <button class="btn btn-primary" onclick="AssetsModule.save('${id||''}')">💾 Guardar</button>`
    );
  },

          async save(id) {
    const get = sel => document.getElementById(sel)?.value?.trim();
    const code = get('af-code');
    if (!code) { showToast('El código es obligatorio','error'); return; }
    const data = {
      code, type: get('af-type'), brand: get('af-brand'), model: get('af-model'),
      year: parseInt(get('af-year')) || '',
      plate: get('af-plate'), serial: get('af-serial'),
      location: get('af-location'), responsible: get('af-responsible'), status: get('af-status'),
      area: get('af-area')||'', localidad: get('af-localidad')||'', departamento: get('af-departamento')||'',
      usuario: get('af-usuario')||'',
      currentKm: parseFloat(document.getElementById('af-km')?.value||0),
      currentHours: parseFloat(document.getElementById('af-hours')?.value||0),
      inspectionDate: get('af-inspection'),
      notes: document.getElementById('af-notes')?.value||'',
    };

    const session = Auth.getSession();
    const btn = document.getElementById('af-submit') || document.querySelector(`[onclick="AssetsModule.save('${id||''}')"]`);
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-loader"></span> Guardando...';
    }

    try {
      if (id) {
        await DB.updateAsset(id, data);
        DB.addAudit({ user: session.name, action:'UPDATE', detail:`Activo actualizado: ${data.code}` });
        showToast(`Activo ${data.code} actualizado`,'success');
      } else {
        await DB.addAsset(data);
        DB.addAudit({ user: session.name, action:'CREATE', detail:`Nuevo activo: ${data.code}` });
        showToast(`Activo ${data.code} creado`,'success');
      }
      closeModal('asset-modal-placeholder');
      App.navigate('assets');
    } catch (e) {
      showToast(e.message || 'Error guardando activo', 'error');
      return;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  },

    async deleteAsset(id) {
    const a = DB.getAsset(id);
    if (!confirm(`¿Eliminar activo ${a?.code}? Esta acción no se puede deshacer.`)) return;
    
    // Cascade delete maintenance records
    const prev = DB.getPreventive().filter(p => p.assetId !== id);
    const corr = DB.getCorrective().filter(c => c.assetId !== id);
    DB.savePreventive(prev);
    DB.saveCorrective(corr);
    
    try {
      await DB.deleteAsset(id);
      DB.addAudit({ user: Auth.getSession()?.name||'', action:'DELETE', detail:`Activo eliminado: ${a?.code} y sus mantenimientos` });
      showToast('Activo y sus mantenimientos eliminados','success');
    } catch (e) {
      showToast(e.message || 'Error eliminando activo', 'error');
      return;
    }
    App.navigate('assets');
  },

  downloadTemplate() {
    if (!window.XLSX) { showToast('Librería de Excel no disponible', 'error'); return; }
    const headers = [
      'Código','Tipo','Marca','Modelo','Año','Placa','Número de Serie',
      'Ubicación','Área','Localidad','Departamento','Usuario',
      'Responsable','Estado','Kilometraje','Horómetro','Inspección (Fecha vencimiento)','Notas'
    ];
    const exampleRows = [
      ['VH-001','Camión','International','4300',2020,'P-1234','1HTSHAZT0AH000001','Planta Norte','Transporte','Ciudad Capital','Guatemala','juan.perez','Juan Pérez','operativo',15000,0,'2025-12-31','Ejemplo de camión'],
      ['MF-002','Montacarga','Toyota','8FBR15',2019,'','TYT1234567','Bodega Central','Logística','Escuintla','Escuintla','carlos.lopez','Carlos López','operativo',0,2500,'2025-06-30','Ejemplo de montacarga'],
      ['VH-003','Carro','Toyota','Hilux',2021,'P-5678','ABC123456789','Finca Sur','Agrícola','Retalhuleu','Retalhuleu','maria.garcia','María García','mantenimiento',8000,0,'2026-03-15','Ejemplo de vehículo'],
    ];
    const notes = [
      [],
      ['INSTRUCCIONES DE USO:'],
      ['- La columna Código es OBLIGATORIA.'],
      ['- Tipo: Camión, Montacarga, Cabezal, Remolque, Tractor, Carro, Camioneta, Motocicleta, Generador, Equipo Industrial'],
      ['- Estado: operativo, mantenimiento, fuera'],
      ['- La columna Inspección debe tener formato YYYY-MM-DD (ej: 2025-12-31)'],
      ['- Si usa Kilometraje, deje Horómetro en 0 y viceversa.'],
      ['- Los campos Área, Localidad y Departamento son usados en el Dashboard para filtrar indicadores.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows, [], ...notes]);
    ws['!cols'] = [
      {wch:12},{wch:16},{wch:14},{wch:16},{wch:6},{wch:12},{wch:22},
      {wch:16},{wch:14},{wch:14},{wch:16},{wch:16},
      {wch:18},{wch:14},{wch:14},{wch:12},{wch:26},{wch:30}
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Activos');
    XLSX.writeFile(wb, 'Plantilla_Importacion_Activos_ECOM.xlsx');
    showToast('Plantilla descargada correctamente', 'success');
  },

  async importExcel(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (!file) return;
    if (this._importing) { showToast('Importación en curso...', 'warning'); return; }

    this._importing = true;
    input.disabled = true;

    try {
      const json = await this._readExcelFile(file);
      const validation = this._validateImportRows(json);

      if (validation.validRows.length === 0) {
        showToast('No se encontraron filas válidas para importar', 'error');
        return;
      }

      if (validation.invalidRecords.length > 0 || validation.warnings.length > 0) {
        const msg = `Se importarán ${validation.validRows.length} filas. ${validation.invalidRecords.length} rechazadas. ${validation.warnings.length} advertencias. ¿Continuar?`;
        if (!confirm(msg)) return;
      }

      const result = await DB.bulkAddAssets(validation.validRows);

      const totalConfirmed = result.totalConfirmed;
      const totalPersistenceRejected = result.totalPersistenceRejected;
      const totalPending = result.totalPending;
      const totalInvalid = validation.invalidRecords.length;
      const totalEmpty = validation.totalEmpty;
      const totalSourceRows = validation.totalEmpty + validation.totalReceived;

      if (totalConfirmed > 0) {
        DB.addAudit({ user: Auth.getSession()?.name || '', action: 'IMPORT', detail: `Importados ${totalConfirmed} activos` });
      }

      let message = '';
      if (totalConfirmed > 0 && totalPersistenceRejected === 0 && validation.invalidRecords.length === 0) {
        message = `Importación exitosa: ${totalConfirmed} activos cargados`;
      } else if (totalConfirmed > 0) {
        message = `Importación parcial: ${result.totalConfirmed} confirmados, ${validation.invalidRecords.length} inválidos, ${result.totalPersistenceRejected} fallaron, ${result.totalPending} pendientes.`;
      } else {
        message = 'No se pudo importar ningún activo.';
      }

      const toastType = totalConfirmed > 0 ? (totalPersistenceRejected === 0 && validation.invalidRecords.length === 0 ? 'success' : 'warning') : 'error';
      showToast(message, toastType);

      if (totalConfirmed > 0) {
        DB.addAudit({ user: Auth.getSession()?.name || '', action: 'IMPORT', detail: `Importados ${totalConfirmed} activos` });
      }

      document.getElementById('assets-content').innerHTML = this.renderContent();

    } catch (err) {
      console.error('[Import] Error:', err);
      showToast(err.message || 'Error en importación masiva', 'error');
    } finally {
      this._importing = false;
      input.disabled = false;
      input.value = '';
    }
  },

  _readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsArrayBuffer(file);
    });
  },

  _validateImportRows(json) {
    const validRows = [];
    const invalidRecords = [];
    const warnings = [];
    let totalEmpty = 0;
    let rowNum = 0;

    const seenCodes = new Set();

    json.forEach(row => {
      rowNum++;
      if (this._isEmptyRow(row)) {
        return; // skip empty rows
      }

      const code = row['Código'] || row['Codigo'] || row['CODE'];
      const type = row['Tipo'] || row['Type'] || '';
      const brand = row['Marca'] || row['Brand'] || '';
      const model = row['Modelo'] || row['Model'] || '';
      const yearRaw = row['Año'] || row['Year'] || '';
      const plate = row['Placa'] || row['Plate'] || '';
      const serial = row['Número de Serie'] || row['Serie'] || row['Serial'] || '';
      const location = row['Ubicación'] || row['Location'] || row['Planta'] || '';
      const area = row['Área'] || row['Area'] || '';
      const localidad = row['Localidad'] || '';
      const departamento = row['Departamento'] || '';
      const usuario = row['Usuario'] || '';
      const responsible = row['Responsable'] || row['Responsible'] || '';
      const statusRaw = row['Estado'] || row['Status'] || '';
      const kmRaw = row['Kilometraje'] || row['Km'] || 0;
      const hoursRaw = row['Horómetro'] || row['Hours'] || 0;
      const inspectionRaw = row['Inspección (Fecha vencimiento)'] || row['Inspección'] || row['InspectionDate'] || '';
      const notes = row['Notas'] || row['Notes'] || '';

      const errors = [];
      const warnings = [];

      if (!type || !type.trim()) errors.push('Tipo obligatorio');
      if (!brand || !brand.trim()) errors.push('Marca obligatoria');
      if (!model || !model.trim()) errors.push('Modelo obligatorio');

      const yearResult = DB._validateYear(yearRaw);
      if (!yearResult.valid) errors.push(yearResult.error);
      else if (yearResult.warnings.length) warnings.push({ row: rowNum, message: yearResult.warnings[0] });

      const km = parseFloat(kmRaw) || 0;
      if (km < 0) errors.push('Kilometraje no puede ser negativo');

      const hours = parseFloat(hoursRaw) || 0;
      if (hours < 0) errors.push('Horómetro no puede ser negativo');

      const statusResult = DB._validateStatus(statusRaw);
      if (!statusResult.valid) errors.push(statusResult.error);

      const inspectionDate = DB._parseExcelDate(inspectionRaw);
      if (inspectionRaw && !inspectionDate) {
        warnings.push({ row: rowNum, field: 'inspectionDate', message: 'Fecha inválida, se guardará vacía' });
      }

      if (errors.length > 0) {
        invalidRecords.push({ row: rowNum, code: code || 'SIN_CODIGO', errors });
        return;
      }

      const normalizedCode = DB._normalizeAssetCode(code);
      if (seenCodes.has(normalizedCode)) {
        invalidRecords.push({ row: rowNum, code: code, message: 'Duplicado en archivo' });
        return;
      }
      seenCodes.add(normalizedCode);

      if (DB._cache.assets.some(a => DB._normalizeAssetCode(a.code) === normalizedCode)) {
        invalidRecords.push({ row: rowNum, code: code, message: 'Código ya existe en BD' });
        return;
      }

      validRows.push({
        id: DB.newId(),
        code: code.trim(),
        type: type.trim(),
        brand: brand.trim(),
        model: model.trim(),
        year: yearResult.valid ? yearResult.value : new Date().getFullYear(),
        plate: plate.trim(),
        serial: serial.trim(),
        location: location.trim(),
        area: area.trim(),
        localidad: localidad.trim(),
        departamento: departamento.trim(),
        usuario: usuario.trim(),
        responsible: responsible.trim(),
        status: statusResult.value,
        currentKm: km,
        currentHours: hours,
        inspectionDate: inspectionDate,
        notes: notes.trim(),
        createdAt: new Date().toISOString()
      });
      if (warnings.length) warnings.push({ row: rowNum, message: warnings[0] });
    });

    return { validRows, invalidRecords, warnings, totalEmpty: emptyCount, totalReceived: validRows.length + invalidRecords.length, totalInvalid: invalidRecords.length, totalValid: validRows.length };
  },

  _isEmptyRow(row) {
    return Object.values(row).every(v => {
      if (v === null || v === undefined) return true;
      if (typeof v === 'string') return v.trim() === '';
      return false;
    });
  },

  _importing: false,

  viewDetail(id) {
    const a = DB.getAsset(id);
    if (!a) return;
    const prevMaint = DB.getPreventive().filter(p=>p.assetId===id).slice(0,3);
    const corrMaint = DB.getCorrective().filter(c=>c.assetId===id).slice(0,3);
    const totalCost = [
      ...DB.getPreventive().filter(p=>p.assetId===id),
      ...DB.getCorrective().filter(c=>c.assetId===id)
    ].reduce((s,r)=>s+(parseFloat(r.cost||r.totalCost)||0),0);
    const faults    = DB.getCorrective().filter(c=>c.assetId===id).length;

    showModal('asset-modal-placeholder', `${getAssetIcon(a.type)} ${a.code} — ${a.brand} ${a.model}`, `
    <div class="form-grid" style="gap:12px;margin-bottom:20px">
      ${[
        ['Código',a.code],['Tipo',a.type],['Marca',a.brand],['Modelo',a.model],['Año',a.year],
        ['Placa',a.plate||'—'],['Serie',a.serial||'—'],['Ubicación',a.location||'—'],
        ['Área',a.area||'—'],['Localidad',a.localidad||'—'],['Departamento',a.departamento||'—'],
        ['Usuario',a.usuario||'—'],['Responsable',a.responsible||'—'],['Estado',a.status]
      ].map(([l,v])=>`
      <div><div class="form-label">${l}</div><div class="fw-700">${l==='Estado'?statusBadge(v):v}</div></div>`).join('')}
    </div>
    <div class="divider"></div>
    <div class="grid-3 mb-16" style="gap:12px">
      <div class="card" style="padding:12px;text-align:center">
        <div class="stat-number text-primary">${fmtCurrency(totalCost)}</div>
        <div class="text-sm text-muted">Costo Total</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div class="stat-number text-danger">${faults}</div>
        <div class="text-sm text-muted">Fallas Registradas</div>
      </div>
      <div class="card" style="padding:12px;text-align:center">
        <div class="stat-number text-success">${a.currentKm>0?fmtKm(a.currentKm):fmtHours(a.currentHours)}</div>
        <div class="text-sm text-muted">Medidor Actual</div>
      </div>
    </div>
    ${a.notes?`<div class="card" style="padding:12px;margin-bottom:12px"><div class="text-sm text-muted">Observaciones</div><div style="margin-top:4px">${a.notes}</div></div>`:''}
    `, `<button class="btn btn-secondary" onclick="closeModal('asset-modal-placeholder')">Cerrar</button>
        <button class="btn btn-primary" onclick="closeModal('asset-modal-placeholder');AssetsModule.openModal('${id}')">✏️ Editar</button>`, 'modal-lg');
  },
};
