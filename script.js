// ── CONFIG ────────────────────────────────────────────────────────────────
const DEFAULT_CLIENT_ID = '802226109271-praqff3gi21a2i90mp78bmn6a7999s9m.apps.googleusercontent.com';
const DEFAULT_MASTER_ID = '1w91ZLfxhFA9yTorZHrVQGSQ9k0U8c0ny';
const DEFAULT_FOLDER_ID = '1FpSq1CKfMec2P3p15C8U7HFYgK-HLiNE';

let CLIENT_ID      = localStorage.getItem('st_client_id')  || DEFAULT_CLIENT_ID;
let MASTER_FILE_ID = localStorage.getItem('st_master_id')  || DEFAULT_MASTER_ID;
let DEST_FOLDER_ID = localStorage.getItem('st_folder_id')  || DEFAULT_FOLDER_ID;

const SCOPES = 'https://www.googleapis.com/auth/drive';
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

let tokenClient, accessToken;
let currentMonth  = { month: new Date().getMonth(), year: new Date().getFullYear() };
let pickerMonth   = { ...currentMonth };
let currentTab    = 'dashboard';
let currentFileId = null;
let hasChanges    = false;
let addRowContext  = null;
let gisLoaded     = false;

// All data and schemas come from Drive — nothing hardcoded here
let data    = {};
let SCHEMAS = {};

// ── SCHEMA BUILDER ────────────────────────────────────────────────────────
// Dynamically derives schemas from the keys of master.json rows.
// Type is inferred by key name. Status options are fixed per section.
// This means master.json fully controls the columns — add/remove keys there.
function buildSchemasFromData(masterObj) {
  const sections = ['income','fixed','semifixed','variable','unexpected','lending'];

  const dateKeys     = ['date','dateReceived','datePaid','dateStart','dateEnd','dateGiven','dueDate','dateToPay'];
  const numberKeys   = ['amount','totalLoanAmount','pendingAmount','returned','balance'];
  const textareaKeys = ['description'];
  const selectKeys   = ['paymentMode','status','type','mode','accountUsed','accountReceived'];

  // For sections with 0 rows, fall back to sibling section keys if available
  // (e.g. unexpected mirrors variable structure)
  const fallbackKeys = { unexpected: 'variable' };

  SCHEMAS = {};

  sections.forEach(section => {
    let rows = masterObj[section] || [];

    // If this section is empty, try to get key structure from a fallback sibling
    if (rows.length === 0 && fallbackKeys[section]) {
      rows = masterObj[fallbackKeys[section]] || [];
    }

    if (rows.length === 0) {
      SCHEMAS[section] = [{ key:'sno', label:'#', type:'sno' }];
      return;
    }

    // Collect all unique non-internal keys across rows
    const allKeys = [];
    rows.forEach(row => {
      Object.keys(row).forEach(k => {
        if (!allKeys.includes(k) && !k.startsWith('_')) allKeys.push(k);
      });
    });

    const schema = allKeys.map(key => {
      if (key === 'sno') return { key, label: '#', type: 'sno' };

      // camelCase → Title Case label
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .replace('Amount', 'Amount (\u20b9)')
        .trim();

      if (dateKeys.includes(key))     return { key, label, type: 'date' };
      if (numberKeys.includes(key))   return { key, label, type: 'number' };
      if (textareaKeys.includes(key)) return { key, label, type: 'textarea' };

      if (selectKeys.includes(key)) {
        let opts;
        if (key === 'status') {
          // Status options are fixed by section — never derived from data
          opts = section === 'lending'
            ? ['Fully Paid', 'Partially Paid', 'Delayed']
            : ['Paid', 'Pending', 'Delayed'];
        } else {
          // Other selects: collect unique non-empty values from data
          opts = [...new Set(rows.map(r => r[key]).filter(v => v && v !== ''))];
        }
        return { key, label, type: 'select', opts };
      }

      return { key, label, type: 'text' };
    });

    SCHEMAS[section] = schema;
  });
}

// ── SIGN IN ───────────────────────────────────────────────────────────────
function handleGoogleSignIn() {
  if (!CLIENT_ID) { openSettingsModal(); return; }
  loadGIS();
}
function loadGIS() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) { initTokenClient(); return; }
  if (gisLoaded) return;
  gisLoaded = true;
  showToast('Loading Google Sign-In...','info');
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload  = initTokenClient;
  s.onerror = () => { gisLoaded=false; showToast('Network error loading Google API','error'); };
  document.head.appendChild(s);
}
function initTokenClient() {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPES, callback: onTokenResponse
    });
    tokenClient.requestAccessToken({ prompt:'' });
  } catch(e) { gisLoaded=false; showToast('Error: '+e.message,'error'); }
}
function onTokenResponse(resp) {
  if (resp.error) { showToast('Sign-in failed: '+resp.error,'error'); gisLoaded=false; return; }
  accessToken = resp.access_token;
  onSignedIn();
}
function onSignedIn() {
  document.getElementById('splash').style.display='none';
  document.getElementById('app').classList.add('visible');
  updateMonthDisplay();
  switchTab('dashboard');
  showToast('✓ Signed in!','success');
}
function signOut() {
  if (!confirm('Sign out?')) return;
  if (accessToken && typeof google!=='undefined') google.accounts.oauth2.revoke(accessToken,()=>{});
  accessToken=null; currentFileId=null; gisLoaded=false;
  resetData();
  document.getElementById('splash').style.display='flex';
  document.getElementById('app').classList.remove('visible');
}

// ── DRIVE REST API ────────────────────────────────────────────────────────
const H = () => ({ 'Authorization':'Bearer '+accessToken });

async function driveList(q) {
  const p = new URLSearchParams({ q, fields:'files(id,name,mimeType)', pageSize:'10' });
  const r = await fetch('https://www.googleapis.com/drive/v3/files?'+p, { headers:H() });
  if (!r.ok) throw new Error('List failed: '+r.status);
  return (await r.json()).files || [];
}
async function driveDownloadText(fileId) {
  if (!accessToken) throw new Error('Not authenticated');

  // Try 1: direct download (works for files YOU own)
  const r1 = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: H() }
  );
  if (r1.ok) return r1.text();

  // Try 2: shared/external file — add acknowledgeAbuse flag
  const r2 = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`,
    { headers: H() }
  );
  if (r2.ok) return r2.text();

  // Both failed — get the actual error message from Drive
  let msg = 'HTTP '+r2.status;
  try { const e = await r2.json(); msg = e.error?.message || msg; } catch(_){}
  if (r2.status===404) throw new Error('File not found. Check the Master File ID in Settings.');
  if (r2.status===403) throw new Error(
    'Access denied. Go to Google Drive → right-click master.json → Make a copy → use the copy\'s ID in Settings.'
  );
  throw new Error(msg);
}
async function driveUploadJson(fileId, obj, name) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({name})], {type:'application/json'}));
  form.append('file',     new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'}));
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
    method:'PATCH', headers:H(), body:form
  });
  if (!r.ok) throw new Error('Upload failed: '+r.status+' '+(await r.text()));
  return r.json();
}
async function driveCreateJson(name, obj, folderId) {
  const meta = { name, mimeType:'application/json' };
  if (folderId) meta.parents = [folderId];
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], {type:'application/json'}));
  form.append('file',     new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'}));
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method:'POST', headers:H(), body:form
  });
  if (!r.ok) throw new Error('Create failed: '+r.status+' '+(await r.text()));
  return r.json();
}

// ── FILE NAMES ────────────────────────────────────────────────────────────
function getFileName() {
  return `${MONTHS[currentMonth.month]}-${currentMonth.year}_Salary_Tracker.json`;
}

// ── LOAD / CREATE MONTH FILE ──────────────────────────────────────────────
async function loadOrCreateCurrentMonth() {
  if (!accessToken)    { showToast('Please sign in first','error'); return; }
  if (!MASTER_FILE_ID) { showToast('Set Master JSON File ID in ⚙️ Settings first','error'); openSettingsModal(); return; }

  const name = getFileName();
  showToast('🔍 Looking for '+name+'...','info');
  try {
    let q = `name='${name}' and trashed=false and mimeType='application/json'`;
    if (DEST_FOLDER_ID) q += ` and '${DEST_FOLDER_ID}' in parents`;
    const files = await driveList(q);

    if (files.length > 0) {
      currentFileId = files[0].id;
      showToast('✓ File found! Loading...','success');
      await loadJsonData();
    } else {
      await createFromMaster(name);
    }
  } catch(e) {
    showToast('❌ '+e.message,'error');
    console.error(e);
  }
}

// Always reads master.json from Drive — no hardcoded data anywhere
async function createFromMaster(name) {
  showToast('📋 Loading master.json from Drive...','info');
  try {
    const masterFileId = await resolveMasterFileId();
    const masterText = await driveDownloadText(masterFileId);
    const masterData = JSON.parse(masterText);

    // Build schemas from master structure
    buildSchemasFromData(masterData);

    const newData = JSON.parse(JSON.stringify(masterData));
    newData._month   = MONTHS[currentMonth.month];
    newData._year    = currentMonth.year;
    newData._created = new Date().toISOString();

    const result = await driveCreateJson(name, newData, DEST_FOLDER_ID);
    currentFileId = result.id;

    loadDataFromObject(newData);
    setFileStatus(true);
    switchTab(currentTab);
    showToast('✓ '+name+' created from master!','success');
  } catch(e) {
    showToast('❌ '+e.message,'error');
    console.error(e);
  }
}

async function loadJsonData() {
  try {
    const text = await driveDownloadText(currentFileId);
    const obj  = JSON.parse(text);
    // Rebuild schemas from the loaded file's actual keys
    buildSchemasFromData(obj);
    loadDataFromObject(obj);
    setFileStatus(true);
    switchTab(currentTab);
    showToast('✓ Data loaded!','success');
  } catch(e) {
    showToast('❌ Load error: '+e.message,'error');
    console.error(e);
  }
}

function loadDataFromObject(obj) {
  const sections = ['income','fixed','semifixed','variable','unexpected','lending'];
  data = {};
  sections.forEach(k => {
    data[k] = (obj[k] || []).map((row, i) => ({
      ...row,
      _id: row._id || (k+'_'+i+'_'+Date.now())
    }));
  });
}

// ── SAVE MONTH FILE ───────────────────────────────────────────────────────
async function saveToGDrive() {
  if (!currentFileId) { await loadOrCreateCurrentMonth(); if (!currentFileId) return; }
  const btn = document.getElementById('saveBtn');
  btn.innerHTML = '<div class="spinner"></div>';
  btn.disabled = true;
  try {
    const sections = ['income','fixed','semifixed','variable','unexpected','lending'];
    const payload = { _version:1, _month:MONTHS[currentMonth.month], _year:currentMonth.year, _saved:new Date().toISOString() };
    sections.forEach(k => payload[k] = data[k] || []);
    await driveUploadJson(currentFileId, payload, getFileName());
    showToast('✓ Saved to Google Drive!','success');
    hasChanges = false;
    document.getElementById('syncBar').classList.remove('visible');
  } catch(e) {
    showToast('❌ Save error: '+e.message,'error');
    console.error(e);
  } finally {
    btn.innerHTML = '☁️ Save';
    btn.disabled = false;
  }
}

// ── MASTER JSON EDITOR ────────────────────────────────────────────────────
async function resolveMasterFileId() {
  // Try stored ID first — same direct download the month files use
  if (MASTER_FILE_ID) {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${MASTER_FILE_ID}?fields=id,name`,
      { headers: H() }
    );
    if (r.ok) return MASTER_FILE_ID; // ID is valid, use it
  }
  // Stored ID failed — search Drive by filename, same as loadOrCreateCurrentMonth does
  showToast('Searching Drive for master.json...','info');
  const q = `name='master.json' and trashed=false and mimeType='application/json'`;
  const files = await driveList(q);
  if (files.length === 0) throw new Error('master.json not found in Drive. Upload it first.');
  const foundId = files[0].id;
  // Auto-save the correct ID so it works next time
  MASTER_FILE_ID = foundId;
  localStorage.setItem('st_master_id', foundId);
  showToast('✓ Found master.json — ID updated in Settings','success');
  return foundId;
}

async function testMasterAccess() {
  console.log('accessToken:', accessToken ? 'OK' : 'NULL');
  console.log('MASTER_FILE_ID:', MASTER_FILE_ID);
  if (!accessToken) { alert('Not signed in!'); return; }
  var url1 = 'https://www.googleapis.com/drive/v3/files/' + MASTER_FILE_ID + '?fields=id,name';
  var url2 = 'https://www.googleapis.com/drive/v3/files/' + MASTER_FILE_ID + '?alt=media';
  try {
    var r1 = await fetch(url1, { headers: { Authorization: 'Bearer ' + accessToken } });
    var b1 = await r1.text();
    console.log('Metadata:', r1.status, b1.substring(0,200));
    if (!r1.ok) { alert('Metadata FAILED ' + r1.status + ': ' + b1.substring(0,300)); return; }
    var r2 = await fetch(url2, { headers: { Authorization: 'Bearer ' + accessToken } });
    var b2 = await r2.text();
    console.log('Download:', r2.status, b2.substring(0,200));
    if (!r2.ok) alert('Download FAILED ' + r2.status + ': ' + b2.substring(0,300));
    else alert('SUCCESS! Loaded ' + b2.length + ' bytes');
  } catch(e) { alert('fetch threw: ' + e.message); console.error(e); }
}

async function editMasterJson() {
  if (!accessToken) { showToast('Please sign in first','error'); return; }
  closeModal('settingsModal');
  showToast('Loading master.json...','info');
  try {
    const fileId = await resolveMasterFileId();
    const text   = await driveDownloadText(fileId);
    document.getElementById('masterJsonEditor').value = JSON.stringify(JSON.parse(text), null, 2);
    showToast('✓ master.json loaded','success');
    openModal('masterJsonModal');
  } catch(e) {
    console.error('editMasterJson error:', e);
    showToast('❌ '+e.message,'error');
  }
}

async function saveMasterJson() {
  let json;
  try { json = JSON.parse(document.getElementById('masterJsonEditor').value); }
  catch(e) { showToast('❌ Invalid JSON: '+e.message,'error'); return; }
  try {
    showToast('Saving...','info');
    await driveUploadJson(MASTER_FILE_ID, json, 'master.json');
    // Rebuild schemas from updated master
    buildSchemasFromData(json);
    showToast('✓ master.json saved!','success');
    closeModal('masterJsonModal');
  } catch(e) {
    showToast('❌ '+e.message,'error');
    console.error(e);
  }
}

// ── EXPORT TO EXCEL ───────────────────────────────────────────────────────
function exportExcel() {
  try {
    const wb = XLSX.utils.book_new();
    const sections = ['income','fixed','semifixed','variable','unexpected','lending'];
    const sheetNames = {income:'Income',fixed:'Fixed Expenses',semifixed:'Semi Fixed Exp',
                        variable:'Variable Exp',unexpected:'Unexpected Exp',lending:'Lending & Borrowing'};
    // Match Excel dashboard formulas exactly
    // Total Income = only Paid entries
    const ti = sumIf(data.income||[],'amount','status','Paid');
    const pi = ti;
    const pndI = sumIf(data.income||[],'amount','status','Pending');
    const fi = sumIf(data.fixed||[],'amount','status','Paid');
    const si = sumIf(data.semifixed||[],'amount','status','Paid');
    const vi = sumIf(data.variable||[],'amount','status','Paid');
    const ui = sumIf(data.unexpected||[],'amount','status','Paid');
    const te = fi + si + vi + ui;
    const nb = ti - te; // Net Balance = Total Income - Total Paid Expenses
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Salary Tracker — '+MONTHS[currentMonth.month]+' '+currentMonth.year],[''],
      ['Total Income', ti, '', 'Paid Income', pi, '', 'Pending Income', pndI],[''],
      ['Total Expenses (Paid)', te, '', '', '', '', 'Net Balance', nb],[''],
      ['Fixed Expenses (Paid)', fi],
      ['Semi Fixed Expenses (Paid)', si],
      ['Variable Expenses (Paid)', vi],
      ['Unexpected Expenses (Paid)', ui]
    ]), 'Dashboard');
    sections.forEach(key => {
      const schema = SCHEMAS[key] || [];
      const headers = schema.map(c => c.label);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        [sheetNames[key]+' — '+MONTHS[currentMonth.month]+' '+currentMonth.year],
        headers,
        ...(data[key]||[]).map((row,i)=>schema.map(c=>c.type==='sno'?i+1:(row[c.key]||'')))
      ]), sheetNames[key]);
    });
    XLSX.writeFile(wb, MONTHS[currentMonth.month]+'-'+currentMonth.year+'_Salary_Tracker.xlsx');
    showToast('📊 Excel downloaded!','success');
  } catch(e) { showToast('Export error: '+e.message,'error'); }
}

// ── MATH HELPERS ─────────────────────────────────────────────────────────
function sum(arr,f)         { return arr.reduce((s,r)=>s+(parseFloat(r[f])||0),0); }
function sumIf(arr,f,cf,cv) { return arr.filter(r=>r[cf]===cv).reduce((s,r)=>s+(parseFloat(r[f])||0),0); }
function fmt(n)             { return '₹'+parseFloat(n||0).toLocaleString('en-IN',{maximumFractionDigits:0}); }

// ── TABS ─────────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  const tabs = ['dashboard','income','fixed','semifixed','variable','unexpected','lending'];
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',tabs[i]===tab));
  const c = document.getElementById('content');
  const titles = {income:'Income',fixed:'Fixed Expenses',semifixed:'Semi Fixed Expenses',
                  variable:'Variable Expenses',unexpected:'Unexpected Expenses',lending:'Lending & Borrowing'};
  if (tab==='dashboard') renderDashboard(c); else renderSheet(c, tab, titles[tab]);
}

function renderDashboard(c) {
  // ── Calculations match Excel formulas exactly ──────────────────────────
  // Total Income  = SUM(Income.amount)           [Excel: =SUM(Income!H4:H6)]
  // Paid Income   = SUMIF(Income.status="Paid")  [Excel: =SUMIF(Income!I4:I6,"Paid",Income!H4:H6)]
  // Pending Income= SUMIF(Income.status="Pending")[Excel: =SUMIF(Income!I4:I6,"Pending",Income!H4:H6)]
  // Expense cats  = SUMIF(status="Paid") per category
  // Total Expenses= sum of all four paid expense categories [Excel: =SUM(I9,I13,I17,I21)]
  // Net Balance   = Total Income - Total Expenses [Excel: =C4-C15]
  // Total Income = only Paid entries (Pending/Delayed not counted)
  const ti = sumIf(data.income||[],'amount','status','Paid');
  const pi = ti; // same — ti is already paid-only
  const pndIncome = sumIf(data.income||[],'amount','status','Pending');
  const delIncome = sumIf(data.income||[],'amount','status','Delayed');

  const fi = sumIf(data.fixed||[],'amount','status','Paid');
  const si = sumIf(data.semifixed||[],'amount','status','Paid');
  const vi = sumIf(data.variable||[],'amount','status','Paid');
  const ui = sumIf(data.unexpected||[],'amount','status','Paid');
  const te = fi + si + vi + ui;

  // Net Balance = Total Income - Total Paid Expenses (matches Excel =C4-C15)
  const nb = ti - te;
  const pct = ti > 0 ? Math.min(100, (te / ti) * 100) : 0;

  const noFile = !currentFileId ? `<div class="load-card">
    <div class="load-card-title">📂 ${MONTHS[currentMonth.month]} ${currentMonth.year}</div>
    <div class="load-card-sub">No file loaded. Tap below to load or create from master template.</div>
    <button class="btn btn-primary" style="width:100%" onclick="loadOrCreateCurrentMonth()">📋 Load / Create Month File</button>
  </div>` : '';

  c.innerHTML = noFile + `
    <div class="dashboard-grid">
      <div class="stat-card income">
        <div class="stat-label">Total Income</div>
        <div class="stat-value income">${fmt(ti)}</div>
        <div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Paid: <span style="color:var(--paid)">${fmt(pi)}</span> &nbsp; Pending: <span style="color:var(--pending)">${fmt(pndIncome)}</span></div>
      </div>
      <div class="stat-card expenses">
        <div class="stat-label">Total Expenses (Paid)</div>
        <div class="stat-value expenses">${fmt(te)}</div>
      </div>
      <div class="stat-card balance">
        <div class="stat-label">Net Balance</div>
        <div class="stat-value ${nb>=0?'balance-pos':'balance-neg'}">${fmt(nb)}</div>
        <div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Total Income − Paid Expenses</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-label">Pending Income</div>
        <div class="stat-value" style="color:var(--pending)">${fmt(pndIncome)}</div>
        ${delIncome>0?`<div style="font-size:.68rem;margin-top:.3rem;color:var(--delayed)">Delayed: ${fmt(delIncome)}</div>`:''}
      </div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:.45rem;font-size:.73rem">
        <span style="color:var(--muted)">Expenses vs Total Income</span>
        <span style="color:var(--accent2);font-family:var(--font-head);font-weight:700">${pct.toFixed(1)}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="section-head">Expense Breakdown</div>
    <div class="sheet-table">
      <table style="min-width:unset;width:100%">
        <thead><tr><th>Category</th><th style="text-align:right">Paid</th><th style="text-align:right">Pending</th><th style="text-align:right">Delayed</th></tr></thead>
        <tbody>
          ${[
            ['Fixed',      fi, sumIf(data.fixed||[],    'amount','status','Pending'), sumIf(data.fixed||[],    'amount','status','Delayed')],
            ['Semi Fixed', si, sumIf(data.semifixed||[],'amount','status','Pending'), sumIf(data.semifixed||[],'amount','status','Delayed')],
            ['Variable',   vi, sumIf(data.variable||[], 'amount','status','Pending'), sumIf(data.variable||[], 'amount','status','Delayed')],
            ['Unexpected', ui, sumIf(data.unexpected||[],'amount','status','Pending'),sumIf(data.unexpected||[],'amount','status','Delayed')]
          ].map(([cat,p,pnd,del])=>`<tr>
            <td>${cat}</td>
            <td style="text-align:right;color:var(--paid);font-family:var(--font-mono)">${p>0?fmt(p):'-'}</td>
            <td style="text-align:right;color:var(--pending);font-family:var(--font-mono)">${pnd>0?fmt(pnd):'-'}</td>
            <td style="text-align:right;color:var(--delayed);font-family:var(--font-mono)">${del>0?fmt(del):'-'}</td>
          </tr>`).join('')}
          <tr style="border-top:1px solid var(--border);font-weight:700">
            <td>Total</td>
            <td style="text-align:right;color:var(--paid);font-family:var(--font-mono)">${fmt(te)}</td>
            <td style="text-align:right;color:var(--pending);font-family:var(--font-mono)">${fmt(sumIf(data.fixed||[],'amount','status','Pending')+sumIf(data.semifixed||[],'amount','status','Pending')+sumIf(data.variable||[],'amount','status','Pending')+sumIf(data.unexpected||[],'amount','status','Pending'))}</td>
            <td style="text-align:right;color:var(--delayed);font-family:var(--font-mono)">${fmt(sumIf(data.fixed||[],'amount','status','Delayed')+sumIf(data.semifixed||[],'amount','status','Delayed')+sumIf(data.variable||[],'amount','status','Delayed')+sumIf(data.unexpected||[],'amount','status','Delayed'))}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function renderSheet(c, key, title) {
  const schema  = SCHEMAS[key] || [];
  const rows    = data[key]    || [];
  // Status colour coding matches Excel status values
  const stColor = {
    'Paid':         'var(--paid)',
    'Pending':      'var(--pending)',
    'Delayed':      'var(--delayed)',
    'Partially Paid':'var(--accent3)',
    'Fully Paid':   'var(--paid)'
  };

  const thead = schema.map(col=>`<th>${col.label}</th>`).join('')+'<th></th>';
  // When empty: render a proper row with correct column count so DataTables doesn't crash.
  // The "no entries" message is shown via a caption element instead of a colspan td.
  const emptyRow = schema.map(()=>`<td></td>`).join('') + '<td></td>';
  const tbody = rows.length===0
    ? `<tr class="dt-empty-row">${emptyRow}</tr>`
    : rows.map((row,ri)=>`<tr>${schema.map(col=>{
        const v=(row[col.key]??'').toString().replace(/"/g,'&quot;');
        if (col.type==='sno')      return `<td style="color:var(--muted);font-size:.68rem;min-width:22px">${ri+1}</td>`;
        if (col.type==='select')   return `<td><select class="inline-select" style="color:${stColor[row[col.key]]||'var(--text)'}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)">${(col.opts||[]).map(o=>`<option ${o===row[col.key]?'selected':''}>${o}</option>`).join('')}</select></td>`;
        if (col.type==='number')   return `<td><input class="inline-input" type="number" step="0.01" value="${v}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)" style="width:90px;text-align:right"></td>`;
        if (col.type==='date')     return `<td><input class="inline-input" type="date" value="${v}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)" style="width:118px"></td>`;
        if (col.type==='textarea') return `<td><input class="inline-input" type="text" value="${v}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)" style="min-width:120px"></td>`;
        return `<td><input class="inline-input" type="text" value="${v}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)" style="min-width:65px"></td>`;
      }).join('')}<td><button class="delete-btn" onclick="deleteRow('${key}',${ri})">✕</button></td></tr>`
    ).join('');

  const emptyMsg = rows.length===0
    ? `<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:.82rem;margin-top:.5rem">No entries yet — tap ➕ Add Entry to get started.</div>`
    : '';

  c.innerHTML = `
    <div class="add-entry-center">
      <button class="add-entry-btn" onclick="showAddRow('${key}','${title}')">➕ Add Entry</button>
    </div>
    <div class="section-head">${title}</div>
    ${emptyMsg}
    <div class="sheet-table" style="${rows.length===0?'display:none':''}">
      <div class="table-scroll"><table id="dataTable"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>
    </div>`;

  // Only init DataTables when there are actual rows — prevents column count crash on empty tables
  if (rows.length > 0) {
    setTimeout(()=>{
      if ($.fn.DataTable.isDataTable('#dataTable')) $('#dataTable').DataTable().destroy();
      $('#dataTable').DataTable({
        paging:true, searching:false, ordering:false,
        pageLength:10, lengthChange:true,
        scrollX:true, scrollY:'60vh', scrollCollapse:true, fixedHeader:true
      });
    }, 50);
  }
}

// ── CELL EDIT / DELETE ────────────────────────────────────────────────────
function updateCell(key, ri, field, value) {
  data[key][ri][field] = value;
  if (key==='lending') {
    const r=data[key][ri];
    r.balance = String((parseFloat(r.amount)||0)-(parseFloat(r.returned)||0));
  }
  markDirty();
}
async function deleteRow(key, ri) {
  const row = data[key][ri];
  const label = row.source || row.personName || row.name || `Row ${ri+1}`;

  // Custom confirm modal — ask about monthly file first
  const confirmed = await showConfirmModal(
    '🗑️ Delete Row',
    `Delete <strong>${label}</strong> from this month's file?`
  );
  if (!confirmed) return;

  // Remove from monthly data
  data[key].splice(ri, 1);
  markDirty();

  // Now ask about master.json
  if (accessToken && MASTER_FILE_ID) {
    const alsoMaster = await showConfirmModal(
      '📋 Also delete from Master?',
      `Do you also want to remove <strong>${label}</strong> from <code>master.json</code>?<br><span style="font-size:.75rem;color:var(--muted)">This will affect all future months created from master.</span>`
    );
    if (alsoMaster) {
      await syncDeleteToMaster(key, label, row);
    }
  }

  switchTab(currentTab);
}

async function syncDeleteToMaster(key, label, deletedRow) {
  try {
    showToast('Syncing deletion to master.json...', 'info');
    const masterFileId = await resolveMasterFileId();
    const masterText   = await driveDownloadText(masterFileId);
    const masterData   = JSON.parse(masterText);

    if (!masterData[key]) { showToast('Section not found in master.json', 'error'); return; }

    // Match by source/personName/name — same field used for the label
    const matchKeys = ['source', 'personName', 'name'];
    const matchKey  = matchKeys.find(k => deletedRow[k]);
    const matchVal  = matchKey ? deletedRow[matchKey] : null;

    let idx = -1;
    if (matchVal) {
      idx = masterData[key].findIndex(r => r[matchKey] === matchVal);
    }

    if (idx === -1) {
      showToast(`⚠️ Could not find "${label}" in master.json — not deleted there`, 'error');
      return;
    }

    masterData[key].splice(idx, 1);
    // Re-number sno
    masterData[key].forEach((r, i) => { if (r.sno !== undefined) r.sno = i + 1; });

    await driveUploadJson(masterFileId, masterData, 'master.json');
    buildSchemasFromData(masterData);
    showToast(`✓ "${label}" deleted from master.json too`, 'success');
  } catch(e) {
    showToast('❌ Master sync error: ' + e.message, 'error');
    console.error(e);
  }
}
// ── CONFIRM MODAL (replaces browser confirm()) ───────────────────────────
// Returns a Promise<boolean> — resolves true on confirm, false on cancel.
function showConfirmModal(title, bodyHtml) {
  return new Promise(resolve => {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalBody').innerHTML   = bodyHtml;
    openModal('confirmModal');

    // Wire buttons fresh each time (avoids stale listeners)
    const btnYes = document.getElementById('confirmModalYes');
    const btnNo  = document.getElementById('confirmModalNo');

    function done(result) {
      closeModal('confirmModal');
      btnYes.replaceWith(btnYes.cloneNode(true)); // remove old listeners
      btnNo .replaceWith(btnNo .cloneNode(true));
      resolve(result);
    }

    document.getElementById('confirmModalYes').addEventListener('click', () => done(true),  { once:true });
    document.getElementById('confirmModalNo') .addEventListener('click', () => done(false), { once:true });
  });
}

function markDirty() { hasChanges=true; document.getElementById('syncBar').classList.add('visible'); }
function discardChanges() {
  if (!confirm('Discard all unsaved changes?')) return;
  hasChanges=false; document.getElementById('syncBar').classList.remove('visible');
  if (currentFileId) loadJsonData(); else { resetData(); switchTab(currentTab); }
}

// ── ADD ROW ───────────────────────────────────────────────────────────────
function showAddRow(key, title) {
  addRowContext = key;
  document.getElementById('addRowTitle').textContent = 'Add '+title;
  // Schema already has correct opts for every field (including status) from buildSchemasFromData
  const schema = (SCHEMAS[key] || []).filter(c=>c.type!=='sno');
  document.getElementById('addRowForm').innerHTML = '<div class="form-grid">' +
    schema.map(col => {
      let input = '';
      if      (col.type==='select')   input = `<select class="form-select" name="${col.key}"><option value="">Select...</option>${(col.opts||[]).map(o=>`<option>${o}</option>`).join('')}</select>`;
      else if (col.type==='date')     input = `<input type="date" class="form-input" name="${col.key}">`;
      else if (col.type==='number')   input = `<input type="number" class="form-input" name="${col.key}" step="0.01">`;
      else if (col.type==='textarea') input = `<textarea class="form-input" name="${col.key}" rows="2" placeholder="${col.label}"></textarea>`;
      else                            input = `<input type="text" class="form-input" name="${col.key}" placeholder="${col.label}">`;
      return `<div class="form-group"><label class="form-label">${col.label}</label>${input}</div>`;
    }).join('') + '</div>';
  openModal('addRowModal');
}
async function submitAddRow() {
  const key=addRowContext, schema=SCHEMAS[key]||[], form=document.getElementById('addRowForm');
  const row={_id:key+'_'+Date.now()};
  schema.forEach(col=>{
    if (col.type==='sno') { row.sno=(data[key]||[]).length+1; return; }
    const el=form.querySelector('[name="'+col.key+'"]');
    row[col.key]=el?el.value:'';
  });
  if (key==='lending') row.balance=String((parseFloat(row.amount)||0)-(parseFloat(row.returned)||0));
  if (!data[key]) data[key]=[];
  data[key].push(row);
  closeModal('addRowModal');
  markDirty();

  // Ask if user wants to add to master.json too
  if (accessToken && MASTER_FILE_ID) {
    const label = row.source || row.personName || row.name || 'new row';
    const alsoMaster = await showConfirmModal(
      '📋 Also add to Master?',
      `Add <strong>${label}</strong> to <code>master.json</code> as well?<br><span style="font-size:.75rem;color:var(--muted)">It will then appear in all future months created from master.</span>`
    );
    if (alsoMaster) {
      await syncAddToMaster(key, row);
    }
  }

  switchTab(currentTab);
}

async function syncAddToMaster(key, newRow) {
  try {
    showToast('Syncing new row to master.json...', 'info');
    const masterFileId = await resolveMasterFileId();
    const masterText   = await driveDownloadText(masterFileId);
    const masterData   = JSON.parse(masterText);

    if (!masterData[key]) masterData[key] = [];

    // Strip month-specific fields (dates, amounts) — keep structural fields only
    const monthOnlyFields = ['dateReceived','datePaid','dateGiven','dateStart','dateEnd','dueDate','date','amount','returned','balance','_id'];
    const masterRow = {};
    Object.keys(newRow).forEach(k => {
      masterRow[k] = monthOnlyFields.includes(k) ? '' : newRow[k];
    });
    masterRow.sno = masterData[key].length + 1;
    masterRow.status = 'Pending'; // always reset to Pending in master

    masterData[key].push(masterRow);

    await driveUploadJson(masterFileId, masterData, 'master.json');
    buildSchemasFromData(masterData);
    const label = newRow.source || newRow.personName || newRow.name || 'row';
    showToast(`✓ "${label}" added to master.json too`, 'success');
  } catch(e) {
    showToast('❌ Master sync error: ' + e.message, 'error');
    console.error(e);
  }
}

// ── MONTH PICKER ──────────────────────────────────────────────────────────
function showMonthPicker() {
  pickerMonth={...currentMonth};
  document.getElementById('yearDisplay').textContent=pickerMonth.year;
  renderMonthGrid(); openModal('monthModal');
}
function renderMonthGrid() {
  document.getElementById('monthGrid').innerHTML=MONTHS.map((m,i)=>
    `<div class="month-chip ${i===pickerMonth.month?'selected':''}" onclick="selMonth(${i})">${m.slice(0,3)}</div>`
  ).join('');
}
function selMonth(i) { pickerMonth.month=i; renderMonthGrid(); }
function changeYear(d) { pickerMonth.year+=d; document.getElementById('yearDisplay').textContent=pickerMonth.year; }
function applyMonth() {
  currentMonth={...pickerMonth}; updateMonthDisplay(); closeModal('monthModal');
  currentFileId=null; resetData(); setFileStatus(false); switchTab(currentTab);
}
function updateMonthDisplay() {
  document.getElementById('monthDisplay').textContent=MONTHS[currentMonth.month]+' '+currentMonth.year;
}

// ── SETTINGS ──────────────────────────────────────────────────────────────
function openSettingsModal() {
  document.getElementById('cfgClientId').value=CLIENT_ID;
  document.getElementById('cfgMasterId').value=MASTER_FILE_ID;
  document.getElementById('cfgFolderId').value=DEST_FOLDER_ID;
  openModal('settingsModal');
}
function openSetupFromSplash() { openSettingsModal(); }
function saveSettings() {
  const cid=document.getElementById('cfgClientId').value.trim();
  const mid=document.getElementById('cfgMasterId').value.trim();
  const fid=document.getElementById('cfgFolderId').value.trim();
  if (cid){ CLIENT_ID=cid;      localStorage.setItem('st_client_id',cid); }
  if (mid){ MASTER_FILE_ID=mid; localStorage.setItem('st_master_id',mid); }
  if (fid){ DEST_FOLDER_ID=fid; localStorage.setItem('st_folder_id',fid); }
  closeModal('settingsModal');
  showToast('✓ Settings saved!','success');
}

// ── THEME ─────────────────────────────────────────────────────────────────
function toggleTheme() {
  const isDay=document.body.classList.toggle('day');
  localStorage.setItem('st_theme', isDay?'day':'night');
}
function applyStoredTheme() {
  if (localStorage.getItem('st_theme')==='day') document.body.classList.add('day');
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function setFileStatus(linked) {
  const el=document.getElementById('fileStatus');
  el.className='file-status'+(linked?' linked':'');
  el.innerHTML=`<div class="dot"></div><span>${linked?getFileName():'No file'}</span>`;
}
function resetData() { data={}; SCHEMAS={}; }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

let toastTimer;
function showToast(msg, type='info') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'), 3500);
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  applyStoredTheme();
  updateMonthDisplay();
  renderMonthGrid();
  document.querySelectorAll('.modal-overlay').forEach(el=>{
    el.addEventListener('click', e=>{ if(e.target===el) el.classList.remove('open'); });
  });
});
