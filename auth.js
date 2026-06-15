/* ============================================================
   auth.js — Local user accounts, roles & permissions
   NOTE: This is a client-side demo auth (passwords are lightly
   hashed, not cryptographically secure). For production, pair the
   UI with a real backend / identity provider.
   ============================================================ */
const Auth = (() => {
  const UKEY = 'labcal:users:v1';
  const SKEY = 'labcal:session:v1';

  const ROLES = {
    admin:      { label: 'مدير النظام',  desc: 'صلاحيات كاملة + إدارة المستخدمين والأقسام' },
    technician: { label: 'فني مختبر',    desc: 'إضافة وتعديل الأجهزة ورفع الشهادات وتحديث الحالة' },
    viewer:     { label: 'مشاهد',        desc: 'عرض البيانات والتقارير فقط' }
  };

  // permission -> roles allowed
  const PERMS = {
    'device.create':  ['admin','technician'],
    'device.edit':    ['admin','technician'],
    'device.delete':  ['admin'],
    'device.status':  ['admin','technician'],   // update condition / scan
    'cert.upload':    ['admin','technician'],
    'cert.delete':    ['admin'],
    'dept.manage':    ['admin'],
    'user.manage':    ['admin'],
    'settings.manage':['admin'],
    'report.view':    ['admin','technician','viewer'],
  };

  function hash(s){ // tiny non-secure hash, just to avoid plaintext at rest
    let h = 5381; for (let i=0;i<s.length;i++) h = ((h<<5)+h+s.charCodeAt(i))|0;
    return 'h' + (h>>>0).toString(36);
  }

  function users(){
    let u = null;
    try { u = JSON.parse(localStorage.getItem(UKEY)); } catch {}
    if (!u || !u.length){
      u = [
        { id:'admin', username:'admin', name:'مدير النظام', role:'admin', pass:hash('admin123'), createdAt:Date.now() },
        { id:'tech',  username:'tech',  name:'فني المعايرة', role:'technician', pass:hash('tech123'),  createdAt:Date.now() },
        { id:'view',  username:'viewer',name:'مراجع الجودة', role:'viewer', pass:hash('view123'),  createdAt:Date.now() },
      ];
      localStorage.setItem(UKEY, JSON.stringify(u));
    }
    return u;
  }
  function saveUsers(list){ localStorage.setItem(UKEY, JSON.stringify(list)); }

  function login(username, password){
    const u = users().find(x => x.username.toLowerCase() === String(username).toLowerCase());
    if (!u || u.pass !== hash(password)) return null;
    const session = { id:u.id, username:u.username, name:u.name, role:u.role, at:Date.now() };
    localStorage.setItem(SKEY, JSON.stringify(session));
    return session;
  }
  function logout(){ localStorage.removeItem(SKEY); }
  function current(){ try { return JSON.parse(localStorage.getItem(SKEY)); } catch { return null; } }

  function can(perm){
    const u = current(); if (!u) return false;
    const roles = PERMS[perm]; return roles ? roles.includes(u.role) : false;
  }

  function addUser({ username, name, role, password }){
    const list = users();
    if (list.some(u => u.username.toLowerCase() === username.toLowerCase()))
      throw new Error('اسم المستخدم موجود مسبقاً');
    const u = { id:'u'+Date.now().toString(36), username, name, role, pass:hash(password||'123456'), createdAt:Date.now() };
    list.push(u); saveUsers(list); return u;
  }
  function updateUser(id, patch){
    const list = users(); const u = list.find(x => x.id === id); if (!u) return;
    if (patch.password){ u.pass = hash(patch.password); delete patch.password; }
    Object.assign(u, patch); saveUsers(list);
    const cur = current(); if (cur && cur.id === id){ cur.name=u.name; cur.role=u.role; localStorage.setItem(SKEY, JSON.stringify(cur)); }
    return u;
  }
  function deleteUser(id){
    if (id === 'admin') throw new Error('لا يمكن حذف حساب المدير الأساسي');
    saveUsers(users().filter(u => u.id !== id));
  }

  return { ROLES, PERMS, users, login, logout, current, can, addUser, updateUser, deleteUser, roleLabel:(r)=>ROLES[r]?.label||r };
})();
