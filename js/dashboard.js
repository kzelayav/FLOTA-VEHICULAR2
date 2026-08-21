/* ====================================================
   DASHBOARD MODULE — KPIs + Charts
   ==================================================== */

const DashboardModule = {
  charts: {},
  filter: { area:'', localidad:'', departamento:'' },

  render() {
    const assets = DB.getAssets();
    const areas = [...new Set(assets.map(a=>a.area))].filter(Boolean);
    const localidades = [...new Set(assets.map(a=>a.localidad))].filter(Boolean);
    const deptos = [...new Set(assets.map(a=>a.departamento))].filter(Boolean);

    return `
    <div class="page-header">
      <div class="page-header-left">
        <h2>📊 Dashboard Ejecutivo</h2>
        <p>Indicadores clave de rendimiento de la flota en tiempo real</p>
      </div>
      <div class="page-header-right">
        <button class="btn btn-outline btn-sm" onclick="DashboardModule.refresh()">🔄 Actualizar</button>
        <span class="text-sm text-muted" id="dash-updated"></span>
      </div>
    </div>

    <!-- Alert Summary Row -->
    <div class="alert-summary-row" id="dash-alert-row"></div>

    <!-- Dashboard Filters -->
    <div class="filter-bar" style="margin-bottom:20px; display:flex; gap:12px;">
      <select class="form-control" onchange="DashboardModule.setFilter('area',this.value)">
        <option value="">Todas las áreas</option>
        ${areas.map(a=>`<option value="${a}" ${this.filter.area===a?'selected':''}>${a}</option>`).join('')}
      </select>
      <select class="form-control" onchange="DashboardModule.setFilter('localidad',this.value)">
        <option value="">Todas las localidades</option>
        ${localidades.map(l=>`<option value="${l}" ${this.filter.localidad===l?'selected':''}>${l}</option>`).join('')}
      </select>
      <select class="form-control" onchange="DashboardModule.setFilter('departamento',this.value)">
        <option value="">Todos los departamentos</option>
        ${deptos.map(d=>`<option value="${d}" ${this.filter.departamento===d?'selected':''}>${d}</option>`).join('')}
      </select>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid" id="dash-kpi-grid"></div>

    <!-- Charts Row 1: Trend -->
    <div class="charts-grid mb-0" style="margin-bottom:20px; grid-template-columns: 1fr;">
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">📈 Tendencia de Gastos Mensuales (Mantenimiento)</div><div class="chart-subtitle">Últimos 12 meses</div></div>
        </div>
        <div class="chart-canvas-wrapper tall"><canvas id="chart-monthly"></canvas></div>
      </div>
    </div>

    <!-- Charts Row 2 -->
    <div class="charts-grid mb-0" style="margin-bottom:20px; grid-template-columns: 1fr 1fr;">
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">⚠️ Fallas por Categoría</div></div>
        </div>
        <div class="chart-canvas-wrapper"><canvas id="chart-failures"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">⚡ Prev. vs Correctivo</div></div>
        </div>
        <div class="chart-canvas-wrapper"><canvas id="chart-prevvscorr"></canvas></div>
      </div>
    </div>

    <!-- Bottom Row: Top Costly + Availability -->
    <div class="grid-2" style="gap:20px">
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">🏆 Top 10 Equipos más Costosos</div></div>
        </div>
        <div id="dash-ranking"></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">📊 Disponibilidad por Equipo</div></div>
        </div>
        <div class="avail-list" id="dash-availability"></div>
      </div>
    </div>`;
  },

  init() {
    this.destroyCharts();
    const kpis = DB.calcKPIs(this.filter);
    this.renderKPIs(kpis);
    this.renderAlertRow(kpis);
    this.renderCharts(kpis);
    this.renderRanking(kpis);
    this.renderAvailability(kpis);
    document.getElementById('dash-updated').textContent = `Actualizado: ${new Date().toLocaleTimeString('es')}`;
  },

  setFilter(key, val) {
    this.filter[key] = val;
    this.init();
  },

  destroyCharts() {
    Object.values(this.charts).forEach(c => { try { c.destroy(); } catch{} });
    this.charts = {};
  },

  refresh() {
    this.destroyCharts();
    this.init();
    showToast('Dashboard actualizado','success');
  },

  renderAlertRow(kpis) {
    const alerts = AlertEngine.generate();
    const activas = alerts.filter(a => a.severity !== 'completed');
    const proximas = activas.filter(a => a.remainingKm >= 0 && a.remainingKm < 500);
    const vencidas = activas.filter(a => a.remainingKm < 0);
    const completadas = alerts.filter(a => a.severity === 'completed');
    const el = document.getElementById('dash-alert-row');
    if (!el) return;
    el.innerHTML = `
    <div class="alert-summary-card asc-danger"  onclick="App.navigate('alerts')">
      <div class="asc-icon">🚨</div>
      <div class="asc-info-text"><div class="asc-num">${vencidas.length}</div><div class="asc-label">Alertas Vencidas</div></div>
    </div>
    <div class="alert-summary-card asc-warning" onclick="App.navigate('alerts')">
      <div class="asc-icon">⚠️</div>
      <div class="asc-info-text"><div class="asc-num">${proximas.length}</div><div class="asc-label">Próximas (&lt;500 km)</div></div>
    </div>
    <div class="alert-summary-card asc-info"    onclick="App.navigate('alerts')">
      <div class="asc-icon">📌</div>
      <div class="asc-info-text"><div class="asc-num">${activas.length}</div><div class="asc-label">Alertas Activas</div></div>
    </div>
    <div class="alert-summary-card asc-success" onclick="App.navigate('alerts')">
      <div class="asc-icon">✅</div>
      <div class="asc-info-text"><div class="asc-num">${completadas.length}</div><div class="asc-label">Completadas</div></div>
    </div>`;
  },

  renderKPIs(kpis) {
    const cur = DB.getSettings().currency || 'Q';
    const el = document.getElementById('dash-kpi-grid');
    if (!el) return;
    const cards = [
      { icon:'🏭', color:'green',  val:`${kpis.disponibilidad}%`,   label:'Disponibilidad Operacional',    sub:`${kpis.operativeAssets}/${kpis.totalAssets} equipos` },
      { icon:'⏱️', color:'blue',   val:`${fmtNumber(kpis.mtbf,0)} hrs`, label:'MTBF — Entre Fallas',      sub:'Tiempo medio entre fallas' },
      { icon:'🔧', color:'yellow', val:`${fmtHours(kpis.mttr)}`,    label:'MTTR — Reparación',             sub:'Tiempo medio de reparación' },
      { icon:'💰', color:'purple', val:`${cur} ${fmtNumber(kpis.monthCost,0)}`, label:'Gasto Mensual',   sub:'Este mes' },
      { icon:'📅', color:'blue',   val:`${cur} ${fmtNumber(kpis.yearCost,0)}`,  label:'Gasto Anual',    sub:new Date().getFullYear() },
      { icon:'⚡', color:'green',  val:`${kpis.preventPct}%`,       label:'Preventivo vs Total',           sub:`${kpis.correctivePct}% correctivo` },
      { icon:'🚨', color:'red',    val:kpis.overdue,                 label:'Mantenimientos Vencidos',       sub:'Requieren atención inmediata' },
      { icon:'⏰', color:'yellow', val:kpis.upcomingSoon,            label:'Próximos a Vencer',             sub:'En los próximos 7 días' },
      { icon:'💵', color:'cyan',   val:`${cur}${parseFloat(kpis.costPerHr).toFixed(0)}/hr`, label:'Costo por Hora', sub:'Promedio flota' },
      { icon:'🛣️', color:'cyan',  val:`${cur}${parseFloat(kpis.costPerKm).toFixed(2)}/km`, label:'Costo por Km', sub:'Promedio flota' },
      { icon:'🔴', color:'red',    val:kpis.failedAssets,            label:'Fuera de Servicio',             sub:'Equipos no disponibles' },
      { icon:'📊', color:'purple', val:kpis.totalCorrectiveThisYear, label:'Fallas Este Año',               sub:`${new Date().getFullYear()}` },
    ];
    el.innerHTML = cards.map(c=>`
    <div class="kpi-card kpi-${c.color}">
      <div class="kpi-header">
        <div class="kpi-icon kpi-icon-${c.color}">${c.icon}</div>
        <span class="semaphore ${c.color==='green'?'sem-green':c.color==='red'?'sem-red':c.color==='yellow'?'sem-yellow':''}"></span>
      </div>
      <div class="kpi-value">${c.val}</div>
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-sub">${c.sub}</div>
    </div>`).join('');
  },

  renderCharts(kpis) {
    const CHART_DEFAULTS = {
      plugins: { legend: { labels: { color:'#94a3b8', font:{size:11} } } },
      scales: { x: { ticks:{color:'#64748b'}, grid:{color:'rgba(255,255,255,0.04)'} }, y: { ticks:{color:'#64748b'}, grid:{color:'rgba(255,255,255,0.04)'} } },
    };

    /* Monthly trend */
    const cur  = DB.getSettings().currency || 'Q';
    const mc = kpis.monthlyCosts;
    const ctx1 = document.getElementById('chart-monthly');
    if (ctx1) this.charts.monthly = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: mc.map(m=>m.label),
        datasets: [
          { label:'Total', data: mc.map(m=>m.total), backgroundColor:'rgba(59,130,246,0.6)', borderColor:'#3b82f6', borderWidth:1, borderRadius:4 },
        ],
      },
      options: { ...CHART_DEFAULTS, responsive:true, maintainAspectRatio:false, plugins:{ ...CHART_DEFAULTS.plugins, tooltip:{ callbacks:{ label: ctx=>`${cur} ${ctx.parsed.y?.toLocaleString('es')}` } } } },
    });

    /* Failures by category */
    const catColors = ['#3b82f6','#f59e0b','#10b981','#ef4444','#a855f7','#06b6d4','#84cc16','#f97316','#ec4899','#14b8a6'];
    const corr = kpis.corrective || DB.getCorrective();
    const failByCat = {};
    corr.forEach(c=>{ failByCat[c.failureCategory||c.failureType||'Otro']=(failByCat[c.failureCategory||c.failureType||'Otro']||0)+1; });
    const ctx3 = document.getElementById('chart-failures');
    if (ctx3) this.charts.fails = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: Object.keys(failByCat),
        datasets: [{ label:'Fallas', data: Object.values(failByCat), backgroundColor: catColors, borderRadius:4 }],
      },
      options: { ...CHART_DEFAULTS, responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{...CHART_DEFAULTS.plugins, legend:{display:false}} },
    });

    /* Preventive vs Corrective pie */
    const ctx4 = document.getElementById('chart-prevvscorr');
    if (ctx4) this.charts.pvc = new Chart(ctx4, {
      type: 'pie',
      data: {
        labels: ['Preventivo','Correctivo'],
        datasets: [{ data:[kpis.preventPct,kpis.correctivePct], backgroundColor:['#10b981','#ef4444'], borderWidth:2, borderColor:'#131929' }],
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:11} } }, tooltip:{ callbacks:{ label: ctx=>`${ctx.label}: ${ctx.parsed}%` } } } },
    });
  },

  renderRanking(kpis) {
    const el = document.getElementById('dash-ranking');
    if (!el) return;
    if (!kpis.topEquip.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>Sin datos</h3></div>`; return; }
    el.innerHTML = kpis.topEquip.slice(0,10).map((item,i)=>`
    <div class="ranking-item">
      <div class="rank-num ${i<3?'top3':''}">${i+1}</div>
      <div class="rank-info">
        <div class="rank-name">${item.asset.brand} ${item.asset.model}</div>
        <div class="rank-code">${item.asset.code} · ${item.asset.location||'—'}</div>
      </div>
      <div class="rank-cost">${fmtCurrency(item.cost)}</div>
    </div>`).join('');
  },

  renderAvailability(kpis) {
    const el = document.getElementById('dash-availability');
    if (!el) return;
    const assets = (kpis.assets || DB.getAssets()).slice(0,8);
    const corr   = kpis.corrective || DB.getCorrective();

    const downByAsset = {};
    corr.forEach(c=>{ downByAsset[c.assetId] = (downByAsset[c.assetId]||0)+(parseFloat(c.downtimeHours)||0); });

    el.innerHTML = assets.map(a=>{
      const downHrs = downByAsset[a.id] || 0;
      const avail = Math.max(0, Math.min(100, ((8760-downHrs)/8760)*100));
      const color = avail>=95?'pb-green':avail>=80?'pb-yellow':'pb-red';
      const semC  = avail>=95?'sem-green':avail>=80?'sem-yellow':'sem-red';
      return `
      <div class="avail-item">
        <div class="avail-name"><span class="semaphore ${semC}" style="margin-right:6px"></span>${a.code}</div>
        <div class="avail-bar">
          <div class="progress-bar-wrap"><div class="progress-bar-fill ${color}" style="width:${avail}%"></div></div>
        </div>
        <div class="avail-pct ${avail>=95?'text-success':avail>=80?'text-warning':'text-danger'}">${avail.toFixed(0)}%</div>
      </div>`;
    }).join('');
  },
};
