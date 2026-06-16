/* ============================================================
   app.js — SPA router + views
   ============================================================ */
'use strict';

/* ---------- tiny DOM + utils ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qs = (o) => Object.entries(o).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');

function toast(msg, kind=''){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toast._t); toast._t = setTimeout(()=> t.className='toast', 2600);
}
function go(hash){ location.hash = hash; }

const ICONS = {
  dashboard:'📊', dept:'🏢', devices:'🔬', scan:'📷', reports:'📈', users:'👥', settings:'⚙️', cert:'📄', alert:'🔔'
};

function statusBadge(st){
  return `<span class="badge ${st}">${st==='valid'?'✅':st==='soon'?'⏳':st==='expired'?'⛔':'❔'} ${DB.STATUS_LABEL[st]}</span>`;
}
function condBadge(c){
  c = c || 'operational';
  const ic = { operational:'🟢', maintenance:'🛠️', out_of_service:'🔴' }[c];
  return `<span class="badge cond-${c}">${ic} ${DB.COND_LABEL[c]}</span>`;
}
function catBadge(cat){
  return cat==='main'
    ? '<span class="badge main">⭐ رئيسي</span>'
    : '<span class="badge supporting">🔧 مساند</span>';
}

/* ---------- modal ---------- */
function modal({ title, body, footer, onOpen }){
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay open" id="m-ov">
      <div class="modal">
        <div class="modal-head"><h3>${title}</h3><button id="m-x">×</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML=''; };
  $('#m-x').onclick = close;
  $('#m-ov').onclick = (e)=>{ if(e.target.id==='m-ov') close(); };
  if (onOpen) onOpen(close);
  return close;
}

/* ============================================================
   Router
   ============================================================ */
const routes = [
  [/^\/login$/,                () => viewLogin()],
  [/^\/$/,                     () => layout(viewDashboard)],
  [/^\/departments$/,          () => layout(viewDepartments)],
  [/^\/dept\/([^/]+)$/,        (m) => layout(() => viewDepartment(m[1]))],
  [/^\/device\/([^/]+)\/edit$/,(m) => layout(() => viewDeviceForm(m[1]))],
  [/^\/device\/([^/]+)$/,      (m) => layout(() => viewDevice(m[1]))],
  [/^\/add-device$/,           () => layout(() => viewDeviceForm(null))],
  [/^\/scan$/,                 () => layout(viewScan)],
  [/^\/qrcodes$/,              () => layout(viewQRSheet)],
  [/^\/reports$/,              () => layout(viewReports)],
  [/^\/users$/,                () => layout(viewUsers)],
  [/^\/settings$/,             () => layout(viewSettings)],
];

function router(){
  const path = (location.hash.replace(/^#/, '') || '/');
  if (!Auth.current() && path !== '/login') return go('/login');
  if (Auth.current() && path === '/login') return go('/');
  for (const [re, fn] of routes){
    const m = path.match(re);
    if (m){ fn(m); window.scrollTo(0,0); return; }
  }
  layout(() => `<div class="empty"><div class="e-ico">🤷</div><h3>الصفحة غير موجودة</h3></div>`);
}
window.addEventListener('hashchange', router);

// انتظر تحميل البيانات من Supabase قبل أول عرض
async function boot(){
  $('#app').innerHTML = `<div class="login-wrap"><div style="color:#fff;text-align:center">
    <div style="font-size:46px">🔬</div><p style="margin-top:12px;font-size:16px">جارٍ الاتصال بقاعدة البيانات...</p></div></div>`;
  try {
    await DB.ready;
    router();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="login-wrap"><div class="login-card" style="text-align:center">
      <div class="lc-logo">⚠️</div><h1>تعذّر الاتصال بقاعدة البيانات</h1>
      <p class="sub">تأكدي من تشغيل ملف supabase-schema.sql في Supabase ومن صحة بيانات config.js، ثم حدّثي الصفحة.</p>
      <p class="muted" style="font-size:12px;direction:ltr;background:#f8fafc;padding:10px;border-radius:8px">${esc(e.message||e)}</p>
      <button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="location.reload()">إعادة المحاولة</button>
    </div></div>`;
  }
}
window.addEventListener('load', boot);

/* ============================================================
   Layout shell (sidebar + topbar)
   ============================================================ */
function navItems(){
  const a = DB.alerts().length;
  return [
    { sec:'الرئيسية' },
    { href:'#/',            ico:ICONS.dashboard, label:'لوحة التحكم' },
    { href:'#/departments', ico:ICONS.dept,      label:'الأقسام والأجهزة' },
    { href:'#/scan',        ico:ICONS.scan,      label:'مسح QR' },
    { href:'#/qrcodes',     ico:'🏷️',           label:'رموز QR' },
    { href:'#/reports',     ico:ICONS.reports,   label:'التقارير' },
    { sec:'الإدارة' },
    { href:'#/users',       ico:ICONS.users,     label:'المستخدمون', perm:'user.manage' },
    { href:'#/settings',    ico:ICONS.settings,  label:'الإعدادات',  perm:'settings.manage' },
    { spacerAlert:a },
  ];
}

function layout(viewFn){
  const u = Auth.current();
  const path = location.hash.replace(/^#/, '') || '/';
  const alertCount = DB.alerts().length;

  const nav = navItems().map(it => {
    if (it.sec) return `<div class="nav-section">${it.sec}</div>`;
    if (it.spacerAlert !== undefined) return '';
    if (it.perm && !Auth.can(it.perm)) return '';
    const active = ('#'+path) === it.href || (it.href !== '#/' && ('#'+path).startsWith(it.href)) ? 'active' : '';
    const pill = (it.href === '#/' && alertCount) ? `<span class="pill">${alertCount}</span>` : '';
    return `<a href="${it.href}" class="${active}"><span class="ico">${it.ico}</span>${it.label}${pill}</a>`;
  }).join('');

  const titleMap = { '/':'لوحة التحكم', '/departments':'الأقسام والأجهزة', '/scan':'مسح رمز QR',
                     '/qrcodes':'رموز QR', '/reports':'التقارير', '/users':'المستخدمون', '/settings':'الإعدادات' };
  let pageTitle = titleMap[path] || '';
  if (path.startsWith('/dept/')) pageTitle = 'تفاصيل القسم';
  else if (path.startsWith('/device/') && path.endsWith('/edit')) pageTitle = 'تعديل جهاز';
  else if (path.startsWith('/device/')) pageTitle = 'تفاصيل الجهاز';
  else if (path === '/add-device') pageTitle = 'إضافة جهاز';

  $('#app').innerHTML = `
    <div class="app">
      <div class="sidebar-backdrop" id="sb-back"></div>
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <span class="logo">🔬</span>
          <div><h1>منصة المعايرة</h1><p>إدارة أجهزة المختبر</p></div>
        </div>
        <nav class="nav">${nav}</nav>
        <div class="userbox">
          <div class="avatar">${esc((u.name||'?').slice(0,1))}</div>
          <div class="meta"><b>${esc(u.name)}</b><span>${esc(Auth.roleLabel(u.role))}</span></div>
          <button id="logout" title="تسجيل الخروج">⏻</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-toggle" id="menu-t">☰</button>
          <h2>${esc(pageTitle)}</h2>
          <div class="search">
            <span class="si">🔍</span>
            <input id="gsearch" placeholder="ابحث باسم الجهاز، الكود، الرقم التسلسلي، الشهادة...">
            <div class="search-results" id="sresults"></div>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`;

  $('#logout').onclick = () => { Auth.logout(); go('/login'); };
  $('#menu-t').onclick = () => { $('#sidebar').classList.toggle('open'); $('#sb-back').classList.toggle('open'); };
  $('#sb-back').onclick = () => { $('#sidebar').classList.remove('open'); $('#sb-back').classList.remove('open'); };
  setupSearch();

  const out = viewFn();
  if (typeof out === 'string') $('#content').innerHTML = out;
  // (view functions that need post-render JS handle it themselves)
}

/* ---------- global search ---------- */
function setupSearch(){
  const inp = $('#gsearch'), box = $('#sresults');
  if (!inp) return;
  inp.oninput = () => {
    const q = inp.value.trim().toLowerCase();
    if (q.length < 2){ box.style.display='none'; return; }
    const res = DB.devices().filter(d =>
      [d.name,d.newCode,d.oldCode,d.serial,d.certNumber,d.manufacturer,d.model]
        .some(v => String(v||'').toLowerCase().includes(q))).slice(0,8);
    box.innerHTML = res.length ? res.map(d => {
      const st = DB.status(d);
      return `<a href="#/device/${d.id}" onclick="$('#sresults').style.display='none'">
        <div><div style="font-weight:700">${esc(d.name)}</div>
        <div class="muted" style="font-size:12px">${esc(d.newCode||d.oldCode)} • ${esc(d.serial||'—')}</div></div>
        ${statusBadge(st)}</a>`;
    }).join('') : `<div style="padding:14px" class="muted">لا توجد نتائج</div>`;
    box.style.display='block';
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('.search')) box.style.display='none';
  });
}

/* ============================================================
   LOGIN
   ============================================================ */
function viewLogin(){
  $('#app').innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="lc-logo">🔬</div>
        <h1>منصة إدارة أجهزة المختبر</h1>
        <p class="sub">نظام متابعة المعايرة والصيانة</p>
        <form id="login-form">
          <div class="field"><label>اسم المستخدم</label><input id="lu" autocomplete="username" required></div>
          <div class="field"><label>كلمة المرور</label><input id="lp" type="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary" type="submit">تسجيل الدخول</button>
        </form>
        <div class="login-hint">
          <b>حسابات تجريبية:</b><br>
          مدير: <code>admin</code> / <code>admin123</code><br>
          فني: <code>tech</code> / <code>tech123</code><br>
          مشاهد: <code>viewer</code> / <code>view123</code>
        </div>
      </div>
    </div>`;
  $('#login-form').onsubmit = (e) => {
    e.preventDefault();
    const s = Auth.login($('#lu').value.trim(), $('#lp').value);
    if (s){ toast('مرحباً '+s.name, 'ok'); go('/'); }
    else toast('بيانات الدخول غير صحيحة', 'err');
  };
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function viewDashboard(){
  const s = DB.stats();
  const alerts = DB.alerts();
  const depts = DB.departments();

  setTimeout(() => { drawStatusChart(s); drawDeptChart(); drawConditionChart(s); drawCategoryChart(s); drawDueChart(); }, 0);

  const alertsHtml = alerts.length ? alerts.slice(0,8).map(({d,st,days}) => `
    <a href="#/device/${d.id}" class="alert-item ${st}">
      <div style="flex:1">
        <div class="ai-name">${esc(d.name)} <span class="muted" style="font-weight:500">— ${esc(d.newCode||d.oldCode)}</span></div>
        <div class="ai-meta">${esc(DB.department(d.departmentId)?.nameAr||'')} • ${esc(d.test||'')}</div>
      </div>
      <div class="ai-date">${st==='expired' ? `انتهت قبل ${Math.abs(days)} يوم` : `بعد ${days} يوم`}<br><span class="muted">${esc(d.dueDate)}</span></div>
    </a>`).join('')
    : `<div class="empty"><div class="e-ico">✅</div>لا توجد تنبيهات — جميع المعايرات سارية</div>`;

  return `
    <div class="page-head">
      <div><h1>لوحة التحكم</h1><p>نظرة عامة على حالة الأجهزة والمعايرة في ${esc(DB.settings.labName||'المختبر')}</p></div>
      <div style="display:flex;gap:10px">
        ${Auth.can('device.create') ? `<a href="#/add-device" class="btn btn-primary">＋ إضافة جهاز</a>` : ''}
        <a href="#/reports" class="btn btn-ghost">📈 التقارير</a>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat blue"><div class="icon">🔬</div><div class="label">إجمالي الأجهزة</div><div class="num">${s.total}</div><div class="sub">${s.main} رئيسي • ${s.supporting} مساند</div></div>
      <div class="stat green"><div class="icon">✅</div><div class="label">معايرة سارية</div><div class="num">${s.valid}</div><div class="sub">${pct(s.valid,s.total)}% من الأجهزة</div></div>
      <div class="stat amber"><div class="icon">⏳</div><div class="label">تنتهي قريباً</div><div class="num">${s.soon}</div><div class="sub">خلال ${DB.settings.soonDays} يوم</div></div>
      <div class="stat red"><div class="icon">⛔</div><div class="label">منتهية الصلاحية</div><div class="num">${s.expired}</div><div class="sub">تحتاج معايرة فورية</div></div>
    </div>

    <h2 class="section-title">${ICONS.dept} الأقسام <span class="count">${depts.length}</span></h2>
    <div class="dept-grid">${depts.map(deptCard).join('')}</div>

    <div class="card" style="margin-top:26px">
      <div class="card-head"><h3>🔔 تنبيهات المعايرة ${alerts.length?`<span class="muted">(${alerts.length})</span>`:''}</h3>
        ${alerts.length>8?`<a href="#/reports" class="btn btn-ghost btn-sm">عرض الكل</a>`:''}</div>
      <div class="card-body">${alertsHtml}</div>
    </div>

    <h2 class="section-title">📊 الرسوم البيانية</h2>
    <div class="charts-3">
      <div class="card">
        <div class="card-head"><h3>🧮 حالة المعايرة</h3></div>
        <div class="card-body"><div class="chart-box"><canvas id="statusChart"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>🛠️ حالة التشغيل</h3></div>
        <div class="card-body"><div class="chart-box"><canvas id="conditionChart"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>🏷️ تصنيف الأجهزة</h3></div>
        <div class="card-body"><div class="chart-box"><canvas id="categoryChart"></canvas></div></div>
      </div>
    </div>
    <div class="charts-2" style="margin-top:18px">
      <div class="card">
        <div class="card-head"><h3>📈 المعايرة حسب القسم</h3></div>
        <div class="card-body"><div class="chart-box md"><canvas id="deptChart"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>📅 مواعيد المعايرة القادمة</h3></div>
        <div class="card-body"><div class="chart-box md"><canvas id="dueChart"></canvas></div></div>
      </div>
    </div>
  `;
}
function pct(a,b){ return b ? Math.round(a/b*100) : 0; }

// لوحة ألوان موحّدة من الأزرق إلى الأخضر تُطبّق على كل الأقسام بالترتيب
const DEPT_PALETTE = ['#2563eb','#0891b2','#0d9488','#0e9f6e','#16a34a'];
function deptColor(dept){
  const i = DB.departments().findIndex(d => d.id === dept.id);
  return DEPT_PALETTE[(i < 0 ? 0 : i) % DEPT_PALETTE.length];
}
function deptInitial(dept){ return esc((dept.nameAr || '؟').trim().charAt(0)); }

function deptCard(dept){
  const list = DB.devicesByDept(dept.id);
  const st = DB.stats(list);
  const color = deptColor(dept);
  const total = list.length || 1;
  const segs = [
    { v:st.valid, c:'#16a34a' }, { v:st.soon, c:'#f59e0b' },
    { v:st.expired, c:'#ef4444' }, { v:st.unknown, c:'#cbd5e1' }
  ].filter(x => x.v > 0).map(x => `<span style="width:${(x.v/total*100).toFixed(1)}%;background:${x.c}"></span>`).join('');
  const validPct = list.length ? Math.round(st.valid/list.length*100) : 0;
  return `<a href="#/dept/${dept.id}" class="dept-card" style="--dc:${color}">
    <div class="dc-top">
      <div class="dc-icon" style="background:${color}1a;color:${color}">${deptInitial(dept)}</div>
      <div class="dc-titles"><h3>${esc(dept.nameAr)}</h3><div class="en">${esc(dept.nameEn)}</div></div>
      <span class="dc-arrow">‹</span>
    </div>
    <div class="dc-meter" title="${validPct}% سارية">${segs || '<span style="width:100%;background:#e2e8f0"></span>'}</div>
    <div class="dc-stats">
      <div class="dc-stat"><b>${list.length}</b><span>إجمالي</span></div>
      <div class="dc-stat"><b style="color:var(--green)">${st.valid}</b><span>سارية</span></div>
      <div class="dc-stat"><b style="color:var(--amber)">${st.soon}</b><span>قريبة</span></div>
      <div class="dc-stat"><b style="color:var(--red)">${st.expired}</b><span>منتهية</span></div>
    </div>
  </a>`;
}

let _charts = {};
// إعدادات احترافية موحّدة لكل الرسوم
function chartDefaults(){
  if (!window.Chart || chartDefaults._done) return; chartDefaults._done = true;
  Chart.defaults.font.family = '"Segoe UI",Tahoma,sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#64748b';
  Chart.defaults.maintainAspectRatio = false;
  const lg = Chart.defaults.plugins.legend.labels;
  lg.usePointStyle = true; lg.pointStyle = 'circle'; lg.boxWidth = 8; lg.boxHeight = 8; lg.padding = 14;
  const tt = Chart.defaults.plugins.tooltip;
  tt.backgroundColor = '#0f172a'; tt.padding = 10; tt.cornerRadius = 8; tt.boxPadding = 6;
  tt.titleFont = { family:'"Segoe UI",Tahoma', weight:'600' };
}
const pctTooltip = { callbacks: { label: (ctx) => {
  const total = ctx.dataset.data.reduce((a,b)=>a+(b||0),0);
  const v = ctx.parsed; const p = total ? Math.round(v/total*100) : 0;
  return `  ${ctx.label}: ${v} (${p}%)`;
}}};

function drawStatusChart(s){
  const c = $('#statusChart'); if (!c || !window.Chart) return; chartDefaults();
  _charts.status?.destroy();
  _charts.status = new Chart(c, {
    type:'doughnut',
    data:{ labels:['سارية','تنتهي قريباً','منتهية','غير محددة'],
      datasets:[{ data:[s.valid,s.soon,s.expired,s.unknown],
        backgroundColor:['#16a34a','#f59e0b','#ef4444','#cbd5e1'], borderWidth:0, hoverOffset:6 }] },
    options:{ cutout:'70%', plugins:{ legend:{ position:'bottom' }, tooltip:pctTooltip } }
  });
}
function drawDeptChart(){
  const c = $('#deptChart'); if (!c || !window.Chart) return; chartDefaults();
  const depts = DB.departments();
  _charts.dept?.destroy();
  _charts.dept = new Chart(c, {
    type:'bar',
    data:{ labels:depts.map(d=>d.nameAr),
      datasets:[
        { label:'سارية', data:depts.map(d=>DB.stats(DB.devicesByDept(d.id)).valid), backgroundColor:'#16a34a', borderRadius:4, maxBarThickness:30 },
        { label:'قريبة', data:depts.map(d=>DB.stats(DB.devicesByDept(d.id)).soon),  backgroundColor:'#f59e0b', borderRadius:4, maxBarThickness:30 },
        { label:'منتهية',data:depts.map(d=>DB.stats(DB.devicesByDept(d.id)).expired),backgroundColor:'#ef4444', borderRadius:4, maxBarThickness:30 },
      ]},
    options:{ scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, beginAtZero:true, ticks:{ precision:0 }, grid:{ color:'#f1f5f9' }, border:{ display:false } } },
      plugins:{ legend:{ position:'bottom' } } }
  });
}
function drawConditionChart(s){
  const c = $('#conditionChart'); if (!c || !window.Chart) return; chartDefaults();
  _charts.cond?.destroy();
  _charts.cond = new Chart(c, {
    type:'doughnut',
    data:{ labels:['تعمل','تحت الصيانة','خارج الخدمة'],
      datasets:[{ data:[s.operational,s.maintenance,s.out_of_service],
        backgroundColor:['#16a34a','#f59e0b','#ef4444'], borderWidth:0, hoverOffset:6 }] },
    options:{ cutout:'70%', plugins:{ legend:{ position:'bottom' }, tooltip:pctTooltip } }
  });
}
function drawCategoryChart(s){
  const c = $('#categoryChart'); if (!c || !window.Chart) return; chartDefaults();
  _charts.cat?.destroy();
  _charts.cat = new Chart(c, {
    type:'doughnut',
    data:{ labels:['رئيسي','مساند'],
      datasets:[{ data:[s.main,s.supporting], backgroundColor:['#2563eb','#8b5cf6'], borderWidth:0, hoverOffset:6 }] },
    options:{ cutout:'70%', plugins:{ legend:{ position:'bottom' }, tooltip:pctTooltip } }
  });
}
function drawDueChart(){
  const c = $('#dueChart'); if (!c || !window.Chart) return; chartDefaults();
  const buckets = {};
  DB.devices().forEach(d => {
    const dt = DB.parseDate(d.dueDate); if (!dt) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    buckets[key] = (buckets[key] || 0) + 1;
  });
  const keys = Object.keys(buckets).sort();
  const labels = keys.map(k => { const [y,m] = k.split('-'); return `${m}/${y}`; });
  const now = new Date(); now.setHours(0,0,0,0);
  const colors = keys.map(k => { const [y,m] = k.split('-'); return (new Date(+y, +m-1, 28) < now) ? '#ef4444' : '#2563eb'; });
  _charts.due?.destroy();
  _charts.due = new Chart(c, {
    type:'bar',
    data:{ labels, datasets:[{ label:'عدد الأجهزة', data:keys.map(k=>buckets[k]), backgroundColor:colors, borderRadius:5, maxBarThickness:34 }] },
    options:{ scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, ticks:{ precision:0 }, grid:{ color:'#f1f5f9' }, border:{ display:false } } },
      plugins:{ legend:{ display:false } } }
  });
}

/* ============================================================
   DEPARTMENTS LIST
   ============================================================ */
function viewDepartments(){
  const depts = DB.departments();
  const canManage = Auth.can('dept.manage');
  setTimeout(()=> { if(canManage) $('#add-dept').onclick = () => deptModal(); }, 0);
  return `
    <div class="page-head">
      <div><h1>الأقسام والأجهزة</h1><p>كل قسم يحتوي على أجهزة رئيسية وأجهزة مساندة</p></div>
      <div style="display:flex;gap:10px">
        ${canManage?`<button class="btn btn-ghost" id="add-dept">＋ قسم جديد</button>`:''}
        ${Auth.can('device.create')?`<a href="#/add-device" class="btn btn-primary">＋ إضافة جهاز</a>`:''}
      </div>
    </div>
    <div class="dept-grid">${depts.map(deptCard).join('')}</div>`;
}

function deptModal(dept){
  const edit = !!dept;
  modal({
    title: edit ? 'تعديل قسم' : 'إضافة قسم جديد',
    body: `<div class="form-grid">
      <div class="field full req"><label>الاسم بالعربية</label><input id="d-ar" value="${esc(dept?.nameAr||'')}"></div>
      <div class="field full"><label>الاسم بالإنجليزية</label><input id="d-en" value="${esc(dept?.nameEn||'')}"></div>
    </div>`,
    footer: `<button class="btn btn-primary" id="d-save">حفظ</button>
             ${edit?`<button class="btn btn-danger" id="d-del">حذف القسم</button>`:''}
             <button class="btn btn-ghost" id="d-cancel">إلغاء</button>`,
    onOpen: (close) => {
      $('#d-cancel').onclick = close;
      $('#d-save').onclick = () => {
        const nameAr = $('#d-ar').value.trim(); if (!nameAr) return toast('أدخل اسم القسم','err');
        const data = { nameAr, nameEn:$('#d-en').value.trim() };
        if (edit) DB.updateDepartment(dept.id, data); else DB.addDepartment(data);
        close(); toast('تم الحفظ','ok'); router();
      };
      if (edit) $('#d-del').onclick = () => {
        if (confirm('حذف القسم سيحذف جميع أجهزته. متابعة؟')){ DB.deleteDepartment(dept.id); close(); toast('تم حذف القسم','ok'); go('/departments'); }
      };
    }
  });
}

/* ============================================================
   DEPARTMENT DETAIL  (main + supporting sections)
   ============================================================ */
function viewDepartment(deptId){
  const dept = DB.department(deptId);
  if (!dept) return `<div class="empty">القسم غير موجود</div>`;
  const list = DB.devicesByDept(dept.id);
  const st = DB.stats(list);
  const main = list.filter(d => d.category === 'main');
  const support = list.filter(d => d.category !== 'main');

  setTimeout(()=> {
    if (Auth.can('dept.manage')) $('#edit-dept').onclick = () => deptModal(dept);
  },0);

  const section = (title, icon, items) => `
    <h2 class="section-title">${icon} ${title} <span class="count">${items.length}</span></h2>
    ${items.length ? `<div class="card"><div class="table-wrap">${deviceTable(items)}</div></div>`
      : `<div class="card"><div class="empty"><div class="e-ico">📭</div>لا توجد أجهزة في هذا القسم</div></div>`}`;

  return `
    <a href="#/departments" class="back-link">→ كل الأقسام</a>
    <div class="page-head">
      <div style="display:flex;gap:16px;align-items:center">
        <div class="dc-icon" style="width:54px;height:54px;font-size:24px;font-weight:800;background:${deptColor(dept)}1a;color:${deptColor(dept)}">${deptInitial(dept)}</div>
        <div><h1>${esc(dept.nameAr)}</h1><p>${esc(dept.nameEn)}</p></div>
      </div>
      <div style="display:flex;gap:10px">
        ${Auth.can('dept.manage')?`<button class="btn btn-ghost" id="edit-dept">✏️ تعديل القسم</button>`:''}
        ${Auth.can('device.create')?`<a href="#/add-device?${qs({dept:dept.id})}" class="btn btn-primary">＋ إضافة جهاز</a>`:''}
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat blue"><div class="icon">🔬</div><div class="label">إجمالي الأجهزة</div><div class="num">${list.length}</div></div>
      <div class="stat green"><div class="icon">✅</div><div class="label">سارية</div><div class="num">${st.valid}</div></div>
      <div class="stat amber"><div class="icon">⏳</div><div class="label">تنتهي قريباً</div><div class="num">${st.soon}</div></div>
      <div class="stat red"><div class="icon">⛔</div><div class="label">منتهية</div><div class="num">${st.expired}</div></div>
    </div>
    ${section('الأجهزة الرئيسية','⭐', main)}
    ${section('الأجهزة المساندة','🔧', support)}`;
}

function deviceTable(items){
  return `<table class="tbl">
    <thead><tr>
      <th>الكود</th><th>اسم الجهاز</th><th>الرقم التسلسلي</th><th>الفحص</th>
      <th>تاريخ الانتهاء</th><th>الحالة</th><th>التشغيل</th><th></th>
    </tr></thead><tbody>
    ${items.map(d => {
      const st = DB.status(d);
      return `<tr>
        <td class="code">${esc(d.newCode||d.oldCode||'—')}</td>
        <td><b>${esc(d.name)}</b><br><span class="muted" style="font-size:12px">${esc(d.manufacturer||'')}</span></td>
        <td>${esc(d.serial||'—')}</td>
        <td>${esc(d.test||'—')}</td>
        <td>${esc(d.dueDate||'—')}</td>
        <td>${statusBadge(st)}</td>
        <td>${condBadge(d.condition)}</td>
        <td><a href="#/device/${d.id}" class="btn btn-ghost btn-sm">عرض ←</a></td>
      </tr>`;
    }).join('')}
    </tbody></table>`;
}

/* ============================================================
   DEVICE DETAIL
   ============================================================ */
function viewDevice(id){
  const d = DB.device(id);
  if (!d) { $('#content').innerHTML = `<div class="empty">الجهاز غير موجود</div>`; return; }
  const dept = DB.department(d.departmentId);
  const st = DB.status(d);
  const days = DB.daysUntil(d.dueDate);

  const rows = [
    ['القسم', dept ? esc(dept.nameAr) : '—'],
    ['الوحدة', esc(d.unit||'—')],
    ['التصنيف', catBadge(d.category)],
    ['الكود الجديد', `<span class="code">${esc(d.newCode||'—')}</span>`],
    ['الكود القديم', esc(d.oldCode||'—')],
    ['الشركة المصنّعة', esc(d.manufacturer||'—')],
    ['الموديل / النوع', esc(d.model||'—')],
    ['الرقم التسلسلي', esc(d.serial||'—')],
    ['الفحص المُجرى', esc(d.test||'—')],
    ['رقم الشهادة', esc(d.certNumber||'—')],
    ['جهة المعايرة', esc(d.calCompany||'—')],
    ['تاريخ المعايرة', esc(d.calDate||'—')],
    ['تاريخ الانتهاء', `<b>${esc(d.dueDate||'—')}</b>`],
    ['ملاحظات', esc(d.remarks||'—')],
  ];

  setTimeout(()=> {
    renderQR(d);
    $('#cert-view') && ($('#cert-view').onclick = () => viewCertificate(d));
    $('#cert-up')   && ($('#cert-up').onclick   = () => uploadCertModal(d));
    $('#cond-btn')  && ($('#cond-btn').onclick  = () => conditionModal(d));
    $('#recal-btn') && ($('#recal-btn').onclick = () => recalibrateModal(d));
    $('#del-btn')   && ($('#del-btn').onclick   = () => {
      if (confirm('حذف هذا الجهاز نهائياً؟')){ DB.deleteCertificate(d.id); DB.deleteDevice(d.id); toast('تم الحذف','ok'); go(`/dept/${d.departmentId}`); }
    });
  }, 0);

  const dueMsg = st==='expired' ? `<div class="alert-item expired" style="margin-bottom:18px">⛔ <b>المعايرة منتهية منذ ${Math.abs(days)} يوم</b> — يجب جدولة معايرة فورية</div>`
    : st==='soon' ? `<div class="alert-item soon" style="margin-bottom:18px">⏳ <b>المعايرة تنتهي خلال ${days} يوم</b> (${esc(d.dueDate)})</div>` : '';

  $('#content').innerHTML = `
    <a href="#/dept/${d.departmentId}" class="back-link">→ ${esc(dept?.nameAr||'القسم')}</a>
    <div class="page-head">
      <div><h1>${esc(d.name)}</h1><p>${esc(d.newCode||d.oldCode||'')} • ${esc(d.test||'')}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${statusBadge(st)} ${condBadge(d.condition)} ${catBadge(d.category)}
      </div>
    </div>
    ${dueMsg}
    <div class="detail-grid">
      <div>
        <div class="card">
          <div class="card-head"><h3>معلومات الجهاز</h3>
            <div style="display:flex;gap:8px">
              ${Auth.can('device.edit')?`<a href="#/device/${d.id}/edit" class="btn btn-ghost btn-sm">✏️ تعديل</a>`:''}
              ${Auth.can('device.delete')?`<button class="btn btn-danger btn-sm" id="del-btn">🗑️ حذف</button>`:''}
            </div>
          </div>
          <div class="card-body">${rows.map(([k,v])=>`<div class="info-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-head"><h3>📄 شهادة المعايرة</h3>
            ${Auth.can('cert.upload')?`<button class="btn btn-ghost btn-sm" id="cert-up">⬆️ رفع / تحديث</button>`:''}
          </div>
          <div class="card-body" id="cert-area">
            ${d.certificateId
              ? `<div style="display:flex;align-items:center;gap:14px;justify-content:space-between;flex-wrap:wrap">
                  <div style="display:flex;align-items:center;gap:12px"><span style="font-size:34px">📄</span>
                    <div><b>${esc(d.certFile||'شهادة معايرة')}</b><div class="muted" style="font-size:12px">رقم: ${esc(d.certNumber||'—')}</div></div></div>
                  <button class="btn btn-primary btn-sm" id="cert-view">👁️ عرض الشهادة</button>
                </div>`
              : `<div class="empty" style="padding:24px"><div class="e-ico">📭</div>لم يتم رفع شهادة بعد</div>`}
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-head"><h3>🕓 سجل الجهاز</h3></div>
          <div class="card-body"><div class="timeline">
            ${(d.history||[]).map(h=>`<div class="tl-item"><div class="tl-date">${esc(h.date)} • ${esc(h.user||'—')}</div><div class="tl-text">${esc(h.text)}</div></div>`).join('') || '<span class="muted">لا يوجد سجل</span>'}
          </div></div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-head"><h3>رمز QR</h3></div>
          <div class="card-body qr-box">
            <canvas id="qr"></canvas>
            <p class="muted" style="font-size:12px;margin-top:10px">امسح الرمز للوصول السريع لبيانات الجهاز</p>
            <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="downloadQR('${d.id}','${esc(d.newCode||d.oldCode||d.id)}')">⬇️ تحميل الرمز</button>
          </div>
        </div>
        <div class="card" style="margin-top:20px">
          <div class="card-head"><h3>إجراءات سريعة</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
            ${Auth.can('device.status')?`<button class="btn btn-ghost" id="recal-btn">🔄 تسجيل معايرة جديدة</button>`:''}
            ${Auth.can('device.status')?`<button class="btn btn-ghost" id="cond-btn">🛠️ تحديث حالة التشغيل</button>`:''}
            <a href="#/scan" class="btn btn-ghost">📷 مسح جهاز آخر</a>
          </div>
        </div>
      </div>
    </div>`;
}

/* ---------- QR ---------- */
function deviceURL(id){
  // إن ضُبط "رابط الاستضافة" في الإعدادات، تُبنى رموز QR عليه ليفتحها الجوال.
  const base = (DB.settings.baseUrl || '').trim();
  if (base) return base.replace(/[#?].*$/, '').replace(/\/+$/, '') + '/#/device/' + id;
  // وإلا استخدم الموقع الحالي (يعمل عند الاستضافة على الويب؛ ومحلياً يعمل داخل نفس الجهاز فقط)
  return location.origin + location.pathname + '#/device/' + id;
}
function renderQR(d){
  const c = $('#qr'); if (!c || !window.QRCode) return;
  QRCode.toCanvas(c, deviceURL(d.id), { width:200, margin:1, color:{ dark:'#0f172a', light:'#ffffff' } }, ()=>{});
}
function downloadQR(id, label){
  const tmp = document.createElement('canvas');
  QRCode.toCanvas(tmp, deviceURL(id), { width:600, margin:2 }, () => {
    const a = document.createElement('a');
    a.href = tmp.toDataURL('image/png'); a.download = `QR-${label}.png`; a.click();
  });
}

/* ---------- certificate upload / view ---------- */
function uploadCertModal(d){
  modal({
    title:'رفع شهادة المعايرة',
    body:`<div class="field full"><label>اختر ملف (PDF أو صورة)</label>
      <input type="file" id="cert-file" accept="application/pdf,image/*"></div>
      <div class="field full"><label>رقم الشهادة (اختياري)</label><input id="cert-num" value="${esc(d.certNumber||'')}"></div>
      <p class="muted" style="font-size:12px">يُحفظ الملف محلياً في المتصفح (IndexedDB).</p>`,
    footer:`<button class="btn btn-primary" id="cert-save">رفع وحفظ</button><button class="btn btn-ghost" id="cert-cancel">إلغاء</button>`,
    onOpen:(close)=>{
      $('#cert-cancel').onclick = close;
      $('#cert-save').onclick = async () => {
        const f = $('#cert-file').files[0];
        if (!f) return toast('اختر ملفاً','err');
        if (f.size > 15*1024*1024) return toast('الحجم يتجاوز 15MB','err');
        await DB.saveCertificate(d.id, f, f.name, f.type);
        DB.updateDevice(d.id, { certificateId:d.id, certFile:f.name, certNumber:$('#cert-num').value.trim()||d.certNumber },
          Auth.current().name, `تم رفع شهادة معايرة: ${f.name}`);
        close(); toast('تم رفع الشهادة','ok'); viewDevice(d.id);
      };
    }
  });
}
async function viewCertificate(d){
  const rec = await DB.getCertificate(d.id);
  if (!rec){ toast('الملف غير متوفر','err'); return; }
  const url = URL.createObjectURL(rec.blob);
  const isPdf = (rec.type||'').includes('pdf') || /\.pdf$/i.test(rec.filename||'');
  modal({
    title:`شهادة: ${esc(rec.filename||'')}`,
    body: isPdf
      ? `<iframe src="${url}" style="width:100%;height:65vh;border:none;border-radius:10px"></iframe>`
      : `<img src="${url}" style="width:100%;border-radius:10px">`,
    footer:`<a class="btn btn-primary" href="${url}" download="${esc(rec.filename||'certificate')}">⬇️ تحميل</a>
            ${Auth.can('cert.delete')?`<button class="btn btn-danger" id="cert-del">🗑️ حذف الشهادة</button>`:''}
            <button class="btn btn-ghost" id="cert-close">إغلاق</button>`,
    onOpen:(close)=>{
      $('#cert-close').onclick = () => { URL.revokeObjectURL(url); close(); };
      if ($('#cert-del')) $('#cert-del').onclick = async () => {
        if (!confirm('حذف الشهادة؟')) return;
        await DB.deleteCertificate(d.id);
        DB.updateDevice(d.id, { certificateId:'', certFile:'' }, Auth.current().name, 'تم حذف شهادة المعايرة');
        close(); toast('تم الحذف','ok'); viewDevice(d.id);
      };
    }
  });
}

/* ---------- condition update ---------- */
function conditionModal(d){
  modal({
    title:'تحديث حالة التشغيل',
    body:`<div class="field full"><label>الحالة</label>
      <select id="cond-sel">
        ${Object.entries(DB.COND_LABEL).map(([k,v])=>`<option value="${k}" ${d.condition===k?'selected':''}>${v}</option>`).join('')}
      </select></div>
      <div class="field full"><label>ملاحظة (اختياري)</label><input id="cond-note" placeholder="سبب التغيير..."></div>`,
    footer:`<button class="btn btn-primary" id="cond-save">حفظ</button><button class="btn btn-ghost" id="cond-cancel">إلغاء</button>`,
    onOpen:(close)=>{
      $('#cond-cancel').onclick = close;
      $('#cond-save').onclick = () => {
        const c = $('#cond-sel').value, note = $('#cond-note').value.trim();
        DB.updateDevice(d.id, { condition:c }, Auth.current().name, `تغيّرت حالة التشغيل إلى: ${DB.COND_LABEL[c]}${note?' — '+note:''}`);
        close(); toast('تم التحديث','ok'); viewDevice(d.id);
      };
    }
  });
}

/* ---------- recalibration ---------- */
function recalibrateModal(d){
  modal({
    title:'تسجيل معايرة جديدة',
    body:`<div class="form-grid">
      <div class="field req"><label>تاريخ المعايرة</label><input id="rc-date" placeholder="dd/mm/yyyy" value="${esc(DB.today())}"></div>
      <div class="field req"><label>تاريخ الانتهاء</label><input id="rc-due" placeholder="dd/mm/yyyy"></div>
      <div class="field"><label>رقم الشهادة</label><input id="rc-cert"></div>
      <div class="field"><label>جهة المعايرة</label><input id="rc-company" value="${esc(d.calCompany||'')}"></div>
    </div>`,
    footer:`<button class="btn btn-primary" id="rc-save">حفظ المعايرة</button><button class="btn btn-ghost" id="rc-cancel">إلغاء</button>`,
    onOpen:(close)=>{
      $('#rc-cancel').onclick = close;
      $('#rc-save').onclick = () => {
        const due = $('#rc-due').value.trim(); if (!due) return toast('أدخل تاريخ الانتهاء','err');
        DB.updateDevice(d.id, {
          calDate:$('#rc-date').value.trim(), dueDate:due,
          certNumber:$('#rc-cert').value.trim()||d.certNumber, calCompany:$('#rc-company').value.trim()||d.calCompany
        }, Auth.current().name, `تم تسجيل معايرة جديدة — تنتهي ${due}`);
        close(); toast('تم تسجيل المعايرة','ok'); viewDevice(d.id);
      };
    }
  });
}

/* ============================================================
   DEVICE FORM (add / edit)
   ============================================================ */
function viewDeviceForm(id){
  const editing = !!id;
  const d = editing ? DB.device(id) : {};
  if (editing && !d) return `<div class="empty">الجهاز غير موجود</div>`;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const presetDept = params.get('dept');
  const depts = DB.departments();

  const opt = (val, cur) => `<option value="${esc(val)}" ${cur===val?'selected':''}>`;

  setTimeout(()=> {
    $('#dev-form').onsubmit = (e) => {
      e.preventDefault();
      const data = {
        departmentId:$('#f-dept').value, category:$('#f-cat').value, unit:$('#f-unit').value.trim(),
        name:$('#f-name').value.trim(), newCode:$('#f-newcode').value.trim(), oldCode:$('#f-oldcode').value.trim(),
        manufacturer:$('#f-manuf').value.trim(), model:$('#f-model').value.trim(), serial:$('#f-serial').value.trim(),
        test:$('#f-test').value.trim(), certNumber:$('#f-cert').value.trim(), calCompany:$('#f-company').value.trim(),
        calDate:$('#f-caldate').value.trim(), dueDate:$('#f-due').value.trim(),
        condition:$('#f-cond').value, remarks:$('#f-remarks').value.trim(),
      };
      if (!data.name) return toast('أدخل اسم الجهاز','err');
      if (!data.departmentId) return toast('اختر القسم','err');
      if (editing){ DB.updateDevice(id, data, Auth.current().name, 'تم تعديل بيانات الجهاز'); toast('تم الحفظ','ok'); go(`/device/${id}`); }
      else { const nd = DB.addDevice(data, Auth.current().name); toast('تمت الإضافة','ok'); go(`/device/${nd.id}`); }
    };
  },0);

  const f = (k) => esc(d[k]||'');
  return `
    <a href="#/${editing?'device/'+id:'departments'}" class="back-link">→ رجوع</a>
    <div class="page-head"><div><h1>${editing?'تعديل جهاز':'إضافة جهاز جديد'}</h1>
      <p>${editing?esc(d.name):'أدخل بيانات الجهاز وموعد المعايرة'}</p></div></div>
    <div class="card"><div class="card-body">
      <form id="dev-form">
        <div class="form-grid">
          <div class="field req"><label>اسم الجهاز</label><input id="f-name" value="${f('name')}"></div>
          <div class="field req"><label>القسم</label><select id="f-dept">
            ${depts.map(x=>`${opt(x.id, d.departmentId||presetDept)}${esc(x.icon)} ${esc(x.nameAr)}</option>`).join('')}
          </select></div>
          <div class="field"><label>التصنيف</label><select id="f-cat">
            ${opt('main', d.category)}⭐ جهاز رئيسي</option>
            ${opt('supporting', d.category||'supporting')}🔧 جهاز مساند</option>
          </select></div>
          <div class="field"><label>الوحدة</label><input id="f-unit" value="${f('unit')}"></div>
          <div class="field"><label>الكود الجديد</label><input id="f-newcode" value="${f('newCode')}" placeholder="FCL-..."></div>
          <div class="field"><label>الكود القديم</label><input id="f-oldcode" value="${f('oldCode')}" placeholder="FR-CH-..."></div>
          <div class="field"><label>الشركة المصنّعة</label><input id="f-manuf" value="${f('manufacturer')}"></div>
          <div class="field"><label>الموديل / النوع</label><input id="f-model" value="${f('model')}"></div>
          <div class="field"><label>الرقم التسلسلي</label><input id="f-serial" value="${f('serial')}"></div>
          <div class="field"><label>الفحص المُجرى</label><input id="f-test" value="${f('test')}" placeholder="Temperature, Mass..."></div>
          <div class="field"><label>رقم الشهادة</label><input id="f-cert" value="${f('certNumber')}"></div>
          <div class="field"><label>جهة المعايرة</label><input id="f-company" value="${f('calCompany')}"></div>
          <div class="field"><label>تاريخ المعايرة</label><input id="f-caldate" value="${f('calDate')}" placeholder="dd/mm/yyyy"></div>
          <div class="field"><label>تاريخ الانتهاء</label><input id="f-due" value="${f('dueDate')}" placeholder="dd/mm/yyyy"></div>
          <div class="field"><label>حالة التشغيل</label><select id="f-cond">
            ${Object.entries(DB.COND_LABEL).map(([k,v])=>`${opt(k, d.condition||'operational')}${v}</option>`).join('')}
          </select></div>
          <div class="field full"><label>ملاحظات</label><textarea id="f-remarks" rows="2">${f('remarks')}</textarea></div>
        </div>
        <div style="margin-top:20px;display:flex;gap:10px">
          <button class="btn btn-primary" type="submit">${editing?'حفظ التعديلات':'إضافة الجهاز'}</button>
          <a href="#/${editing?'device/'+id:'departments'}" class="btn btn-ghost">إلغاء</a>
        </div>
      </form>
    </div></div>`;
}

/* ============================================================
   SCAN QR
   ============================================================ */
let _scanner = null;
function viewScan(){
  setTimeout(startScanner, 50);
  return `
    <div class="page-head"><div><h1>مسح رمز QR</h1><p>وجّه الكاميرا نحو رمز الجهاز للوصول السريع وتحديث حالته</p></div></div>
    <div class="card scanner-box"><div class="card-body">
      <div id="qr-reader"></div>
      <div id="scan-msg" class="muted" style="text-align:center;margin-top:14px">جارٍ تشغيل الكاميرا...</div>
      <div style="margin-top:16px">
        <div class="field"><label>أو أدخل كود الجهاز يدوياً</label>
          <div style="display:flex;gap:8px">
            <input id="manual-code" placeholder="مثال: FCL-CC-763" style="flex:1;padding:10px 13px;border:1px solid var(--border);border-radius:10px">
            <button class="btn btn-primary" id="manual-go">بحث</button>
          </div>
        </div>
      </div>
    </div></div>`;
}
function stopScanner(){ if (_scanner){ try{ _scanner.stop(); }catch{}; _scanner=null; } }
function resolveScan(text){
  // accept full URL (…#/device/ID) or a code
  let id = null;
  const m = String(text).match(/#\/device\/([^/?#]+)/);
  if (m) id = m[1];
  let dev = id ? DB.device(id) : null;
  if (!dev){
    const q = String(text).trim().toLowerCase();
    dev = DB.devices().find(d => [d.id,d.newCode,d.oldCode,d.serial].some(v=>String(v||'').toLowerCase()===q));
  }
  return dev;
}
function startScanner(){
  $('#manual-go') && ($('#manual-go').onclick = () => {
    const dev = resolveScan($('#manual-code').value);
    if (dev){ go(`/device/${dev.id}`); } else toast('لم يُعثر على الجهاز','err');
  });
  if (!window.Html5Qrcode){ $('#scan-msg').textContent='مكتبة المسح غير متاحة (تحقق من الاتصال)'; return; }
  _scanner = new Html5Qrcode('qr-reader');
  _scanner.start({ facingMode:'environment' }, { fps:10, qrbox:240 },
    (text) => {
      const dev = resolveScan(text);
      stopScanner();
      if (dev){ toast('تم العثور على الجهاز','ok'); scanActionModal(dev); }
      else toast('رمز غير معروف: '+text, 'err');
    }, () => {}
  ).then(()=> $('#scan-msg').textContent='وجّه الكاميرا نحو رمز QR')
   .catch(()=> $('#scan-msg').innerHTML='تعذّر الوصول إلى الكاميرا — استخدم الإدخال اليدوي بالأسفل');
  window.addEventListener('hashchange', stopScanner, { once:true });
}
function scanActionModal(d){
  modal({
    title:`${d.name}`,
    body:`<div class="info-row"><span class="k">الكود</span><span class="v code">${esc(d.newCode||d.oldCode)}</span></div>
      <div class="info-row"><span class="k">المعايرة</span><span class="v">${statusBadge(DB.status(d))}</span></div>
      <div class="info-row"><span class="k">تنتهي</span><span class="v">${esc(d.dueDate||'—')}</span></div>
      ${Auth.can('device.status')?`<div class="field full" style="margin-top:14px"><label>تحديث حالة التشغيل</label>
        <select id="sc-cond">${Object.entries(DB.COND_LABEL).map(([k,v])=>`<option value="${k}" ${d.condition===k?'selected':''}>${v}</option>`).join('')}</select></div>`:''}`,
    footer:`${Auth.can('device.status')?`<button class="btn btn-primary" id="sc-save">حفظ الحالة</button>`:''}
      <a class="btn btn-ghost" href="#/device/${d.id}">عرض التفاصيل ←</a>
      <button class="btn btn-ghost" id="sc-rescan">مسح آخر</button>`,
    onOpen:(close)=>{
      $('#sc-rescan').onclick = () => { close(); startScanner(); };
      if ($('#sc-save')) $('#sc-save').onclick = () => {
        const c = $('#sc-cond').value;
        DB.updateDevice(d.id, { condition:c }, Auth.current().name, `تحديث الحالة عبر مسح QR إلى: ${DB.COND_LABEL[c]}`);
        close(); toast('تم تحديث الحالة','ok');
      };
    }
  });
}

/* ============================================================
   QR SHEET — رموز QR لكل الأجهزة (طباعة / تحميل جماعي)
   ============================================================ */
function viewQRSheet(){
  const depts = DB.departments();
  setTimeout(setupQRSheet, 0);
  return `
    <div class="page-head no-print"><div><h1>رموز QR للأجهزة</h1><p>اطبعي الصفحة أو احفظيها PDF لطباعة ملصقات الأجهزة، أو حمّلي رمز كل جهاز</p></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" id="qr-print">🖨️ طباعة / حفظ PDF</button>
        <button class="btn btn-primary" id="qr-zip">⬇️ تحميل الكل (PNG)</button>
      </div></div>
    <div class="card no-print" style="margin-bottom:18px"><div class="card-body" style="display:flex;gap:14px;align-items:end;flex-wrap:wrap">
      <div class="field" style="min-width:220px"><label>القسم</label><select id="qr-dept"><option value="">كل الأقسام</option>
        ${depts.map(d=>`<option value="${d.id}">${esc(d.icon)} ${esc(d.nameAr)}</option>`).join('')}</select></div>
      <div class="field" style="min-width:160px"><label>التصنيف</label><select id="qr-cat">
        <option value="">الكل</option><option value="supporting">مساند</option><option value="main">رئيسي</option></select></div>
      <span class="muted" id="qr-count" style="padding-bottom:10px"></span>
    </div></div>
    <div id="qr-grid" class="qr-grid"></div>`;
}
function qrFilteredList(){
  const dept=$('#qr-dept').value, cat=$('#qr-cat').value;
  let list = DB.devices();
  if (dept) list = list.filter(d=>d.departmentId===dept);
  if (cat) list = list.filter(d=>(d.category||'supporting')===cat);
  return list;
}
function setupQRSheet(){
  const render = () => {
    const list = qrFilteredList();
    $('#qr-count').textContent = `${list.length} جهاز`;
    const grid = $('#qr-grid');
    grid.innerHTML = list.length ? list.map(d=>{
      const dep = DB.department(d.departmentId);
      return `<div class="qr-card">
        <canvas class="qr-c" data-id="${d.id}"></canvas>
        <div class="qr-label"><b>${esc(d.newCode||d.oldCode||'—')}</b>
          <div class="qr-name">${esc(d.name)}</div>
          <div class="qr-dep muted">${esc(dep?.nameAr||'')}${d.serial?(' • '+esc(d.serial)):''}</div></div>
        <button class="btn btn-ghost btn-sm no-print qr-dl" data-id="${d.id}" data-label="${esc(d.newCode||d.oldCode||d.id)}">⬇️ تحميل</button>
      </div>`;
    }).join('') : `<div class="empty"><div class="e-ico">🏷️</div>لا توجد أجهزة مطابقة</div>`;
    // draw QR canvases
    if (window.QRCode) $$('.qr-c', grid).forEach(c =>
      QRCode.toCanvas(c, deviceURL(c.dataset.id), { width:150, margin:1, color:{dark:'#0f172a',light:'#ffffff'} }, ()=>{}));
    $$('.qr-dl', grid).forEach(b => b.onclick = () => downloadQR(b.dataset.id, b.dataset.label));
  };
  $('#qr-dept').onchange = render;
  $('#qr-cat').onchange = render;
  $('#qr-print').onclick = () => window.print();
  $('#qr-zip').onclick = downloadAllQR;
  render();
}
// تحميل كل الرموز كصور PNG متتابعة
function downloadAllQR(){
  const list = qrFilteredList();
  if (!list.length) return toast('لا توجد أجهزة','err');
  if (!confirm(`سيتم تحميل ${list.length} صورة QR. متابعة؟`)) return;
  let i = 0;
  const next = () => {
    if (i >= list.length){ toast('تم تحميل كل الرموز','ok'); return; }
    const d = list[i++];
    const tmp = document.createElement('canvas');
    QRCode.toCanvas(tmp, deviceURL(d.id), { width:500, margin:2 }, () => {
      const a = document.createElement('a');
      a.href = tmp.toDataURL('image/png'); a.download = `QR-${(d.newCode||d.oldCode||d.id)}.png`; a.click();
      setTimeout(next, 250); // فاصل بسيط حتى لا يحجب المتصفح التنزيلات
    });
  };
  next();
}

/* ============================================================
   REPORTS
   ============================================================ */
function viewReports(){
  setTimeout(setupReports, 0);
  const depts = DB.departments();
  return `
    <div class="page-head"><div><h1>التقارير</h1><p>تقارير الأجهزة والمعايرة مع إمكانية التصفية والتصدير</p></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost no-print" id="rep-print">🖨️ طباعة</button>
        <button class="btn btn-primary no-print" id="rep-csv">⬇️ تصدير CSV</button>
      </div></div>
    <div class="card no-print" style="margin-bottom:18px"><div class="card-body">
      <div class="form-grid">
        <div class="field"><label>القسم</label><select id="r-dept"><option value="">كل الأقسام</option>
          ${depts.map(d=>`<option value="${d.id}">${esc(d.nameAr)}</option>`).join('')}</select></div>
        <div class="field"><label>حالة المعايرة</label><select id="r-status">
          <option value="">الكل</option><option value="valid">سارية</option><option value="soon">تنتهي قريباً</option>
          <option value="expired">منتهية</option><option value="unknown">غير محددة</option></select></div>
        <div class="field"><label>التصنيف</label><select id="r-cat">
          <option value="">الكل</option><option value="main">رئيسي</option><option value="supporting">مساند</option></select></div>
        <div class="field"><label>بحث</label><input id="r-q" placeholder="اسم، كود، رقم تسلسلي..."></div>
      </div>
    </div></div>
    <div class="card"><div class="card-head"><h3 id="rep-title">تقرير الأجهزة</h3><span class="muted" id="rep-count"></span></div>
      <div class="table-wrap" id="rep-table"></div></div>`;
}
let _repRows = [];
function setupReports(){
  const render = () => {
    const dept=$('#r-dept').value, status=$('#r-status').value, cat=$('#r-cat').value, q=$('#r-q').value.trim().toLowerCase();
    let list = DB.devices();
    if (dept) list = list.filter(d=>d.departmentId===dept);
    if (cat) list = list.filter(d=>(d.category||'supporting')===cat);
    if (status) list = list.filter(d=>DB.status(d)===status);
    if (q) list = list.filter(d=>[d.name,d.newCode,d.oldCode,d.serial,d.certNumber,d.manufacturer].some(v=>String(v||'').toLowerCase().includes(q)));
    _repRows = list;
    $('#rep-count').textContent = `${list.length} جهاز`;
    $('#rep-table').innerHTML = list.length ? `<table class="tbl"><thead><tr>
      <th>القسم</th><th>الكود</th><th>الجهاز</th><th>التصنيف</th><th>الرقم التسلسلي</th><th>الفحص</th>
      <th>المعايرة</th><th>الانتهاء</th><th>الحالة</th></tr></thead><tbody>
      ${list.map(d=>{ const dep=DB.department(d.departmentId);
        return `<tr><td>${esc(dep?.nameAr||'')}</td><td class="code">${esc(d.newCode||d.oldCode)}</td>
        <td><a href="#/device/${d.id}"><b>${esc(d.name)}</b></a></td><td>${catBadge(d.category)}</td>
        <td>${esc(d.serial||'—')}</td><td>${esc(d.test||'—')}</td><td>${esc(d.calDate||'—')}</td>
        <td>${esc(d.dueDate||'—')}</td><td>${statusBadge(DB.status(d))}</td></tr>`;}).join('')}
      </tbody></table>` : `<div class="empty"><div class="e-ico">🔍</div>لا توجد نتائج مطابقة</div>`;
  };
  ['r-dept','r-status','r-cat'].forEach(id=>$('#'+id).onchange=render);
  $('#r-q').oninput = render;
  $('#rep-print').onclick = () => window.print();
  $('#rep-csv').onclick = exportCSV;
  render();
}
function exportCSV(){
  const head = ['القسم','الوحدة','التصنيف','الكود الجديد','الكود القديم','اسم الجهاز','المصنّع','الموديل','الرقم التسلسلي','الفحص','رقم الشهادة','جهة المعايرة','تاريخ المعايرة','تاريخ الانتهاء','الحالة','التشغيل','ملاحظات'];
  const rows = _repRows.map(d=>{ const dep=DB.department(d.departmentId);
    return [dep?.nameAr||'', d.unit||'', d.category==='main'?'رئيسي':'مساند', d.newCode||'', d.oldCode||'', d.name||'', d.manufacturer||'', d.model||'', d.serial||'', d.test||'', d.certNumber||'', d.calCompany||'', d.calDate||'', d.dueDate||'', DB.STATUS_LABEL[DB.status(d)], DB.COND_LABEL[d.condition||'operational'], (d.remarks||'').replace(/\n/g,' ')];
  });
  const csv = [head, ...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download = `تقرير-الأجهزة-${DB.today().replace(/\//g,'-')}.csv`; a.click();
  toast('تم تصدير '+rows.length+' سجل','ok');
}

/* ============================================================
   USERS
   ============================================================ */
function viewUsers(){
  if (!Auth.can('user.manage')) return `<div class="empty">لا تملك صلاحية لهذه الصفحة</div>`;
  setTimeout(()=> { $('#add-user').onclick = () => userModal(); bindUserRows(); }, 0);
  const users = Auth.users();
  return `
    <div class="page-head"><div><h1>المستخدمون والصلاحيات</h1><p>إدارة حسابات النظام وأدوارها</p></div>
      <button class="btn btn-primary" id="add-user">＋ مستخدم جديد</button></div>
    <div class="grid-3" style="margin-bottom:22px">
      ${Object.entries(Auth.ROLES).map(([k,r])=>`<div class="card"><div class="card-body">
        <b>${esc(r.label)}</b><p class="muted" style="font-size:12.5px;margin-top:6px">${esc(r.desc)}</p>
        <div style="margin-top:8px" class="muted">${users.filter(u=>u.role===k).length} مستخدم</div></div></div>`).join('')}
    </div>
    <div class="card"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>المستخدم</th><th>اسم الدخول</th><th>الدور</th><th>أنشئ في</th><th></th></tr></thead>
      <tbody>${users.map(u=>`<tr>
        <td><div style="display:flex;align-items:center;gap:10px"><span class="avatar" style="width:32px;height:32px;font-size:13px">${esc(u.name.slice(0,1))}</span><b>${esc(u.name)}</b></div></td>
        <td><code>${esc(u.username)}</code></td><td>${esc(Auth.roleLabel(u.role))}</td>
        <td class="muted">${new Date(u.createdAt).toLocaleDateString('ar')}</td>
        <td style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm u-edit" data-id="${u.id}">✏️</button>
          ${u.id!=='admin'?`<button class="btn btn-danger btn-sm u-del" data-id="${u.id}">🗑️</button>`:''}</td>
      </tr>`).join('')}</tbody></table></div></div>`;
}
function bindUserRows(){
  $$('.u-edit').forEach(b=> b.onclick = () => userModal(Auth.users().find(u=>u.id===b.dataset.id)));
  $$('.u-del').forEach(b=> b.onclick = () => {
    if (confirm('حذف هذا المستخدم؟')){ try{ Auth.deleteUser(b.dataset.id); toast('تم الحذف','ok'); router(); }catch(e){ toast(e.message,'err'); } }
  });
}
function userModal(user){
  const edit = !!user;
  modal({
    title: edit?'تعديل مستخدم':'مستخدم جديد',
    body:`<div class="form-grid">
      <div class="field full req"><label>الاسم</label><input id="u-name" value="${esc(user?.name||'')}"></div>
      <div class="field req"><label>اسم الدخول</label><input id="u-username" value="${esc(user?.username||'')}" ${edit?'disabled':''}></div>
      <div class="field req"><label>الدور</label><select id="u-role">
        ${Object.entries(Auth.ROLES).map(([k,r])=>`<option value="${k}" ${user?.role===k?'selected':''}>${esc(r.label)}</option>`).join('')}</select></div>
      <div class="field full"><label>${edit?'كلمة مرور جديدة (اتركها فارغة للإبقاء)':'كلمة المرور'}</label><input id="u-pass" type="text"></div>
    </div>`,
    footer:`<button class="btn btn-primary" id="u-save">حفظ</button><button class="btn btn-ghost" id="u-cancel">إلغاء</button>`,
    onOpen:(close)=>{
      $('#u-cancel').onclick = close;
      $('#u-save').onclick = () => {
        const name=$('#u-name').value.trim(), username=$('#u-username').value.trim(), role=$('#u-role').value, pass=$('#u-pass').value;
        if (!name||!username) return toast('أكمل الحقول','err');
        try {
          if (edit) Auth.updateUser(user.id, { name, role, ...(pass?{password:pass}:{}) });
          else { if (!pass) return toast('أدخل كلمة المرور','err'); Auth.addUser({ name, username, role, password:pass }); }
          close(); toast('تم الحفظ','ok'); router();
        } catch(e){ toast(e.message,'err'); }
      };
    }
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
function viewSettings(){
  if (!Auth.can('settings.manage')) return `<div class="empty">لا تملك صلاحية لهذه الصفحة</div>`;
  setTimeout(()=> {
    $('#set-save').onclick = () => {
      DB.saveSettings({ labName:$('#s-lab').value.trim(), soonDays:Math.max(1,+$('#s-days').value||60), baseUrl:$('#s-baseurl').value.trim() });
      toast('تم حفظ الإعدادات','ok'); router();
    };
    $('#set-reset').onclick = async () => {
      if (confirm('سيعيد هذا تحميل الأجهزة الأصلية الـ72 إلى السحابة (لن يحذف الأجهزة التي أضفتِها). متابعة؟')){
        try { await DB.resetAll(); toast('تمت الاستعادة','ok'); go('/'); }
        catch(e){ toast('تعذّرت الاستعادة','err'); }
      }
    };
  },0);
  const s = DB.settings;
  return `
    <div class="page-head"><div><h1>الإعدادات</h1><p>تخصيص النظام</p></div></div>
    <div class="card" style="max-width:620px"><div class="card-body">
      <div class="form-grid">
        <div class="field full"><label>اسم المختبر</label><input id="s-lab" value="${esc(s.labName||'')}"></div>
        <div class="field"><label>فترة التنبيه قبل الانتهاء (أيام)</label><input id="s-days" type="number" min="1" value="${s.soonDays||60}">
          <span class="hint">يُعتبر الجهاز "تنتهي قريباً" خلال هذه المدة</span></div>
        <div class="field full"><label>رابط الاستضافة لرموز QR (Base URL)</label>
          <input id="s-baseurl" value="${esc(s.baseUrl||'')}" placeholder="https://username.github.io/lab-system-3/lab-platform.html" dir="ltr">
          <span class="hint">اكتبي رابط المنصة بعد نشرها على الإنترنت. عندها يفتح تصوير QR من الجوال صفحة الجهاز مباشرةً. اتركيه فارغاً للاستخدام داخل نفس الجهاز فقط.</span></div>
      </div>
      <div style="margin-top:18px;display:flex;gap:10px">
        <button class="btn btn-primary" id="set-save">حفظ الإعدادات</button>
      </div>
      <hr style="margin:24px 0;border:none;border-top:1px solid var(--border)">
      <h3 style="margin-bottom:8px">منطقة الخطر</h3>
      <p class="muted" style="font-size:13px;margin-bottom:12px">إعادة تحميل الأجهزة الأصلية الـ72 إلى السحابة (لن يحذف الأجهزة التي أضفتِها).</p>
      <button class="btn btn-danger" id="set-reset">♻️ استعادة البيانات الأصلية</button>
    </div></div>`;
}

/* expose for inline handlers */
window.downloadQR = downloadQR;
window.$ = $;
