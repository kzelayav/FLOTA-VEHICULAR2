/* ====================================================
   DASHBOARD MODULE — KPIs + Charts
   ==================================================== */

const DashboardModule = {
  charts: {},
  filter: { area:'', localidad:'', departamento:'', periodMonth: (new Date()).getMonth() + 1, periodYear: (new Date()).getFullYear() },

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

  // Obtiene el contrato financiero del período seleccionado con fallback defensivo
  _getSelectedFinancials(kpis) {
    if (!kpis || !kpis.selectedPeriodFinancials || typeof kpis.selectedPeriodFinancials !== 'object') {
      return null;
    }
    return kpis.selectedPeriodFinancials;
  },

  // Obtiene etiqueta y modo del período para textos dinámicos
  _getPeriodInfo(selectedFinancials) {
    if (!selectedFinancials || !selectedFinancials.period) {
      return { mode: 'month', label: 'Período seleccionado', shortLabel: 'Período' };
    }
    return {
      mode: selectedFinancials.period.mode || 'month',
      label: selectedFinancials.period.label || 'Período seleccionado',
      shortLabel: selectedFinancials.period.shortLabel || 'Período',
      isFuture: selectedFinancials.period.isFuture || false
    };
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
      <select class="form-control" onchange="DashboardModule.setFilter('periodMonth',this.value)" aria-label="Filtrar por mes">
        <option value="all" ${this.filter.periodMonth==='all'?'selected':''}>Todos los meses</option>
        ${[{n:1,v:'Enero'},{n:2,v:'Febrero'},{n:3,v:'Marzo'},{n:4,v:'Abril'},{n:5,v:'Mayo'},{n:6,v:'Junio'},{n:7,v:'Julio'},{n:8,v:'Agosto'},{n:9,v:'Septiembre'},{n:10,v:'Octubre'},{n:11,v:'Noviembre'},{n:12,v:'Diciembre'}].map(m=>`<option value="${m.n}" ${this.filter.periodMonth===m.n?'selected':''}>${m.v}</option>`).join('')}
      </select>
      <select class="form-control" id="dash-filter-year" onchange="DashboardModule.setFilter('periodYear',this.value)" aria-label="Filtrar por año">
        <option value="">Año</option>
      </select>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid" id="dash-kpi-grid"></div>

    <!-- Charts Row 1: Trend -->
    <div class="charts-grid mb-0" style="margin-bottom:20px;">
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">📈 Tendencia Financiera de Mantenimiento</div><div class="chart-subtitle" id="dash-trend-subtitle">Últimos 12 meses</div></div>
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
          <div><div class="chart-title">🍩 Distribución de Costos de Mantenimiento</div><div class="chart-subtitle" id="dash-dist-subtitle">Período seleccionado</div></div>
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
          <div><div class="chart-title">🏆 Activos con Mayor Costo de Mantenimiento</div><div class="chart-subtitle" id="dash-ranking-subtitle">Período seleccionado</div></div>
        </div>
        <div id="dash-ranking"></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div><div class="chart-title">📈 Costo Promedio de Mantenimientos con Costo Positivo</div><div class="chart-subtitle" id="dash-avg-subtitle">Período seleccionado</div></div>
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
    this.updateFilters(kpis);
    document.getElementById('dash-updated').textContent = `Actualizado: ${new Date().toLocaleTimeString('es')}`;
  },

  // Actualiza los selectores de mes y año con los datos del motor
  updateFilters(kpis) {
    // Actualizar selector de año
    const yearSelect = document.getElementById('dash-filter-year');
    if (yearSelect) {
      const currentYear = (new Date()).getFullYear();
      const years = Array.isArray(kpis.availableFinancialYears)
        ? kpis.availableFinancialYears.filter(y => Number.isInteger(y) && y <= currentYear)
        : [];
      // Asegurar que el año actual esté presente
      if (!years.includes(currentYear)) years.push(currentYear);
      // Orden descendente, únicos
      const uniqueYears = [...new Set(years)].sort((a, b) => b - a);

      const currentValue = yearSelect.value;
      yearSelect.innerHTML = '<option value="">Año</option>' + uniqueYears.map(y =>
        `<option value="${y}" ${this.filter.periodYear===y?'selected':''}>${y}</option>`
      ).join('');
      // Restaurar valor si sigue válido, si no, usar año actual
      if (uniqueYears.includes(parseInt(currentValue, 10))) {
        yearSelect.value = currentValue;
      } else {
        yearSelect.value = String(this.filter.periodYear);
      }
    }

    // Actualizar estado disabled de meses futuros
    const monthSelect = document.querySelector("select[onchange*='periodMonth']");
    if (monthSelect) {
      const currentYear = (new Date()).getFullYear();
      const currentMonth = (new Date()).getMonth() + 1;
      const selectedYear = parseInt(this.filter.periodYear, 10) || currentYear;
      const isCurrentYear = selectedYear === currentYear;
      const maxMonth = isCurrentYear ? currentMonth : 12;

      Array.from(monthSelect.options).forEach(opt => {
        if (opt.value === 'all') return;
        const monthNum = parseInt(opt.value, 10);
        if (Number.isInteger(monthNum)) {
          opt.disabled = isCurrentYear && monthNum > maxMonth;
        }
      });
      // Si el mes seleccionado ahora está disabled, ajustar
      const selectedMonth = monthSelect.value;
      if (selectedMonth !== 'all' && monthSelect.querySelector(`option[value="${selectedMonth}"]`)?.disabled) {
        monthSelect.value = String(currentMonth);
        this.filter.periodMonth = currentMonth;
      }
    }
  },

  setFilter(key, val) {
    if (key === 'periodMonth') {
      // Normalizar periodMonth: all, 1-12, o mes actual
      if (val === 'all' || val === 'ALL' || val === 'All') {
        this.filter.periodMonth = 'all';
      } else {
        const parsed = parseInt(val, 10);
        const currentMonth = (new Date()).getMonth() + 1;
        const currentYear = (new Date()).getFullYear();
        this.filter.periodMonth = (Number.isInteger(parsed) && parsed >= 1 && parsed <= 12) ? parsed : currentMonth;
        // Si es mes futuro del año actual, ajustar al mes actual
        if (this.filter.periodYear === currentYear && this.filter.periodMonth > currentMonth) {
          this.filter.periodMonth = currentMonth;
        }
      }
    } else if (key === 'periodYear') {
      // Normalizar periodYear: número válido, o año actual
      const parsed = parseInt(val, 10);
      const currentYear = (new Date()).getFullYear();
      this.filter.periodYear = (Number.isInteger(parsed) && parsed >= 1000 && parsed <= currentYear) ? parsed : currentYear;
      // Al cambiar año, si el mes seleccionado es futuro para el nuevo año, ajustar
      if (this.filter.periodYear === currentYear && typeof this.filter.periodMonth === 'number' && this.filter.periodMonth > (new Date()).getMonth() + 1) {
        this.filter.periodMonth = (new Date()).getMonth() + 1;
      }
    } else {
      // Filtros organizacionales
      this.filter[key] = val;
    }
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

    const selectedFinancials = this._getSelectedFinancials(kpis);
    const periodInfo = this._getPeriodInfo(selectedFinancials);
    const hasSelectedFinancials = selectedFinancials !== null;

    // Valores del período seleccionado (sin fallback legacy)
    const totalCost = hasSelectedFinancials && Number.isFinite(selectedFinancials.totalCost)
      ? selectedFinancials.totalCost : 0;
    const preventiveCost = hasSelectedFinancials && Number.isFinite(selectedFinancials.preventiveCost)
      ? selectedFinancials.preventiveCost : 0;
    const correctiveCost = hasSelectedFinancials && Number.isFinite(selectedFinancials.correctiveCost)
      ? selectedFinancials.correctiveCost : 0;

    // KPI Anual: usar yearFinancials del período seleccionado
    const selectedYearFinancials = selectedFinancials && selectedFinancials.yearFinancials
      && typeof selectedFinancials.yearFinancials === 'object'
        ? selectedFinancials.yearFinancials
        : null;
    const selectedYearTotal = selectedYearFinancials && Number.isFinite(selectedYearFinancials.totalCost)
      ? selectedYearFinancials.totalCost
      : 0;
    const selectedYearLabel = (selectedYearFinancials && Number.isInteger(selectedYearFinancials.year))
      ? 'Año ' + selectedYearFinancials.year
      : (selectedFinancials?.period?.year ? 'Año ' + selectedFinancials.period.year : 'Período seleccionado');

    const totalLabel = 'Costo del Período';
    const totalSub = periodInfo.label;
    const prevLabel = 'Mantenimiento Preventivo';
    const prevSub = periodInfo.label;
    const corrLabel = 'Mantenimiento Correctivo';
    const corrSub = periodInfo.label;

    const cards = [
      { icon:'📅', color:'purple', val: DB.fmtCurrency(hasSelectedFinancials ? selectedFinancials.totalCost : 0), label: 'Costo del Período', sub: periodInfo.label },
      { icon:'📊', color:'blue',   val: DB.fmtCurrency(selectedYearTotal), label: 'Costo Anual', sub: selectedYearLabel },
      { icon:'🛡️', color:'green',  val: DB.fmtCurrency(hasSelectedFinancials ? selectedFinancials.preventiveCost : 0), label: 'Mantenimiento Preventivo', sub: periodInfo.label },
      { icon:'🔧', color:'red',    val: DB.fmtCurrency(hasSelectedFinancials ? selectedFinancials.correctiveCost : 0), label: 'Mantenimiento Correctivo', sub: periodInfo.label },
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

    const selectedFinancials = this._getSelectedFinancials(kpis);
    const periodInfo = this._getPeriodInfo(selectedFinancials);
    const hasSelectedFinancials = selectedFinancials !== null;

    // Usar tendencia del período seleccionado si está disponible, sino legacy
    const trend = hasSelectedFinancials && Array.isArray(selectedFinancials.financialTrend)
      ? selectedFinancials.financialTrend
      : [];
    const hasFinancialTrendData = trend.some(item => Number(item.totalCost) > 0);
    const ctx1 = document.getElementById('chart-monthly');

    // Actualizar subtítulo de la tendencia dinámicamente
    const trendSubtitleEl = document.getElementById('dash-trend-subtitle');
    if (trendSubtitleEl) {
      const periodInfo = this._getPeriodInfo(selectedFinancials);
      if (periodInfo.mode === 'month') {
        trendSubtitleEl.textContent = `12 meses hasta ${periodInfo.label}`;
      } else if (periodInfo.mode === 'year') {
        const trendEndYear = selectedFinancials?.period?.trendEndYear;
        const trendEndMonth = selectedFinancials?.period?.trendEndMonth;
        if (selectedFinancials?.period?.mode === 'year' && trendEndYear !== (new Date()).getFullYear()) {
          trendSubtitleEl.textContent = `Enero a diciembre de ${trendEndYear}`;
        } else {
          trendSubtitleEl.textContent = `12 meses hasta el mes actual`;
        }
      }
    }



// Monthly financial trend chart
    if (ctx1) {
      if (!hasFinancialTrendData) {
        // Empty state: show message instead of chart
        ctx1.style.display = 'none';
        const container = ctx1.parentElement;
        if (container && !container.querySelector('.empty-trend-state')) {
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'empty-trend-state';
          emptyDiv.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:220px;color:#64748b;text-align:center;padding:20px;';
          emptyDiv.innerHTML = '<div class="empty-icon" style="font-size:48px;margin-bottom:12px;">📊</div><h3 style="margin:0;font-size:14px;color:#94a3b8;">Sin costos de mantenimiento en la tendencia del período seleccionado</h3>';
          container.appendChild(emptyDiv);
        }
      } else {
        // Show canvas and create stacked bar chart
        ctx1.style.display = 'block';
        const existingEmpty = ctx1.parentElement?.querySelector('.empty-trend-state');
        if (existingEmpty) existingEmpty.remove();

        this.charts.monthly = new Chart(ctx1, {
          type: 'bar',
          data: {
            labels: trend.map(item => item.label || ''),
            datasets: [
              {
                label: 'Preventivo',
                data: trend.map(item => Number(item.preventiveCost) || 0),
                backgroundColor: 'rgba(16,185,129,0.7)',
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 4,
              },
              {
                label: 'Correctivo',
                data: trend.map(item => Number(item.correctiveCost) || 0),
                backgroundColor: 'rgba(239,68,68,0.7)',
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 4,
              },
            ],
          },
          options: {
            ...CHART_DEFAULTS,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              ...CHART_DEFAULTS.plugins,
              tooltip: {
                callbacks: {
                  title: ctx => ctx[0]?.label || '',
                  label: ctx => {
                    const item = trend[ctx.dataIndex];
                    if (!item) return '';
                    const label = ctx.dataset.label;
                    const value = label === 'Preventivo'
                      ? Number(item.preventiveCost) || 0
                      : Number(item.correctiveCost) || 0;
                    return label + ': ' + DB.fmtCurrency(value);
                  },
                  footer: ctx => {
                    const item = trend[ctx[0].dataIndex];
                    if (!item) return '';
                    return 'Total: ' + DB.fmtCurrency(Number(item.totalCost) || 0);
                  },
                },
              },
            },
            scales: {
              x: {
                stacked: true,
                ticks: { color: '#64748b' },
                grid: { color: 'rgba(255,255,255,0.04)' },
              },
              y: {
                stacked: true,
                beginAtZero: true,
                ticks: {
                  color: '#64748b',
                  callback: value => {
                    const abs = Math.abs(value);
                    if (abs >= 1000000) return (value/1000000).toFixed(1) + 'M';
                    if (abs >= 1000) return (value/1000).toFixed(1) + 'K';
                    return value.toLocaleString('es-NI');
                  },
                },
                grid: { color: 'rgba(255,255,255,0.04)' },
              },
            },
          },
          });
      }
    }

    /* Failures by category - mantener intacto */
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

    /* Distribution donut - usando selectedFinancials.costDistribution */
    const ctx4 = document.getElementById('chart-prevvscorr');
    const dist = hasSelectedFinancials ? selectedFinancials.costDistribution : { hasData: false, preventiveCost: 0, correctiveCost: 0, preventivePct: 0, correctivePct: 0, hasData: false };
    const hasDist = dist.hasData === true;
        this.charts.pvc = new Chart(ctx4, {
          type: 'doughnut',
          data: {
            labels: ['Preventivo', 'Correctivo'],
            datasets: [{
              data: [dist.preventiveCost || 0, dist.correctiveCost || 0],
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
                    const pct = ctx.dataIndex === 0 ? (dist.preventivePct || 0) : (dist.correctivePct || 0);
                    const amount = ctx.dataIndex === 0 ? (dist.preventiveCost || 0) : (dist.correctiveCost || 0);
                    return `${ctx.label}: ${pct.toFixed(1)}% (${DB.fmtCurrency(amount)})`;
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
                text: 'Sin datos de costos en el período seleccionado',
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

    const selectedFinancials = this._getSelectedFinancials(kpis);
    const periodInfo = this._getPeriodInfo(selectedFinancials);
    const hasSelectedFinancials = selectedFinancials !== null;
    const ranking = hasSelectedFinancials ? (selectedFinancials.topAssets || []) : [];

    // Actualizar subtítulo del ranking dinámicamente
    const rankingSubtitleEl = document.getElementById('dash-ranking-subtitle');
    if (rankingSubtitleEl) {
      const periodInfo = this._getPeriodInfo(selectedFinancials);
      rankingSubtitleEl.textContent = periodInfo.label;
    }

    if (!ranking.length) {
      const periodInfo = this._getPeriodInfo(selectedFinancials);
      const emptyMsg = periodInfo.mode === 'year'
        ? `Sin activos con costos de mantenimiento durante ${periodInfo.label.replace('Año ', '')}`
        : `Sin activos con costos de mantenimiento en ${periodInfo.label}`;
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>${emptyMsg}</h3></div>`;
      return;
    }

    el.innerHTML = ranking.map((item,i)=>`
    <div class="ranking-item financial annual">
      <div class="rank-num ${i<3?'top3':''}">${i+1}</div>
      <div class="rank-asset">
        <div class="rank-name">${this._escapeHtml(item.code || 'Activo sin código')}</div>
      </div>
      <div class="rank-breakdown">
        <span class="rank-component rank-preventive">
          <span class="rank-component-label">Preventivo</span>
          <span class="rank-component-value">${DB.fmtCurrency(item.preventiveCost || 0)}</span>
        </span>
        <span class="rank-component rank-corrective">
          <span class="rank-component-label">Correctivo</span>
          <span class="rank-component-value">${DB.fmtCurrency(item.correctiveCost || 0)}</span>
        </span>
      </div>
      <div class="rank-total">
        <span class="rank-total-label">Total</span>
        <span class="rank-cost">${DB.fmtCurrency(item.totalCost || 0)}</span>
      </div>
    </div>`).join('');
  },

  renderAvgCost(kpis) {
    const el = document.getElementById('dash-avg-cost');
    if (!el) return;

    const selectedFinancials = this._getSelectedFinancials(kpis);
    const periodInfo = this._getPeriodInfo(selectedFinancials);
    const hasSelectedFinancials = selectedFinancials !== null;

    // Actualizar subtítulo del promedio dinámicamente
    const avgSubtitleEl = document.getElementById('dash-avg-subtitle');
    if (avgSubtitleEl) {
      avgSubtitleEl.textContent = periodInfo.label;
    }

    const avg = hasSelectedFinancials && Number.isFinite(selectedFinancials.positiveCostAverage)
      ? selectedFinancials.positiveCostAverage
      : 0;

    if (avg === 0) {
      el.innerHTML = `
      <div class="avg-cost-card">
        <div class="avg-cost-value">—</div>
        <div class="avg-cost-sub">Ningún mantenimiento con costo positivo en ${periodInfo.label}</div>
      </div>`;
      return;
    }
    el.innerHTML = `
    <div class="avg-cost-card">
      <div class="avg-cost-value">${DB.fmtCurrency(selectedFinancials.positiveCostAverage)}</div>
      <div class="avg-cost-sub">Promedio de costos válidos mayores que cero en ${periodInfo.label}</div>
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
