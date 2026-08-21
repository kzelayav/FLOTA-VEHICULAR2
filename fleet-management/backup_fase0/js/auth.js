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
  { id:'dashboard',  label:'Dashboard',          icon:'📊', module:'dashboard' },
  { id:'assets',     label:'Registro de Activos', icon:'🚛', module:'assets' },
  { id:'preventive', label:'Mantenimiento Prev.', icon:'🔧', module:'preventive' },
  { id:'corrective', label:'Mantenimiento Corr.', icon:'⚠️', module:'corrective' },
  { id:'alerts',     label:'Alertas',             icon:'🔔', module:'alerts' },
  { id:'reports',    label:'Reportes',            icon:'📄', module:'reports' },
  { id:'users',      label:'Usuarios',            icon:'👥', module:'users' },
  { id:'audit',      label:'Auditoría',           icon:'🗂️', module:'audit' },
  { id:'settings',   label:'Configuración',       icon:'⚙️', module:'settings' },
];
