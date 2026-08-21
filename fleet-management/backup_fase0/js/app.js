/* ====================================================
   APP ROUTER & NAVIGATION
   ==================================================== */

const App = {
  currentModule: 'dashboard',

  /* ── Module Registry ── */
  MODULES: {
    dashboard:  { render: () => DashboardModule.render(),  init: () => DashboardModule.init() },
    assets:     { render: () => AssetsModule.render() },
    preventive: { render: () => PreventiveModule.render() },
    corrective: { render: () => CorrectiveModule.render() },
    alerts:     { render: () => AlertsModule.render() },
    reports:    { render: () => ReportsModule.render(),    init: () => ReportsModule.init() },
    users:      { render: () => UsersModule.render() },
    audit:      { render: () => AuditModule.render() },
    settings:   { render: () => SettingsModule.render() },
  },

  /* ── Navigate ── */
  navigate(moduleId) {
    if (!Auth.getSession()) { this.renderLogin(); return; }
    const session = Auth.getSession();
    const isAdmin = session?.role === 'admin';
    const adminOnly = ['users','audit','settings'];

    // Admin-only modules
    if (adminOnly.includes(moduleId) && !isAdmin) {
      showToast('Solo los administradores pueden acceder a este módulo','error');
      return;
    }
    // General permission check
    if (!Auth.can(moduleId) && !adminOnly.includes(moduleId)) {
      showToast('No tienes permiso para acceder a este módulo','error');
      return;
    }

    this.currentModule = moduleId;
    const mod = this.MODULES[moduleId];
    if (!mod) return;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.module === moduleId);
    });

    // Update header title
    const navItem = NAV_ITEMS.find(n=>n.id===moduleId);
    document.getElementById('header-title').textContent  = navItem?.label || 'Fleet Manager';
    document.getElementById('header-sub').textContent    = this.getModuleSub(moduleId);

    // Render page
    const container = document.getElementById('page-container');
    container.innerHTML = mod.render();
    container.scrollTop = 0;

    // Post-init
    if (mod.init) setTimeout(() => mod.init(), 50);

    // Update hash
    history.replaceState(null, '', `#${moduleId}`);

    // Update alert badge
    this.updateAlertBadge();
  },

  getModuleSub(id) {
    const subs = {
      dashboard:'Indicadores en tiempo real', assets:'Registro de vehículos y equipos',
      preventive:'Mantenimientos preventivos', corrective:'Fallas y reparaciones',
      alerts:'Notificaciones del sistema', reports:'Reportes y exportaciones',
      users:'Gestión de usuarios', audit:'Bitácora de auditoría', settings:'Configuración del sistema',
    };
    return subs[id]||'';
  },

  updateAlertBadge() {
    const alerts = AlertEngine.generate();
    const badge  = document.getElementById('alert-badge');
    const cnt    = alerts.filter(a => a.severity !== 'completed').length;
    if (badge) {
      badge.textContent = cnt > 99 ? '99+' : cnt;
      badge.style.display = cnt > 0 ? 'flex' : 'none';
    }
  },

  /* ── Render Login ── */
  renderLogin() {
    document.getElementById('app-wrapper').style.display = 'none';
    document.getElementById('login-page').style.display  = 'flex';
  },

  /* ── Show App ── */
  showApp() {
    document.getElementById('app-wrapper').style.display = 'flex';
    document.getElementById('login-page').style.display  = 'none';
    this.buildSidebar();
    this.navigate(location.hash.slice(1) || 'dashboard');
  },

  /* ── Build Sidebar ── */
  buildSidebar() {
    const session   = Auth.getSession();
    const nav       = document.getElementById('sidebar-nav');
    const userCard  = document.getElementById('user-card');
    const roleInfo  = Auth.getRoleInfo(session?.role);

    // User card
    if (userCard) {
      userCard.innerHTML = `
      <div class="user-avatar">${session?.avatar||'?'}</div>
      <div class="user-info">
        <div class="user-name">${session?.name||'Usuario'}</div>
        <div class="user-role">${roleInfo.icon} ${roleInfo.label}</div>
      </div>`;
    }

    // Nav items
    if (!nav) return;
    const perms = Auth.ROLES[session?.role]?.perms || [];
    const hasAll = perms.includes('*');

    let html = '';
    const sections = [
      { label:'Principal', items:['dashboard'] },
      { label:'Gestión', items:['assets','preventive','corrective'] },
      { label:'Análisis', items:['alerts','reports'] },
      { label:'Sistema', items:['users','audit','settings'] },
    ];

    sections.forEach(sec => {
      const visibleItems = NAV_ITEMS.filter(n => sec.items.includes(n.id) && (hasAll || perms.includes(n.module) || ['users','audit','settings'].includes(n.id) && hasAll));
      if (!visibleItems.length) return;
      html += `<div class="nav-section-label">${sec.label}</div>`;
      visibleItems.forEach(item => {
        html += `
        <div class="nav-item ${this.currentModule===item.id?'active':''}" data-module="${item.id}" onclick="App.navigate('${item.id}')">
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
        </div>`;
      });
    });
    nav.innerHTML = html;
  },

  /* ── Init ── */
  async init() {
    const boot = document.getElementById('boot-loading');
    try {
      await DB.bootstrap();
    } catch (err) {
      console.error('[App] Error en bootstrap:', err);
    }
    if (boot) boot.style.display = 'none';

    // Toggle sidebar
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      if (window.innerWidth <= 768) {
        sb.classList.toggle('mobile-open');
      } else {
        sb.classList.toggle('collapsed');
      }
    });

    // Alert panel toggle
    document.getElementById('btn-alert-bell')?.addEventListener('click', () => {
      this.openAlertPanel();
    });
    document.getElementById('close-alert-panel')?.addEventListener('click', () => {
      document.getElementById('alerts-panel').classList.remove('open');
    });

    // Click outside sidebar on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        const sb = document.getElementById('sidebar');
        if (sb?.classList.contains('mobile-open') && !sb.contains(e.target) && e.target.id !== 'btn-toggle-sidebar') {
          sb.classList.remove('mobile-open');
        }
      }
    });

    if (Auth.getSession()) {
      this.showApp();
    } else {
      this.renderLogin();
    }
  },

  openAlertPanel() {
    const panel  = document.getElementById('alerts-panel');
    const body   = document.getElementById('alerts-panel-body');
    const alerts = AlertEngine.generate().filter(a => a.severity !== 'completed');
    panel.classList.toggle('open');

    if (panel.classList.contains('open') && body) {
      body.innerHTML = alerts.length === 0
        ? `<div class="empty-state"><div class="empty-icon">✅</div><h3>Sin alertas</h3></div>`
        : alerts.map(a => {
            const sev = getAlertSeverity(a);
            const si  = severityInfo(sev);
            const rem = a.remainingKm;
            return `
          <div class="alert-item" onclick="App.navigate('alerts');document.getElementById('alerts-panel').classList.remove('open')">
            <div class="alert-item-icon ${sev === 'completed' ? 'alert-icon-info' : si.css === 'sev-critical' ? 'alert-icon-danger' : si.css === 'sev-red' ? 'alert-icon-danger' : 'alert-icon-warning'}">${si.icon}</div>
            <div class="alert-item-body">
              <div class="alert-item-title">${a.tipoMantenimiento} — ${a.vehiculo}</div>
              <div class="alert-item-msg">${rem >= 0 ? 'Faltan ' + fmtKm(rem) : 'Kilometraje excedido'} · Próximo: ${fmtKm(a.nextKm)}</div>
              <div class="alert-item-time">↗ Ir a Alertas</div>
            </div>
          </div>`;
          }).join('');
    }
  },
};

/* ====================================================
   MODAL HELPERS
   ==================================================== */

function showModal(placeholderId, title, bodyHtml, footerHtml = '', extraClass = '') {
  const el = document.getElementById(placeholderId);
  if (!el) return;
  el.innerHTML = `
  <div class="modal-overlay" onclick="if(event.target===this)closeModal('${placeholderId}')">
    <div class="modal ${extraClass}">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="modal-close" onclick="closeModal('${placeholderId}')">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  </div>`;
}

function closeModal(placeholderId) {
  const el = document.getElementById(placeholderId);
  if (el) el.innerHTML = '';
}

/* ====================================================
   TOAST SYSTEM
   ==================================================== */

function showToast(message, type = 'info', title = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success:'✅', warning:'⚠️', error:'❌', info:'ℹ️' };
  const titles = { success:'Éxito', warning:'Advertencia', error:'Error', info:'Información' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
  <div class="toast-icon">${icons[type]||'ℹ️'}</div>
  <div class="toast-body">
    <div class="toast-title">${title || titles[type]}</div>
    <div class="toast-msg">${message}</div>
  </div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideInToast 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ====================================================
   FILE DOWNLOAD HELPER
   ==================================================== */

function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ====================================================
   LOGIN HANDLERS
   ==================================================== */

function handleLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const pwd   = document.getElementById('login-pwd')?.value?.trim();
  if (!email || !pwd) { showToast('Ingresa tu email y contraseña','error'); return; }
  const session = Auth.login(email, pwd);
  if (!session) { showToast('Credenciales incorrectas','error'); return; }
  showToast(`Bienvenido, ${session.name}!`, 'success');
  setTimeout(() => App.showApp(), 400);
}

function handleDemoLogin(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-pwd').value   = password;
  handleLogin();
}

function handleLogout() {
  Auth.logout();
  location.reload();
}

/* ====================================================
   START
   ==================================================== */

document.addEventListener('DOMContentLoaded', () => App.init());
