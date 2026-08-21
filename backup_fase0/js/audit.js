/* ====================================================
   AUDIT LOG MODULE
   ==================================================== */

const AuditModule = {
  render() {
    const audit = DB.getAudit();
    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>🗂️ Bitácora de Auditoría</h2>
        <p>Registro de todas las acciones realizadas en el sistema</p>
      </div>
      <div class="page-header-right">
        <button class="btn btn-outline btn-sm" onclick="AuditModule.clearOld()">🗑️ Limpiar >30 días</button>
        <button class="btn btn-secondary btn-sm" onclick="AuditModule.exportAudit()">📥 Exportar</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Registro de Eventos</div>
          <div class="card-subtitle">${audit.length} eventos registrados</div>
        </div>
      </div>
      <div style="max-height:600px;overflow-y:auto;">
        ${audit.length === 0 ? `<div class="empty-state"><div class="empty-icon">🗂️</div><h3>Sin registros</h3><p>Las acciones del sistema aparecerán aquí.</p></div>` :
          audit.map(e => `
          <div class="audit-entry">
            <span class="audit-time">${fmtDate(e.ts?.split('T')[0])} ${e.ts?.split('T')[1]?.slice(0,5)||''}</span>
            <span class="audit-user">${e.user||'—'}</span>
            <span class="audit-action">${e.action||'—'}</span>
            <span class="audit-detail">${e.detail||'—'}</span>
          </div>`).join('')
        }
      </div>
    </div>`;
  },

  clearOld() {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
    const audit = DB.getAudit().filter(e => new Date(e.ts) >= cutoff);
    DB.set(DB.KEYS.audit, audit);
    App.navigate('audit');
    showToast('Registros antiguos eliminados','success');
  },

  exportAudit() {
    const audit = DB.getAudit();
    const rows = [['Fecha','Usuario','Acción','Detalle']];
    audit.forEach(e => rows.push([e.ts,e.user,e.action,e.detail]));
    const csv = rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    downloadFile(csv,'auditoria-flota.csv','text/csv');
  },
};
