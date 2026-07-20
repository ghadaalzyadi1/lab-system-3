/* ============================================================
   db.js — Supabase-backed data layer
   ------------------------------------------------------------
   Strategy: load everything from Supabase once into an in-memory
   cache at startup, so the rest of the app can keep reading data
   synchronously (DB.devices(), DB.stats(), ...). Mutations update
   the cache immediately (optimistic) and write to Supabase in the
   background. Certificates live in Supabase Storage.
   App-level settings (lab name, alert window, QR base URL) stay
   in localStorage since they are per-installation preferences.
   ============================================================ */
const DB = (() => {
  const SOON_DAYS = 60;
  const SET_KEY = 'labcal:settings:v1';
  const BUCKET = 'certificates';

  let sb = null;                 // supabase client
  let store = { departments: [], devices: [], settings: {} };

  /* ---------- settings (local) ---------- */
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch {}
    store.settings = Object.assign({ soonDays: SOON_DAYS, labName: 'مختبر كيمياء الأغذية', baseUrl: '' }, s);
  }
  function saveSettings(p) { Object.assign(store.settings, p); localStorage.setItem(SET_KEY, JSON.stringify(store.settings)); }

  /* ---------- row <-> object mapping ---------- */
  const deptToRow = (d) => ({ id: d.id, slug: d.slug, name_en: d.nameEn, name_ar: d.nameAr, icon: d.icon, color: d.color });
  const rowToDept = (r) => ({ id: r.id, slug: r.slug, nameEn: r.name_en, nameAr: r.name_ar, icon: r.icon, color: r.color });
  const deviceToRow = (d) => ({
    id: d.id, department_id: d.departmentId, unit: d.unit || '', category: d.category || 'supporting',
    old_code: d.oldCode || '', new_code: d.newCode || '', name: d.name || '', manufacturer: d.manufacturer || '',
    serial: d.serial || '', model: d.model || '', test: d.test || '', cert_number: d.certNumber || '',
    cal_company: d.calCompany || '', cal_date: d.calDate || '', due_date: d.dueDate || '', remarks: d.remarks || '',
   condition: d.condition || 'operational', certificate_path: d.certificatePath || null, cert_file: d.certFile || null,
   cert_url: d.certUrl || null, cert_type: d.certType || null
  const rowToDevice = (r) => ({
    id: r.id, departmentId: r.department_id, unit: r.unit || '', category: r.category || 'supporting',
    oldCode: r.old_code || '', newCode: r.new_code || '', name: r.name || '', manufacturer: r.manufacturer || '',
    serial: r.serial || '', model: r.model || '', test: r.test || '', certNumber: r.cert_number || '',
    calCompany: r.cal_company || '', calDate: r.cal_date || '', dueDate: r.due_date || '', remarks: r.remarks || '',
    condition: r.condition || 'operational', certificatePath: r.certificate_path || '', certFile: r.cert_file || '',
    certUrl: r.cert_url || '', certType: r.cert_type || '',
    certificateId: r.certificate_path ? r.id : '', history: []
  });

  /* ---------- error helper ---------- */
  function bg(promise, action) {
    Promise.resolve(promise).then(({ error } = {}) => {
      if (error) { console.error(action, error); if (window.toast) toast('تعذّر الحفظ في السحابة: ' + (error.message || ''), 'err'); }
    }).catch(e => { console.error(action, e); if (window.toast) toast('خطأ في الاتصال بالسحابة', 'err'); });
  }

  /* ---------- init / load ---------- */
  async function init() {
    loadSettings();
    if (!window.supabase || typeof SUPABASE_URL === 'undefined') {
      throw new Error('مكتبة Supabase أو ملف config.js غير محمّل');
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    await loadAll();
    if (store.departments.length === 0) { await seed(); await loadAll(); }
  }

  async function loadAll() {
    const [{ data: depts, error: e1 }, { data: devs, error: e2 }, { data: hist, error: e3 }] = await Promise.all([
      sb.from('departments').select('*'),
      sb.from('devices').select('*'),
      sb.from('device_history').select('*').order('created_at', { ascending: false })
    ]);
    if (e1 || e2 || e3) throw (e1 || e2 || e3);
    store.departments = (depts || []).map(rowToDept);
    store.devices = (devs || []).map(rowToDevice);
    const byDev = {};
    (hist || []).forEach(h => { (byDev[h.device_id] = byDev[h.device_id] || []).push({ date: h.date, text: h.text, user: h.username }); });
    store.devices.forEach(d => { d.history = byDev[d.id] || []; });
  }

  async function seed() {
    await sb.from('departments').upsert(SEED_DEPARTMENTS.map(deptToRow));
    await sb.from('devices').upsert(SEED_DEVICES.map(deviceToRow));
    const hist = SEED_DEVICES.map(d => ({ device_id: d.id, date: today(), text: 'تمت إضافة الجهاز إلى النظام', username: 'system' }));
    await sb.from('device_history').insert(hist);
  }

  // إعادة تعبئة البيانات الأصلية في السحابة (upsert لا يحذف الإضافات)
  async function resetAll() {
    await sb.from('departments').upsert(SEED_DEPARTMENTS.map(deptToRow));
    await sb.from('devices').upsert(SEED_DEVICES.map(deviceToRow));
    await loadAll();
  }

  /* ---------- date helpers ---------- */
  function parseDate(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  function today() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  function daysUntil(s) {
    const d = parseDate(s); if (!d) return null;
    const t = new Date(); t.setHours(0,0,0,0);
    return Math.round((d - t) / 86400000);
  }
  const fmtDate = (s) => s || '—';

  /* ---------- status ---------- */
  function status(device) {
    const days = daysUntil(device.dueDate);
    if (days === null) return 'unknown';
    if (days < 0) return 'expired';
    if (days <= (store.settings.soonDays ?? SOON_DAYS)) return 'soon';
    return 'valid';
  }
  const STATUS_LABEL = { valid:'سارية', soon:'تنتهي قريباً', expired:'منتهية', unknown:'غير محددة' };
  const COND_LABEL   = { operational:'تعمل', maintenance:'تحت الصيانة', out_of_service:'خارج الخدمة' };

  /* ---------- departments ---------- */
  const departments = () => store.departments;
  const department  = (id) => store.departments.find(d => d.id === id || d.slug === id);
  function addDepartment(dep) {
    dep.id = dep.id || slugify(dep.nameEn || dep.nameAr);
    store.departments.push(dep);
    bg(sb.from('departments').upsert(deptToRow(dep)), 'addDepartment');
    return dep;
  }
  function updateDepartment(id, patch) {
    const d = department(id); if (!d) return; Object.assign(d, patch);
    bg(sb.from('departments').upsert(deptToRow(d)), 'updateDepartment'); return d;
  }
  function deleteDepartment(id) {
    store.departments = store.departments.filter(d => d.id !== id);
    store.devices = store.devices.filter(d => d.departmentId !== id);
    bg(sb.from('departments').delete().eq('id', id), 'deleteDepartment');
  }

  /* ---------- devices ---------- */
  const devices = () => store.devices;
  const device  = (id) => store.devices.find(d => d.id === id);
  const devicesByDept = (deptId) => store.devices.filter(d => d.departmentId === deptId);

  function addDevice(dev, user = '—') {
    dev.id = dev.id || uniqueId(dev.newCode || dev.oldCode || dev.name || 'dev');
    dev.condition = dev.condition || 'operational';
    dev.history = [{ date: today(), text: 'تمت إضافة الجهاز', user }];
    store.devices.push(dev);
    bg(sb.from('devices').upsert(deviceToRow(dev)), 'addDevice');
    bg(sb.from('device_history').insert({ device_id: dev.id, date: today(), text: 'تمت إضافة الجهاز', username: user }), 'addDevice/history');
    return dev;
  }
  function updateDevice(id, patch, user = '—', note) {
    const d = device(id); if (!d) return; Object.assign(d, patch);
    bg(sb.from('devices').upsert(deviceToRow(d)), 'updateDevice');
    if (note) {
      d.history = d.history || []; d.history.unshift({ date: today(), text: note, user });
      bg(sb.from('device_history').insert({ device_id: id, date: today(), text: note, username: user }), 'updateDevice/history');
    }
    return d;
  }
  function deleteDevice(id) {
    store.devices = store.devices.filter(d => d.id !== id);
    bg(sb.from('devices').delete().eq('id', id), 'deleteDevice');
  }
  function logHistory(id, text, user = '—') {
    const d = device(id); if (!d) return;
    d.history = d.history || []; d.history.unshift({ date: today(), text, user });
    bg(sb.from('device_history').insert({ device_id: id, date: today(), text, username: user }), 'logHistory');
  }

  /* ---------- stats ---------- */
  function stats(list = store.devices) {
    const s = { total: list.length, valid:0, soon:0, expired:0, unknown:0, main:0, supporting:0, operational:0, maintenance:0, out_of_service:0 };
    list.forEach(d => { s[status(d)]++; s[d.category === 'main' ? 'main' : 'supporting']++; s[d.condition || 'operational']++; });
    return s;
  }
  function alerts() {
    return store.devices.map(d => ({ d, st: status(d), days: daysUntil(d.dueDate) }))
      .filter(x => x.st === 'expired' || x.st === 'soon')
      .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  }

  /* ---------- helpers ---------- */
  function slugify(s) { return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'item'; }
  function uniqueId(base) {
    let id = slugify(base); const exists = x => store.devices.some(d => d.id === x);
    let cur = id, n = 1; while (exists(cur)) { n++; cur = `${id}-${n}`; } return cur;
  }

  /* ---------- certificates (Supabase Storage) ---------- */
  async function saveCertificate(id, blob, filename, type) {
    const path = `${id}/file`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: type || 'application/octet-stream' });
    if (error) throw error;
    return path;
  }
  async function getCertificate(id) {
    const { data, error } = await sb.storage.from(BUCKET).download(`${id}/file`);
    if (error || !data) return null;
    const d = device(id);
    return { blob: data, filename: (d && d.certFile) || 'certificate', type: data.type };
  }
  async function deleteCertificate(id) {
    await sb.storage.from(BUCKET).remove([`${id}/file`]);
  }

  /* ---------- expose ---------- */
  const ready = init();   // promise the app awaits before first render

  return {
    ready, resetAll, seedReset: resetAll,
    parseDate, today, daysUntil, fmtDate, status, STATUS_LABEL, COND_LABEL, SOON_DAYS,
    departments, department, addDepartment, updateDepartment, deleteDepartment,
    devices, device, devicesByDept, addDevice, updateDevice, deleteDevice, logHistory,
    stats, alerts, slugify, uniqueId,
    saveCertificate, getCertificate, deleteCertificate,
    get settings() { return store.settings; }, saveSettings
  };
})();
