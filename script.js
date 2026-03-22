// ── CONFIG ────────────────────────────────────────────────────────────────
const DEFAULT_CLIENT_ID = '802226109271-praqff3gi21a2i90mp78bmn6a7999s9m.apps.googleusercontent.com';
const DEFAULT_MASTER_ID = '1HNzAmH7cP7CRMtQyb8XkkyB0ttkNKicw';
const DEFAULT_FOLDER_ID = '1FpSq1CKfMec2P3p15C8U7HFYgK-HLiNE';

let CLIENT_ID      = localStorage.getItem('st_client_id')  || DEFAULT_CLIENT_ID;
let MASTER_FILE_ID = localStorage.getItem('st_master_id')  || DEFAULT_MASTER_ID;
let DEST_FOLDER_ID = localStorage.getItem('st_folder_id')  || DEFAULT_FOLDER_ID;

const SCOPES = 'https://www.googleapis.com/auth/drive';
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

let tokenClient, accessToken, tokenExpiresAt = 0;
let currentMonth  = { month: new Date().getMonth(), year: new Date().getFullYear() };
let pickerMonth   = { ...currentMonth };
let currentTab    = 'dashboard';
let currentFileId = null;
let hasChanges    = false;
let addRowContext  = null;
let gisLoaded     = false;

// All data and schemas come from Drive — nothing hardcoded here
let data           = {};
let SCHEMAS        = {};
let SCHEMAS_MASTER = {};   // Persistent cache — survives row deletion

// ── CANONICAL SCHEMA DEFINITIONS ─────────────────────────────────────────
// Each section has a fixed, authoritative schema. This means schemas NEVER
// depend on rows existing in the data, eliminating the "empty section falls
// back to wrong sibling schema" bug. master.json drives select option values
// but NOT the column structure.
const CANONICAL_SCHEMAS = {
  income: [
    { key:'sno',             label:'#',                  type:'sno' },
    { key:'source',          label:'Source',             type:'text' },
    { key:'category',        label:'Category',           type:'text' },
    { key:'paymentMode',     label:'Payment Mode',       type:'select', opts:[] },
    { key:'accountReceived', label:'Account Received',   type:'select', opts:[] },
    { key:'dateReceived',    label:'Date Received',      type:'date' },
    { key:'amount',          label:'Amount (₹)',         type:'number' },
    { key:'status',          label:'Status',             type:'select', opts:['Paid','Pending','Delayed'] },
    { key:'month',           label:'Month',              type:'text' },
    { key:'remarks',         label:'Remarks',            type:'text' },
  ],
  savings: [
    { key:'sno',          label:'#',               type:'sno' },
    { key:'source',       label:'Source',          type:'text' },
    { key:'category',     label:'Category',        type:'text' },
    { key:'paymentMode',  label:'Payment Mode',    type:'select', opts:[] },
    { key:'accountUsed',  label:'Account Used',    type:'select', opts:[] },
    { key:'date',         label:'Date',            type:'date' },
    { key:'amount',       label:'Amount (₹)',      type:'number' },
    { key:'targetAmount', label:'Target Amount (₹)',type:'number' },
    { key:'status',       label:'Status',          type:'select', opts:['Saved','Pending','Withdrawn'] },
    { key:'remarks',      label:'Remarks',         type:'text' },
  ],
  fixed: [
    { key:'sno',             label:'#',                   type:'sno' },
    { key:'source',          label:'Source',              type:'text' },
    { key:'loanNumber',      label:'Loan Number',         type:'text' },
    { key:'totalLoanAmount', label:'Total Loan Amount (₹)',type:'number' },
    { key:'category',        label:'Category',            type:'text' },
    { key:'paymentMode',     label:'Payment Mode',        type:'select', opts:[] },
    { key:'dateToPay',       label:'Date To Pay',         type:'text' },
    { key:'dateStart',       label:'Date Start',          type:'date' },
    { key:'dateEnd',         label:'Date End',            type:'date' },
    { key:'datePaid',        label:'Date Paid',           type:'date' },
    { key:'amount',          label:'Amount (₹)',          type:'number' },
    { key:'status',          label:'Status',              type:'select', opts:['Paid','Pending','Delayed'] },
    { key:'pendingAmount',   label:'Pending Amount (₹)',  type:'number' },
    { key:'interestRate',    label:'Interest Rate',       type:'text' },
    { key:'remarks',         label:'Remarks',             type:'text' },
  ],
  semifixed: [
    { key:'sno',           label:'#',                  type:'sno' },
    { key:'source',        label:'Source',             type:'text' },
    { key:'loanNumber',    label:'Loan Number',        type:'text' },
    { key:'category',      label:'Category',           type:'text' },
    { key:'paymentMode',   label:'Payment Mode',       type:'select', opts:[] },
    { key:'dateToPay',     label:'Date To Pay',        type:'text' },
    { key:'dateStart',     label:'Date Start',         type:'date' },
    { key:'dateEnd',       label:'Date End',           type:'date' },
    { key:'datePaid',      label:'Date Paid',          type:'date' },
    { key:'amount',        label:'Amount (₹)',         type:'number' },
    { key:'status',        label:'Status',             type:'select', opts:['Paid','Pending','Delayed'] },
    { key:'pendingAmount', label:'Pending Amount (₹)', type:'number' },
    { key:'interestRate',  label:'Interest Rate',      type:'text' },
    { key:'remarks',       label:'Remarks',            type:'text' },
  ],
  variable: [
    { key:'sno',         label:'#',             type:'sno' },
    { key:'source',      label:'Source',        type:'text' },
    { key:'date',        label:'Date',          type:'date' },
    { key:'category',    label:'Category',      type:'text' },
    { key:'subcategory', label:'Subcategory',   type:'text' },
    { key:'paymentMode', label:'Payment Mode',  type:'select', opts:[] },
    { key:'accountUsed', label:'Account Used',  type:'select', opts:[] },
    { key:'description', label:'Description',   type:'textarea' },
    { key:'amount',      label:'Amount (₹)',    type:'number' },
    { key:'month',       label:'Month',         type:'text' },
    { key:'status',      label:'Status',        type:'select', opts:['Paid','Pending','Delayed'] },
    { key:'remarks',     label:'Remarks',       type:'text' },
  ],
  unexpected: [
    { key:'sno',         label:'#',             type:'sno' },
    { key:'source',      label:'Source',        type:'text' },
    { key:'date',        label:'Date',          type:'date' },
    { key:'category',    label:'Category',      type:'text' },
    { key:'subcategory', label:'Subcategory',   type:'text' },
    { key:'paymentMode', label:'Payment Mode',  type:'select', opts:[] },
    { key:'accountUsed', label:'Account Used',  type:'select', opts:[] },
    { key:'description', label:'Description',   type:'textarea' },
    { key:'amount',      label:'Amount (₹)',    type:'number' },
    { key:'month',       label:'Month',         type:'text' },
    { key:'status',      label:'Status',        type:'select', opts:['Paid','Pending','Delayed'] },
    { key:'remarks',     label:'Remarks',       type:'text' },
  ],
  lending: [
    { key:'sno',             label:'#',                  type:'sno' },
    { key:'personName',      label:'Person Name',        type:'text' },
    { key:'type',            label:'Type',               type:'select', opts:['Lent','Borrowed'] },
    { key:'mode',            label:'Mode',               type:'select', opts:[] },
    { key:'dateGiven',       label:'Date Given',         type:'date' },
    { key:'dueDate',         label:'Due Date',           type:'date' },
    { key:'interestRate',    label:'Interest Rate',      type:'text' },
    { key:'amount',          label:'Amount (₹)',         type:'number' },
    { key:'returned',        label:'Returned (₹)',       type:'number' },
    { key:'balance',         label:'Balance (₹)',        type:'readonly' },
    { key:'status',          label:'Status',             type:'select', opts:['Fully Paid','Partially Paid','Delayed'] },
    { key:'accountUsed',     label:'Account Used',       type:'select', opts:[] },
    { key:'remarks',         label:'Remarks',            type:'text' },
    { key:'contactRelation', label:'Contact / Relation', type:'text' },
  ],
};

// ── SCHEMA BUILDER ────────────────────────────────────────────────────────
// Uses canonical schemas as the structural backbone.
// Hydrates select options (except status) from actual master.json data values.
// This means schemas are ALWAYS correct even when sections are empty.
function buildSchemasFromData(masterObj) {
  const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending'];

  SCHEMAS = {};

  sections.forEach(section => {
    const rows = masterObj[section] || [];
    // Deep-clone canonical schema so we can safely mutate opts
    const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMAS[section] || [{ key:'sno', label:'#', type:'sno' }]));

    // Hydrate dynamic select options from data (skip status — it's fixed)
    schema.forEach(col => {
      if (col.type === 'select' && col.key !== 'status' && rows.length > 0) {
        const vals = [...new Set(rows.map(r => r[col.key]).filter(v => v && v !== ''))];
        if (vals.length > 0) col.opts = vals;
      }
    });

    SCHEMAS[section] = schema;
  });

  // Cache a deep copy so empty-section schemas survive row deletion
  SCHEMAS_MASTER = JSON.parse(JSON.stringify(SCHEMAS));
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
  // Google tokens expire in 3600s; refresh 5 min early to be safe
  tokenExpiresAt = Date.now() + ((resp.expires_in || 3600) - 300) * 1000;
  onSignedIn();
}

// Call this before every Drive API request to silently refresh if near-expired
function ensureFreshToken() {
  return new Promise((resolve, reject) => {
    if (Date.now() < tokenExpiresAt) { resolve(); return; }
    // Token expired or expiring — request a new one silently
    try {
      tokenClient.requestAccessToken({ prompt: '' });
      // onTokenResponse will fire and update accessToken/tokenExpiresAt
      // We resolve after a short wait; Drive calls will then use fresh token
      const check = setInterval(() => {
        if (Date.now() < tokenExpiresAt) { clearInterval(check); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(check); reject(new Error('Token refresh timed out. Please sign in again.')); }, 8000);
    } catch(e) { reject(e); }
  });
}
function onSignedIn() {
  document.getElementById('splash').style.display='none';
  document.getElementById('app').classList.add('visible');
  updateMonthDisplay();
  switchTab('dashboard');
  showToast('✓ Signed in!','success');
  // Auto-load current month file
  loadOrCreateCurrentMonth();
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
  await ensureFreshToken();
  const p = new URLSearchParams({ q, fields:'files(id,name,mimeType)', pageSize:'10' });
  const r = await fetch('https://www.googleapis.com/drive/v3/files?'+p, { headers:H() });
  if (!r.ok) throw new Error('List failed: '+r.status);
  return (await r.json()).files || [];
}
async function driveDownloadText(fileId) {
  await ensureFreshToken();
  if (!accessToken) throw new Error('Not authenticated');

  const baseUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  // Try 1: standard download (owned files)
  const r1 = await fetch(`${baseUrl}?alt=media&supportsAllDrives=true`, { headers: H() });
  if (r1.ok) return r1.text();

  // Try 2: with acknowledgeAbuse (shared/external files that trigger virus scan warning)
  const r2 = await fetch(`${baseUrl}?alt=media&acknowledgeAbuse=true&supportsAllDrives=true`, { headers: H() });
  if (r2.ok) return r2.text();

  // Both failed — surface a clear error
  let msg = 'HTTP ' + r2.status;
  try { const e = await r2.json(); msg = e.error?.message || msg; } catch(_){}

  if (r2.status === 404) throw new Error(
    'master.json not found (404). Open ⚙️ Settings and paste the correct File ID from your Drive share link.'
  );
  if (r2.status === 403) throw new Error(
    'Access denied (403). In Google Drive, right-click master.json → Share → set to "Anyone with the link" → Viewer. Then retry.'
  );
  throw new Error('Download failed: ' + msg);
}
async function driveUploadJson(fileId, obj, name) {
  await ensureFreshToken();
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
  await ensureFreshToken();
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
    // Use MASTER_FILE_ID directly — driveDownloadText handles all fallbacks
    if (!MASTER_FILE_ID) throw new Error('No Master File ID set. Open ⚙️ Settings and paste your master.json file ID.');
    showToast('⬇️ Downloading master.json (ID: ' + MASTER_FILE_ID.slice(0,8) + '...)','info');
    const masterText = await driveDownloadText(MASTER_FILE_ID);
    const masterData = JSON.parse(masterText);

    // Build schemas from master structure
    buildSchemasFromData(masterData);

    const newData = JSON.parse(JSON.stringify(masterData));
    newData._month   = MONTHS[currentMonth.month];
    newData._year    = currentMonth.year;
    newData._created = new Date().toISOString();

    showToast('☁️ Creating ' + name + ' in Drive...','info');
    const result = await driveCreateJson(name, newData, DEST_FOLDER_ID);
    currentFileId = result.id;

    loadDataFromObject(newData);
    setFileStatus(true);
    switchTab(currentTab);
    showToast('✓ ' + name + ' created from master!','success');
  } catch(e) {
    showToast('❌ ' + e.message, 'error');
    console.error('createFromMaster error:', e);
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
  const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending'];
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
    const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending'];
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
  // If we have an ID, trust it — try to directly download to verify access.
  // A metadata-only fetch can return 200 even when download is forbidden.
  if (MASTER_FILE_ID) {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${MASTER_FILE_ID}?alt=media`,
      { headers: H() }
    );
    if (r.ok) return MASTER_FILE_ID;
    // 404 = wrong ID, 403 = no access — fall through to search
    if (r.status === 403) throw new Error(
      'Access denied to master.json. Open the file in Google Drive, click Share → change to "Anyone with the link can view", then retry.'
    );
  }
  // ID missing or 404 — search Drive by filename (only finds files you own)
  showToast('Searching Drive for master.json...','info');
  const q = `name='master.json' and trashed=false and mimeType='application/json'`;
  const files = await driveList(q);
  if (files.length === 0) throw new Error(
    'master.json not found. Check the File ID in ⚙️ Settings — paste the ID from your Drive share link.'
  );
  const foundId = files[0].id;
  MASTER_FILE_ID = foundId;
  localStorage.setItem('st_master_id', foundId);
  showToast('✓ Found master.json — ID updated in Settings','success');
  return foundId;
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
    const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending'];
    const sheetNames = {income:'Income',savings:'Savings',fixed:'Fixed Expenses',semifixed:'Semi Fixed Exp',
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
    const svi = sumIf(data.savings||[],'amount','status','Saved');
    const te = fi + si + vi + ui;
    const nb = ti - te - svi;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Salary Tracker — '+MONTHS[currentMonth.month]+' '+currentMonth.year],[''],
      ['Total Income', ti, '', 'Paid Income', pi, '', 'Pending Income', pndI],[''],
      ['Total Expenses (Paid)', te, '', 'Savings (Saved)', svi, '', 'Net Balance', nb],[''],
      ['Fixed Expenses (Paid)', fi],
      ['Semi Fixed Expenses (Paid)', si],
      ['Variable Expenses (Paid)', vi],
      ['Unexpected Expenses (Paid)', ui],
      ['Savings (Saved)', svi]
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
function fmt(n)             { return '₹'+parseFloat(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }

// ── TABS ─────────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  const tabs = ['dashboard','income','savings','fixed','semifixed','variable','unexpected','lending'];
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',tabs[i]===tab));
  const c = document.getElementById('content');
  const titles = {income:'Income',savings:'Savings',fixed:'Fixed Expenses',semifixed:'Semi Fixed Expenses',
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
  const svi = sumIf(data.savings||[],'amount','status','Saved');
  const savingsTarget = sum(data.savings||[], 'targetAmount');
  const savingsPct = savingsTarget > 0 ? Math.min(100, (svi / savingsTarget) * 100) : 0;
  const te = fi + si + vi + ui;

  // Net Balance = Total Income - Total Paid Expenses (matches Excel =C4-C15)
  const nb = ti - te - svi;
  const pct = ti > 0 ? Math.min(100, ((te + svi) / ti) * 100) : 0;

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
      <div class="stat-card" style="background:linear-gradient(135deg,rgba(0,229,160,.08),rgba(0,229,160,.03));border-color:rgba(0,229,160,.25)">
        <div class="stat-label">Total Savings</div>
        <div class="stat-value" style="color:var(--accent)">${fmt(svi)}</div>
        <div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Saved: <span style="color:var(--paid)">${fmt(svi)}</span> &nbsp; Pending: <span style="color:var(--pending)">${fmt(sumIf(data.savings||[],'amount','status','Pending'))}</span></div>
        ${savingsTarget > 0 ? `
        <div style="margin-top:.55rem">
          <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--muted);margin-bottom:.25rem">
            <span>Target: ${fmt(savingsTarget)}</span>
            <span style="color:var(--accent);font-weight:700">${savingsPct.toFixed(1)}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${savingsPct}%;background:linear-gradient(90deg,var(--accent),var(--accent))"></div></div>
        </div>` : ''}
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
      <div class="breakdown-table-wrap"><table style="min-width:unset;width:100%">
        <thead><tr><th>Category</th><th style="text-align:right">Paid</th><th style="text-align:right">Pending</th><th style="text-align:right">Delayed</th></tr></thead>
        <tbody>
          ${[
            ['Fixed',      fi, sumIf(data.fixed||[],    'amount','status','Pending'), sumIf(data.fixed||[],    'amount','status','Delayed')],
            ['Semi Fixed', si, sumIf(data.semifixed||[],'amount','status','Pending'), sumIf(data.semifixed||[],'amount','status','Delayed')],
            ['Variable',   vi, sumIf(data.variable||[], 'amount','status','Pending'), sumIf(data.variable||[], 'amount','status','Delayed')],
            ['Unexpected', ui, sumIf(data.unexpected||[],'amount','status','Pending'),sumIf(data.unexpected||[],'amount','status','Delayed')],
            ['Savings',    svi, sumIf(data.savings||[], 'amount','status','Pending'), 0]
          ].map(([cat,p,pnd,del])=>`<tr>
            <td>${cat}</td>
            <td style="text-align:right;color:var(--paid);font-family:var(--font-mono)">${p>0?fmt(p):'-'}</td>
            <td style="text-align:right;color:var(--pending);font-family:var(--font-mono)">${pnd>0?fmt(pnd):'-'}</td>
            <td style="text-align:right;color:var(--delayed);font-family:var(--font-mono)">${del>0?fmt(del):'-'}</td>
          </tr>`).join('')}
          <tr style="border-top:1px solid var(--border);font-weight:700">
            <td>Total</td>
            <td style="text-align:right;color:var(--paid);font-family:var(--font-mono)">${fmt(te+svi)}</td>
            <td style="text-align:right;color:var(--pending);font-family:var(--font-mono)">${fmt(sumIf(data.fixed||[],'amount','status','Pending')+sumIf(data.semifixed||[],'amount','status','Pending')+sumIf(data.variable||[],'amount','status','Pending')+sumIf(data.unexpected||[],'amount','status','Pending')+sumIf(data.savings||[],'amount','status','Pending'))}</td>
            <td style="text-align:right;color:var(--delayed);font-family:var(--font-mono)">${fmt(sumIf(data.fixed||[],'amount','status','Delayed')+sumIf(data.semifixed||[],'amount','status','Delayed')+sumIf(data.variable||[],'amount','status','Delayed')+sumIf(data.unexpected||[],'amount','status','Delayed'))}</td>
          </tr>
        </tbody>
      </table></div>
    </div>`;
}

function renderSheet(c, key, title) {
  const rows    = data[key]    || [];
  // If all rows have been deleted, restore schema from master cache so new rows get correct headers
  if (rows.length === 0 && SCHEMAS_MASTER[key] && SCHEMAS_MASTER[key].length > 1) {
    SCHEMAS[key] = JSON.parse(JSON.stringify(SCHEMAS_MASTER[key]));
  }
  const schema  = SCHEMAS[key] || [];
  // Status colour coding matches Excel status values
  const stColor = {
    'Paid':         'var(--paid)',
    'Pending':      'var(--pending)',
    'Delayed':      'var(--delayed)',
    'Partially Paid':'var(--accent3)',
    'Fully Paid':   'var(--paid)'
  };

  const thead = schema.map(col=>`<th>${col.label}</th>`).join('')+'<th></th>';
  const tbody = rows.length===0 ? '' : rows.map((row,ri)=>{
      const id = row._id;
      return `<tr data-id="${id}">${schema.map(col=>{
        const v=(row[col.key]??'').toString().replace(/"/g,'&quot;');
        if (col.type==='sno')      return `<td style="color:var(--muted);font-size:.68rem;min-width:22px">${ri+1}</td>`;
        if (col.type==='readonly') return `<td style="font-family:var(--font-mono);font-size:.8rem;color:var(--accent3);min-width:80px;text-align:right">${v||'—'}</td>`;
        if (col.type==='select')   return `<td><select class="inline-select" style="color:${stColor[row[col.key]]||'var(--text)'}" onchange="updateCell('${key}','${id}','${col.key}',this.value)">${(col.opts||[]).map(o=>`<option ${o===row[col.key]?'selected':''}>${o}</option>`).join('')}</select></td>`;
        if (col.type==='number')   return `<td><input class="inline-input" type="number" step="0.01" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value)" style="width:90px;text-align:right"></td>`;
        if (col.type==='date')     return `<td><input class="inline-input" type="date" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value)" style="width:118px"></td>`;
        if (col.type==='textarea') return `<td><input class="inline-input" type="text" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value)" style="min-width:120px"></td>`;
        return `<td><input class="inline-input" type="text" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value)" style="min-width:65px"></td>`;
      }).join('')}<td><button class="delete-btn" onclick="deleteRow('${key}','${id}')">✕</button></td></tr>`;
    }).join('');

  // Empty state: show table with headers + a "no entries" row so column structure is always visible
  const emptyTbody = rows.length===0
    ? `<tr><td colspan="${schema.length+1}" style="text-align:center;padding:2rem 1rem;color:var(--muted);font-size:.82rem">No entries yet — tap ➕ Add Entry to get started.</td></tr>`
    : '';

  c.innerHTML = `
    <div class="add-entry-center">
      <button class="add-entry-btn" onclick="showAddRow('${key}','${title}')">➕ Add Entry</button>
    </div>
    <div class="section-head">${title}</div>
    <div class="sheet-table">
      <div class="table-scroll"><table id="dataTable"><thead><tr>${thead}</tr></thead><tbody>${rows.length===0 ? emptyTbody : tbody}</tbody></table></div>
    </div>`;

  // Only init DataTables when there are actual rows — prevents DataTables from interfering with empty-state row
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
function updateCell(key, rowId, field, value) {
  const row = data[key].find(r => r._id === rowId);
  if (!row) return;
  row[field] = value;
  if (key==='lending') {
    row.balance = String((parseFloat(row.amount)||0)-(parseFloat(row.returned)||0));
  }
  markDirty();
}
async function deleteRow(key, rowId) {
  const row = data[key].find(r => r._id === rowId);
  if (!row) return;
  const label = row.source || row.personName || row.name || `Row`;

  // Custom confirm modal — ask about monthly file first
  const confirmed = await showConfirmModal(
    '🗑️ Delete Row',
    `Delete <strong>${label}</strong> from this month's file?`
  );
  if (!confirmed) return;

  // Remove from monthly data using _id — safe across DataTables pagination
  const idx = data[key].findIndex(r => r._id === rowId);
  if (idx === -1) return;
  data[key].splice(idx, 1);
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
async function discardChanges() {
  const ok = await showConfirmModal('Discard Changes?', 'All unsaved changes will be lost. This cannot be undone.');
  if (!ok) return;
  hasChanges=false; document.getElementById('syncBar').classList.remove('visible');
  if (currentFileId) loadJsonData(); else { resetData(); switchTab(currentTab); }
}

// ── ADD ROW ───────────────────────────────────────────────────────────────
function showAddRow(key, title) {
  addRowContext = key;
  document.getElementById('addRowTitle').textContent = 'Add '+title;
  const schema = (SCHEMAS[key] || []).filter(c => c.type !== 'sno' && c.type !== 'readonly');
  const requiredKeys = ['source','personName','name','amount'];
  document.getElementById('addRowForm').innerHTML = '<div class="form-grid">' +
    schema.map(col => {
      const isRequired = requiredKeys.includes(col.key);
      const reqMark = isRequired ? ' <span style="color:var(--accent2)">*</span>' : '';
      let input = '';
      if      (col.type==='select')   input = `<select class="form-select" name="${col.key}"><option value="">Select...</option>${(col.opts||[]).map(o=>`<option>${o}</option>`).join('')}</select>`;
      else if (col.type==='date')     input = `<input type="date" class="form-input" name="${col.key}">`;
      else if (col.type==='number')   input = `<input type="number" class="form-input" name="${col.key}" step="0.01" min="0">`;
      else if (col.type==='textarea') input = `<textarea class="form-input" name="${col.key}" rows="2" placeholder="${col.label}"></textarea>`;
      else                            input = `<input type="text" class="form-input" name="${col.key}" placeholder="${col.label}">`;
      return `<div class="form-group"><label class="form-label">${col.label}${reqMark}</label>${input}</div>`;
    }).join('') + '</div><p style="font-size:.67rem;color:var(--muted);margin-top:.5rem"><span style="color:var(--accent2)">*</span> Required</p>';
  openModal('addRowModal');
}
async function submitAddRow() {
  const key=addRowContext, schema=SCHEMAS[key]||[], form=document.getElementById('addRowForm');

  // ── Validation ────────────────────────────────────────────────────────
  // Clear previous error states
  form.querySelectorAll('.form-input,.form-select').forEach(el => el.classList.remove('input-error'));

  let hasError = false;

  // Require a name/source field
  const nameField = form.querySelector('[name="source"],[name="personName"],[name="name"]');
  if (nameField && !nameField.value.trim()) {
    nameField.classList.add('input-error');
    nameField.focus();
    showToast('❌ Please enter a name / source', 'error');
    hasError = true;
  }

  // Require amount > 0
  const amountField = form.querySelector('[name="amount"]');
  if (amountField && (isNaN(parseFloat(amountField.value)) || parseFloat(amountField.value) <= 0)) {
    amountField.classList.add('input-error');
    if (!hasError) { amountField.focus(); showToast('❌ Amount must be greater than 0', 'error'); }
    hasError = true;
  }

  if (hasError) return;
  // ─────────────────────────────────────────────────────────────────────

  const row={_id:key+'_'+Date.now()};
  schema.forEach(col=>{
    if (col.type==='sno') { row.sno=(data[key]||[]).length+1; return; }
    if (col.type==='readonly') return; // computed fields — skip
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
function changeYear(d) {
  const newYear = pickerMonth.year + d;
  const currentYear = new Date().getFullYear();
  if (newYear < 2020 || newYear > currentYear + 1) return;
  pickerMonth.year = newYear;
  document.getElementById('yearDisplay').textContent=pickerMonth.year;
}
async function applyMonth() {
  if (hasChanges) {
    const ok = await showConfirmModal(
      '⚠️ Unsaved Changes',
      'You have unsaved changes in this month. Switching months will <strong>discard them</strong>. Continue?'
    );
    if (!ok) { closeModal('monthModal'); return; }
  }
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
  // Migrate: if localStorage has the old master ID, replace with new one
  const OLD_MASTER_ID = '1w91ZLfxhFA9yTorZHrVQGSQ9k0U8c0ny';
  if (localStorage.getItem('st_master_id') === OLD_MASTER_ID) {
    localStorage.setItem('st_master_id', DEFAULT_MASTER_ID);
    MASTER_FILE_ID = DEFAULT_MASTER_ID;
  }

  applyStoredTheme();
  updateMonthDisplay();
  renderMonthGrid();
  document.querySelectorAll('.modal-overlay').forEach(el=>{
    el.addEventListener('click', e=>{ if(e.target===el) el.classList.remove('open'); });
  });
});
