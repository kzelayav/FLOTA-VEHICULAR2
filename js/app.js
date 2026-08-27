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
      const mode = Auth.getMode();
      if (mode === 'supabase') {
        await DB.bootstrap({ loadData: false });
      } else {
        await DB.bootstrap();
      }
    } catch (err) {
      console.error('[App] Error en bootstrap:', err);
    }
    if (boot) boot.style.display = 'none';

    const mode = Auth.getMode();

    if (mode === 'supabase') {
      Auth.initAuthListener();
      const restored = await Auth.restoreSupabaseSession();
      if (!restored || !Auth.getSession()) {
        this.renderLogin();
        this.initLoginForm();
        return;
      }
      try {
        await DB.loadOperationalData();
        this.showApp();
      } catch (err) {
        await Auth.logout();
        this.renderLogin();
        this.initLoginForm();
        showToast('Error cargando datos. Intente de nuevo.', 'error');
      }
    } else {
      if (Auth.getSession()) {
        this.showApp();
      } else {
        this.renderLogin();
        this.initLoginForm();
      }
    }

    // Toggle sidebar (desktop)
    document.getElementById('btn-collapse-sidebar')?.addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      sb.classList.toggle('collapsed');
    });

    // Toggle sidebar (mobile)
    document.getElementById('btn-toggle-sidebar-mobile')?.addEventListener('click', () => {
      const sb = document.getElementById('sidebar');
      sb.classList.toggle('mobile-open');
    });

    // Alert panel toggle
    document.getElementById('btn-alert-bell')?.addEventListener('click', () => {
      this.openAlertPanel();
    });
    document.getElementById('close-alert-panel')?.addEventListener('click', () => {
      document.getElementById('alerts-panel').classList.remove('open');
    });

    // User dropdown toggle
    const headerUserBtn = document.getElementById('header-user-btn');
    const userDropdown = document.getElementById('user-dropdown');
    headerUserBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown?.classList.toggle('open');
      headerUserBtn.setAttribute('aria-expanded', userDropdown?.classList.contains('open') || 'false');
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      if (userDropdown?.classList.contains('open') && !headerUserBtn?.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.remove('open');
        headerUserBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Click outside sidebar on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        const sb = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('btn-toggle-sidebar-mobile');
        if (sb?.classList.contains('mobile-open') && !sb.contains(e.target) && e.target !== toggleBtn) {
          sb.classList.remove('mobile-open');
        }
      }
    });
  },

  initLoginForm() {
    const form = document.getElementById('login-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
      });
    }
    document.querySelectorAll('.demo-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        handleDemoLogin(btn.dataset.email, btn.dataset.password);
      });
    });
    const togglePwd = document.querySelector('.toggle-password');
    if (togglePwd) {
      togglePwd.addEventListener('click', () => {
        const input = document.getElementById('login-pwd');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        togglePwd.classList.toggle('active', !isPassword);
      });
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
    <div class="modal ${extraClass}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <div class="modal-title" id="modal-title">${title}</div>
        <button class="modal-close" onclick="closeModal('${placeholderId}')" aria-label="Cerrar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  </div>`;
  const modal = el.querySelector('.modal');
  const closeBtn = el.querySelector('.modal-close');
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];

  // Focus first element
  firstFocusable?.focus();

  // Focus trap
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      closeModal(placeholderId);
      document.removeEventListener('keydown', handleKeydown);
    } else if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // Cleanup on close
  const originalClose = closeModal;
  window.closeModal = (pid) => {
    if (pid === placeholderId) {
      document.removeEventListener('keydown', handleKeydown);
    }
    return originalClose(pid);
  };
}

function closeModal(placeholderId) {
  const el = document.getElementById(placeholderId);
  if (el) el.innerHTML = '';
}

/* ====================================================
    TOAST SYSTEM
    ==================================================== */

const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};
const TOAST_TITLES = { success:'Éxito', warning:'Advertencia', error:'Error', info:'Información' };

function showToast(message, type = 'info', title = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
  <div class="toast-icon">${TOAST_ICONS[type]||TOAST_ICONS.info}</div>
  <div class="toast-body">
    <div class="toast-title">${title || TOAST_TITLES[type]}</div>
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

async function handleLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const pwd   = document.getElementById('login-pwd')?.value?.trim();
  if (!email || !pwd) { showToast('Ingresa tu email y contraseña','error'); return; }

  const submitBtn = document.getElementById('login-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const session = await Auth.login(email, pwd);
    if (!session) { showToast('Credenciales incorrectas','error'); return; }
    try {
      await DB.loadOperationalData();
      showToast(`Bienvenido, ${session.name}!`, 'success');
      setTimeout(() => App.showApp(), 400);
    } catch (err) {
      await Auth.logout();
      showToast('Error cargando datos. Intente de nuevo.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Credenciales incorrectas', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function handleDemoLogin(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-pwd').value   = password;
  handleLogin();
}

async function handleLogout() {
  await Auth.logout();
  location.reload();
}

/* ====================================================
   START
   ==================================================== */

document.addEventListener('DOMContentLoaded', () => App.init());
