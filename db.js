/* ============================================================
   db.js — Data layer
   Structured data  -> localStorage
   Certificate files -> IndexedDB (so large PDFs/images don't
   blow the localStorage quota)
   ============================================================ */
const DB = (() => {
  const LS_KEY = 'labcal:data:v1';
  const SOON_DAYS = 60;            // "expiring soon" window (days)

  /* ---------- structured store ---------- */
  let store = null;

  const SCHEMA = 2;                 // bump when seed classification changes

  function load() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { try { store = JSON.parse(raw); } catch { store = null; } }
    if (!store || !store.devices) seed();
    else migrate();
    return store;
  }

  // Non-destructive migrations for data cached from an older version.
  function migrate() {
    const from = store.schema || 1;
    if (from < 2) {
      // All workbook devices are auxiliary/supporting equipment.
      const seedIds = new Set((typeof SEED_DEVICES !== 'undefined' ? SEED_DEVICES : []).map(d => d.id));
      store.devices.forEach(d => { if (seedIds.has(d.id)) d.category = 'supporting'; });
    }
    if ((store.schema || 1) !== SCHEMA) { store.schema = SCHEMA; persist(); }
  }
  function persistSeed() { store.schema = SCHEMA; persist(); }
  function persist() { localStorage.setItem(LS_KEY, JSON.stringify(store)); }

  function seed() {
    store = {
      departments: structuredClone(SEED_DEPARTMENTS),
      devices: structuredClone(SEED_DEVICES).map(d => ({ ...d, history: [
        { date: today(), text: 'تمت إضافة الجهاز إلى النظام', user: 'system' }
      ]})),
      settings: { soonDays: SOON_DAYS, labName: 'مختبر سلامة الغذاء' },
      seededAt: new Date().toISOString(),
      schema: SCHEMA
    };
    persist();
  }
  function resetAll() { localStorage.removeItem(LS_KEY); store = null; load(); }

  /* ---------- date helpers ---------- */
  function parseDate(s) {
    if (!s) return null;
    // dd/mm/yyyy
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function today() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  function daysUntil(dateStr) {
    const d = parseDate(dateStr); if (!d) return null;
    const t = new Date(); t.setHours(0,0,0,0);
    return Math.round((d - t) / 86400000);
  }
  function fmtDate(s){ return s || '—'; }

  /* ---------- calibration status ---------- */
  function status(device) {
    const days = daysUntil(device.dueDate);
    if (days === null) return 'unknown';
    if (days < 0) return 'expired';
    if (days <= (store.settings?.soonDays ?? SOON_DAYS)) return 'soon';
    return 'valid';
  }
  const STATUS_LABEL = { valid:'سارية', soon:'تنتهي قريباً', expired:'منتهية', unknown:'غير محددة' };
  const COND_LABEL   = { operational:'تعمل', maintenance:'تحت الصيانة', out_of_service:'خارج الخدمة' };

  /* ---------- departments ---------- */
  const departments = () => store.departments;
  const department  = (id) => store.departments.find(d => d.id === id || d.slug === id);
  function addDepartment(dep){
    dep.id = dep.id || slugify(dep.nameEn || dep.nameAr);
    store.departments.push(dep); persist(); return dep;
  }
  function updateDepartment(id, patch){
    const d = department(id); if(!d) return; Object.assign(d, patch); persist(); return d;
  }
  function deleteDepartment(id){
    store.departments = store.departments.filter(d => d.id !== id);
    store.devices = store.devices.filter(d => d.departmentId !== id);
    persist();
  }

  /* ---------- devices ---------- */
  const devices = () => store.devices;
  const device  = (id) => store.devices.find(d => d.id === id);
  const devicesByDept = (deptId) => store.devices.filter(d => d.departmentId === deptId);

  function addDevice(dev, user='—'){
    dev.id = dev.id || uniqueId(dev.newCode || dev.oldCode || dev.name || 'dev');
    dev.history = [{ date: today(), text: 'تمت إضافة الجهاز', user }];
    dev.condition = dev.condition || 'operational';
    store.devices.push(dev); persist(); return dev;
  }
  function updateDevice(id, patch, user='—', note){
    const d = device(id); if(!d) return;
    Object.assign(d, patch);
    if (note){ d.history = d.history || []; d.history.unshift({ date: today(), text: note, user }); }
    persist(); return d;
  }
  function deleteDevice(id){
    store.devices = store.devices.filter(d => d.id !== id); persist();
  }
  function logHistory(id, text, user='—'){
    const d = device(id); if(!d) return;
    d.history = d.history || []; d.history.unshift({ date: today(), text, user }); persist();
  }

  /* ---------- aggregate stats ---------- */
  function stats(list = store.devices){
    const s = { total:list.length, valid:0, soon:0, expired:0, unknown:0,
                main:0, supporting:0, operational:0, maintenance:0, out_of_service:0 };
    list.forEach(d => {
      s[status(d)]++;
      s[d.category === 'main' ? 'main' : 'supporting']++;
      s[d.condition || 'operational']++;
    });
    return s;
  }
  function alerts(){
    return store.devices
      .map(d => ({ d, st: status(d), days: daysUntil(d.dueDate) }))
      .filter(x => x.st === 'expired' || x.st === 'soon')
      .sort((a,b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  }

  /* ---------- helpers ---------- */
  function slugify(s){ return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'item'; }
  function uniqueId(base){
    let id = slugify(base), n = 1;
    const exists = x => store.devices.some(d => d.id === x);
    let cur = id; while (exists(cur)) { n++; cur = `${id}-${n}`; }
    return cur;
  }

  /* ============================================================
     Certificate files — IndexedDB
     ============================================================ */
  const IDB_NAME = 'labcal-certs', IDB_STORE = 'files';
  let idbPromise = null;
  function idb(){
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return idbPromise;
  }
  async function saveCertificate(id, blob, filename, type){
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ blob, filename, type, savedAt: Date.now() }, id);
      tx.oncomplete = () => res(id); tx.onerror = () => rej(tx.error);
    });
  }
  async function getCertificate(id){
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const rq = tx.objectStore(IDB_STORE).get(id);
      rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error);
    });
  }
  async function deleteCertificate(id){
    const db = await idb();
    return new Promise((res) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id); tx.oncomplete = res;
    });
  }

  load();
  return {
    load, persist, resetAll, seedReset: resetAll,
    parseDate, today, daysUntil, fmtDate, status, STATUS_LABEL, COND_LABEL, SOON_DAYS,
    departments, department, addDepartment, updateDepartment, deleteDepartment,
    devices, device, devicesByDept, addDevice, updateDevice, deleteDevice, logHistory,
    stats, alerts, slugify, uniqueId,
    saveCertificate, getCertificate, deleteCertificate,
    get settings(){ return store.settings; },
    saveSettings(p){ Object.assign(store.settings, p); persist(); }
  };
})();
