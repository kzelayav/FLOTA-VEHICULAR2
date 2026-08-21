/* ====================================================
   AUTH — Role-based Access Control
   ==================================================== */

const Auth = {
  SESSION_KEY: 'fleet_session',

  ROLES: {
    admin:      { label:'Administrador', color:'primary', icon:'👑', perms: ['*'] },
    supervisor: { label:'Supervisor',    color:'info',    icon:'🔧', perms: ['dashboard','assets','preventive','corrective','alerts','reports'] },
    tecnico:    { label:'Técnico',       color:'success', icon:'🛠️', perms: ['dashboard','assets','preventive','corrective'] },
    consulta:   { label:'Consulta',      color:'muted',   icon:'👁️', perms: ['dashboard','reports'] },
  },

  /* ── Login ── */
  login(email, password) {
    const users = DB.getUsers();
    const user  = users.find(u => u.email === email && u.password === password && u.active);
    if (!user) return null;
    const session = { ...user };
    delete session.password;
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    DB.addAudit({ user: user.name, action: 'LOGIN', detail: `Inicio de sesión desde ${navigator.userAgent.slice(0,30)}` });
    return session;
  },

  /* ── Logout ── */
  logout() {
    const s = this.getSession();
    if (s) DB.addAudit({ user: s.name, action: 'LOGOUT', detail: 'Cierre de sesión' });
    sessionStorage.removeItem(this.SESSION_KEY);
  },

  /* ── Get current session ── */
  getSession() {
    try { return JSON.parse(sessionStorage.getItem(this.SESSION_KEY)); }
    catch { return null; }
  },

  /* ── Check permission ── */
  can(module) {
    const s = this.getSession();
    if (!s) return false;
    const role = this.ROLES[s.role];
    if (!role) return false;
    return role.perms.includes('*') || role.perms.includes(module);
  },

  /* ── Role info ── */
  getRoleInfo(role) {
    return this.ROLES[role] || this.ROLES.consulta;
  },

  /* ── Is admin ── */
  isAdmin() {
    const s = this.getSession();
    return s && s.role === 'admin';
  },

  /* ── Render nav based on permissions ── */
  getVisibleNavItems() {
    const s = this.getSession();
    if (!s) return [];
    const perms = this.ROLES[s.role]?.perms || [];
    const all = NAV_ITEMS.filter(item => {
      if (!item.module) return true;
      return perms.includes('*') || perms.includes(item.module);
    });
    return all;
  },
};

/* Nav items definition */
const NAV_ITEMS = [
  { id:'dashboard',  label:'Dashboard',          icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>', module:'dashboard' },
  { id:'assets',     label:'Registro de Activos', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1M10 8h-1a4 4 0 0 0 0 8h1"/><path d="M14 10v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/></svg>', module:'assets' },
  { id:'preventive', label:'Mantenimiento Prev.', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1 7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3 0l-6.91-6.91a6 6 0 0 1 0-7.94l3.77 3.77"/></svg>', module:'preventive' },
  { id:'corrective', label:'Mantenimiento Corr.', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', module:'corrective' },
  { id:'alerts',     label:'Alertas',             icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>', module:'alerts' },
  { id:'reports',    label:'Reportes',            icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', module:'reports' },
  { id:'users',      label:'Usuarios',            icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', module:'users' },
  { id:'audit',      label:'Auditoría',           icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', module:'audit' },
  { id:'settings',   label:'Configuración',       icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', module:'settings' },
];
