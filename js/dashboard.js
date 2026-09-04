﻿/* ====================================================
   DASHBOARD MODULE — KPIs + Charts
   ==================================================== */

const DashboardModule = {
  charts: {},
  filter: { area:'', localidad:'', departamento:'' },

_escapeHtml(text) {
    if (!text) return '';

    const entities = {
      '&': '\u0026amp;',
      '<': '\u0026lt;',
      '>': '\u0026gt;',
      '"': '\u0026quot;',
      "'": '\u0026#039;'
    };

    return String(text).replace(/[&<>"']/g, char => entities[char]);
  },

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
    <div class="filter-bar">
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
    <div class="charts-grid mb-0" style="margin-bottom:20px;">
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">📈 Tendencia de Gastos Mensuales (Mantenimiento)</div><div class="chart-subtitle">Últimos 12 meses</div></div>
        </div>
        <div class="chart-canvas-wrapper tall"><canvas id="chart-monthly"></canvas></div>
      </div>
    </div>

    <!-- Charts Row 2: Failures + Distribution -->
    <div class="charts-grid mb-0" style="margin-bottom:20px;">
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">⚠️ Fallas por Categoría</div></div>
        </div>
        <div class="chart-canvas-wrapper"><canvas id="chart-failures"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">🍩 Distribución del Costo de Mantenimiento</div></div>
        </div>
        <div class="chart-canvas-wrapper"><canvas id="chart-prevvscorr"></canvas></div>
      </div>
    </div>

    <!-- Financial Coverage Notice -->
    <div id="dash-coverage-notice" style="margin-bottom:16px;"></div>

    <!-- Bottom Row: Financial Ranking + Average Cost -->
    <div class="grid-2 financial-ranking-grid">
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">🏆 Activos con Mayor Costo Anual de Mantenimiento</div><div class="chart-subtitle">Año actual</div></div>
        </div>
        <div id="dash-ranking"></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">📈 Costo Promedio de Mantenimientos con Costo Positivo</div></div>
        </div>
        <div id="dash-avg-cost"></div>
      </div>
    </div>

    <!-- Availability Row -->
    <div class="grid-2" style="gap:20px; margin-top:16px;">
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
    this.renderAvgCost(kpis);
    this.renderCoverageNotice(kpis);
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
      <div class="asc-info-text"><div class="asc-num">${proximas.length}</div><div class="asc-label">Próximas (<500 km)</div></div>
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
    const el = document.getElementById('dash-kpi-grid');
    if (!el) return;
    const cards = [
      { icon:'📅', color:'purple', val: DB.fmtCurrency(kpis.monthCost), label:'Costo de Mantenimiento Mensual', sub:'Mes actual' },
      { icon:'📊', color:'blue',   val: DB.fmtCurrency(kpis.yearCost), label:'Costo de Mantenimiento Anual', sub:'Año actual' },
      { icon:'🛡️', color:'green',  val: DB.fmtCurrency(kpis.monthlyPreventiveCost), label:'Costo Preventivo del Mes', sub:'Preventivos ejecutados en el mes' },
      { icon:'🔧', color:'red',    val: DB.fmtCurrency(kpis.monthlyCorrectiveCost), label:'Costo Correctivo del Mes', sub:'Correctivos reparados en el mes' },
    ];
    el.innerHTML = cards.map(c=>`
    <div class="kpi-card kpi-${c.color}">
      <div class="kpi-header">
        <div class="kpi-icon kpi-icon-${c.color}">${c.icon}</div>
        <span class="semaphore ${c.color==='green'?'sem-green':c.color==='red'?'sem-red':c.color==='blue'?'sem-blue':c.color==='purple'?'sem-purple':''}"></span>
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

    /* Monthly trend (legacy) */
    const cur = DB.getCurrencySymbol(DB.getSettings().currency);
    const mc = kpis.monthlyCosts || [];
    const ctx1 = document.getElementById('chart-monthly');
    if (ctx1) this.charts.monthly = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: mc.map(m => m.label),
        datasets: [
          { label: 'Total', data: mc.map(m => m.total || 0), backgroundColor: 'rgba(59,130,246,0.6)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 },
        ],
      },
      options: { ...CHART_DEFAULTS, responsive: true, maintainAspectRatio: false, plugins: { ...CHART_DEFAULTS.plugins, tooltip: { callbacks: { label: ctx => `${cur} ${ctx.parsed.y?.toLocaleString('es')}` } } } },
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

    /* Distribution donut - using preventiveCostPct / correctiveCostPct */
    const ctx4 = document.getElementById('chart-prevvscorr');
    const hasDist = kpis.hasCostDistribution === true;
    const prevPct = kpis.preventiveCostPct || 0;
    const corrPct = kpis.correctiveCostPct || 0;
    const prevAmount = kpis.monthlyPreventiveCost || 0;
    const corrAmount = kpis.monthlyCorrectiveCost || 0;

    if (ctx4) {
      if (hasDist) {
        this.charts.pvc = new Chart(ctx4, {
          type: 'doughnut',
          data: {
            labels: ['Preventivo', 'Correctivo'],
            datasets: [{
              data: [prevPct, corrPct],
              backgroundColor: ['#10b981', '#ef4444'],
              borderWidth: 2,
              borderColor: '#131929',
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
              legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const pct = ctx.parsed.toFixed(1);
                    const amount = ctx.dataIndex === 0 ? prevAmount : corrAmount;
                    return `${ctx.label}: ${pct}% (${DB.fmtCurrency(amount)})`;
                  }
                }
              }
            }
          },
        });
      } else {
        // Empty state for distribution
        this.charts.pvc = new Chart(ctx4, {
          type: 'doughnut',
          data: { labels: [], datasets: [] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              ...CHART_DEFAULTS.plugins,
              title: {
                display: true,
                text: 'Sin datos de costos en el período actual',
                color: '#94a3b8',
                font: { size: 13 }
              }
            }
          }
        });
      }
    }
  },

  renderRanking(kpis) {
    const el = document.getElementById('dash-ranking');
    if (!el) return;
    const ranking = kpis.topAssetsByAnnualMaintenanceCost || [];
    if (!ranking.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>Sin activos con costo de mantenimiento este año</h3></div>`; return; }
    el.innerHTML = ranking.map((item,i)=>`
    <div class="ranking-item financial annual">
      <div class="rank-num ${i<3?'top3':''}">${i+1}</div>
      <div class="rank-asset">
        <div class="rank-name">${this._escapeHtml(item.code || 'Activo sin código')}</div>
        <div class="rank-period-label">Costo anual</div>
      </div>
      <div class="rank-breakdown">
        <span class="rank-component rank-preventive">
          <span class="rank-component-label">Preventivo</span>
          <span class="rank-component-value">${DB.fmtCurrency(item.preventiveCost)}</span>
        </span>
        <span class="rank-component rank-corrective">
          <span class="rank-component-label">Correctivo</span>
          <span class="rank-component-value">${DB.fmtCurrency(item.correctiveCost)}</span>
        </span>
      </div>
      <div class="rank-total">
        <span class="rank-total-label">Total anual</span>
        <span class="rank-cost">${DB.fmtCurrency(item.totalCost)}</span>
      </div>
    </div>`).join('');
  },

  renderAvgCost(kpis) {
    const el = document.getElementById('dash-avg-cost');
    if (!el) return;
    const avg = kpis.avgPositiveMaintenanceCost;
    if (avg === null || avg === undefined) {
      el.innerHTML = `
      <div class="avg-cost-card">
        <div class="avg-cost-value">—</div>
        <div class="avg-cost-sub">Ningún mantenimiento con costo positivo este mes</div>
      </div>`;
      return;
    }
    el.innerHTML = `
    <div class="avg-cost-card">
      <div class="avg-cost-value">${DB.fmtCurrency(avg)}</div>
      <div class="avg-cost-sub">Promedio mensual de costos válidos mayores que cero</div>
    </div>`;
  },

  renderCoverageNotice(kpis) {
    const el = document.getElementById('dash-coverage-notice');
    if (!el) return;
    const fc = kpis.financialCoverage;
    if (!fc) { el.innerHTML = ''; return; }
    const anomalies = [];
    if (fc.partialMissingCosts > 0) anomalies.push(`${fc.partialMissingCosts} coberturas parciales`);
    if (fc.missingCosts > 0) anomalies.push(`${fc.missingCosts} costos faltantes`);
    if (fc.invalidCosts > 0) anomalies.push(`${fc.invalidCosts} costos inválidos`);
    if (fc.negativeCosts > 0) anomalies.push(`${fc.negativeCosts} costos negativos`);
    if (fc.invalidTypes > 0) anomalies.push(`${fc.invalidTypes} tipos inválidos`);
    if (fc.missingFinancialDates > 0) anomalies.push(`${fc.missingFinancialDates} fechas financieras ausentes`);
    if (fc.missingAssetIdForRanking > 0) anomalies.push(`${fc.missingAssetIdForRanking} sin activo para ranking`);
    if (anomalies.length === 0) { el.innerHTML = ''; return; }
    const show = anomalies.slice(0, 3);
    const extra = anomalies.length > 3 ? ` y ${anomalies.length - 3} observaciones adicionales` : '';
    el.innerHTML = `
    <div class="coverage-notice">
      <span class="coverage-icon">⚠️</span>
      <span class="coverage-label">Calidad de datos: </span>
      <span class="coverage-details">${show.join(' · ')}${extra}</span>
    </div>`;
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