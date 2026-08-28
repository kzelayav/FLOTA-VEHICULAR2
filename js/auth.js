/* ====================================================
   AUTH — Role-based Access Control + Dual Auth Infrastructure
   ==================================================== */

const Auth = {
  ROLES: {
    admin:      { label:'Administrador', color:'primary', icon:'👑', perms: ['*'] },
    supervisor: { label:'Supervisor',    color:'info',    icon:'🔧', perms: ['dashboard','assets','preventive','corrective','alerts','reports'] },
    tecnico:    { label:'Técnico',       color:'success', icon:'🛠️', perms: ['dashboard','assets','preventive','corrective'] },
    consulta:   { label:'Consulta',      color:'muted',   icon:'👁️', perms: ['dashboard','reports'] },
  },

  _session: null,
  _authSub: null,

  /* ── Configuración de modo ── */
  getMode() {
    try {
      const cfg = window.SUPABASE_CONFIG || {};
      const mode = cfg.authMode;
      if (mode === 'supabase') return mode;
      console.warn('[Auth] authMode no configurado como supabase, usando supabase');
      return 'supabase';
    } catch {
      console.warn('[Auth] Error leyendo configuración, usando supabase');
      return 'supabase';
    }
  },

  /* ── Login unificado (async) ── */
  async login(email, password) {
    return await this.loginSupabase(email, password);
  },

  /* ── Login Supabase (async) ── */
  async loginSupabase(email, password) {
    const client = DB.supabase;
    if (!client) throw new Error('Cliente Supabase no disponible');

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Credenciales inválidas');

    const profile = await this.loadOwnProfile(data.user.id);
    if (!profile) throw new Error('Perfil no configurado');
    if (!profile.active) throw new Error('Cuenta desactivada');

    const session = this.adaptSupabaseSession(data.user, profile);
    this._session = session;
    return session;
  },

  /* ── Restaurar sesión Supabase (async) ── */
  async restoreSupabaseSession() {
    const client = DB.supabase;
    if (!client) return false;

    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) {
      this._session = null;
      return false;
    }

    const profile = await this.loadOwnProfile(session.user.id);
    if (!profile || !profile.active) {
      await client.auth.signOut();
      this._session = null;
      return false;
    }

    this._session = this.adaptSupabaseSession(session.user, profile);
    return true;
  },

  /* ── Cargar propio profile (async) ── */
  async loadOwnProfile(userId) {
    const client = DB.supabase;
    if (!client) return null;

    const { data, error } = await client
      .from('profiles')
      .select('id,name,role,active')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data;
  },

  /* ── Adapter de sesión Supabase → contrato app ── */
  adaptSupabaseSession(user, profile) {
    return {
      id: user.id,
      name: profile.name,
      email: user.email,
      role: profile.role,
      avatar: '',
      active: profile.active,
    };
  },

  /* ── Get current session (SYNC) ── */
  getSession() {
    return this._session;
  },

  /* ── Logout (async) ── */
  async logout() {
    const previousSession = this.getSession();

    // 1. Persistir LOGOUT antes de cerrar sesión (mientras el JWT es válido)
    if (previousSession?.name) {
      try {
        const logoutEntry = {
          id: DB.newId(),
          user_name: previousSession.name,
          action: 'LOGOUT',
          detail: `Cierre de sesión supabase`,
          ts: new Date().toISOString(),
        };
        await DB._persistAuditRow({ id: logoutEntry.id, user_name: logoutEntry.user_name, action: logoutEntry.action, detail: logoutEntry.detail, ts: logoutEntry.ts });
      } catch {
        console.warn('[Auth] Auditoría LOGOUT no disponible');
      }
    }

    // 2. Cerrar sesión en Supabase
    const client = DB.supabase;
    if (client) {
      await client.auth.signOut().catch(()=>{});
    }

    // 3. Limpiar residuos legacy
    try { sessionStorage.removeItem('fleet_session'); } catch {}
    this._session = null;

    // No registrar auditoría aquí (ya se hizo arriba)
  },

  /* ── Inicializar listener de auth (solo modo supabase) ── */
  initAuthListener() {
    const client = DB.supabase;
    if (!client || this._authSub) return;

    const result = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this._session = null;
        // La recarga oficial la hace handleLogout(); aquí solo limpiamos estado
      }
      // SIGNED_IN: no hacer nada (login explícito ya cargó profile)
    });
    this._authSub = result?.data?.subscription || null;
  },

  /* ── Limpiar suscripción (si se reinicializa) ── */
  clearAuthListener() {
    if (this._authSub?.unsubscribe) {
      this._authSub.unsubscribe();
    }
    this._authSub = null;
  },

  /* ── Limpiar sesión runtime ── */
  clearRuntimeSession() {
    this._session = null;
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
