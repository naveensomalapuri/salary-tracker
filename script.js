
// ── HARDCODED DEFAULTS ───────────────────────────────────────────────────
const DEFAULT_CLIENT_ID = '802226109271-praqff3gi21a2i90mp78bmn6a7999s9m.apps.googleusercontent.com';
const DEFAULT_MASTER_ID = '1G-TZIlJPtSygE7jDmDDbJsuAr8pRGP8T';
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

let data = { income:[], fixed:[], semifixed:[], variable:[], unexpected:[], lending:[] };

// ── SCHEMAS ───────────────────────────────────────────────────────────────
const SCHEMAS = {
  income:[
    {key:'sno',            label:'#',          type:'sno'},
    {key:'source',         label:'Source',     type:'text'},
    {key:'category',       label:'Category',   type:'text'},
    {key:'paymentMode',    label:'Mode',       type:'select', opts:['Bank Transfer','Cash','Auto-Debit','UPI','Credit Card']},
    {key:'accountReceived',label:'Account',    type:'text'},
    {key:'dateReceived',   label:'Date Recv',  type:'date'},
    {key:'amount',         label:'Amount (₹)', type:'number'},
    {key:'status',         label:'Status',     type:'select', opts:['Paid','Pending','Delayed']},
    {key:'month',          label:'Month',      type:'text'},
    {key:'remarks',        label:'Remarks',    type:'text'}
  ],
  fixed:[
    {key:'sno',             label:'#',          type:'sno'},
    {key:'source',          label:'Source',     type:'text'},
    {key:'loanNumber',      label:'Loan No.',   type:'text'},
    {key:'totalLoanAmount', label:'Total Loan', type:'number'},
    {key:'category',        label:'Category',   type:'text'},
    {key:'paymentMode',     label:'Mode',       type:'select', opts:['Bank Transfer','Auto-Debit','Cash','SBI Bank','ICICI Bank','BOI Bank','UPI']},
    {key:'dateToPay',       label:'Due Day',    type:'text'},
    {key:'dateStart',       label:'Start',      type:'date'},
    {key:'dateEnd',         label:'End',        type:'date'},
    {key:'datePaid',        label:'Paid On',    type:'date'},
    {key:'amount',          label:'Amount (₹)', type:'number'},
    {key:'status',          label:'Status',     type:'select', opts:['Paid','Pending','Delayed']},
    {key:'pendingAmount',   label:'Pending (₹)',type:'number'},
    {key:'interestRate',    label:'Interest',   type:'text'},
    {key:'remarks',         label:'Remarks',    type:'text'}
  ],
  semifixed:[
    {key:'sno',           label:'#',          type:'sno'},
    {key:'source',        label:'Source',     type:'text'},
    {key:'loanNumber',    label:'Ref No.',    type:'text'},
    {key:'category',      label:'Category',   type:'text'},
    {key:'paymentMode',   label:'Mode',       type:'select', opts:['Bank Transfer','Auto-Debit','Cash','UPI','RBL CC']},
    {key:'dateToPay',     label:'Due Day',    type:'text'},
    {key:'dateStart',     label:'Start',      type:'date'},
    {key:'dateEnd',       label:'End',        type:'date'},
    {key:'datePaid',      label:'Paid On',    type:'date'},
    {key:'amount',        label:'Amount (₹)', type:'number'},
    {key:'status',        label:'Status',     type:'select', opts:['Paid','Pending','Delayed']},
    {key:'pendingAmount', label:'Pending (₹)',type:'number'},
    {key:'interestRate',  label:'Interest',   type:'text'},
    {key:'remarks',       label:'Remarks',    type:'text'}
  ],
  variable:[
    {key:'sno',         label:'#',           type:'sno'},
    {key:'source',      label:'Source',      type:'text'},
    {key:'date',        label:'Date',        type:'date'},
    {key:'category',    label:'Category',    type:'text'},
    {key:'subcategory', label:'Subcategory', type:'text'},
    {key:'paymentMode', label:'Mode',        type:'select', opts:['Bank Transfer','Cash','Auto-Debit','UPI','RBL CC','ICICI CC']},
    {key:'accountUsed', label:'Account',     type:'text'},
    {key:'description', label:'Description', type:'textarea'},
    {key:'amount',      label:'Amount (₹)',  type:'number'},
    {key:'month',       label:'Month',       type:'text'},
    {key:'status',      label:'Status',      type:'select', opts:['Paid','Pending','Delayed']},
    {key:'remarks',     label:'Remarks',     type:'text'}
  ],
  unexpected:[
    {key:'sno',         label:'#',           type:'sno'},
    {key:'source',      label:'Source',      type:'text'},
    {key:'date',        label:'Date',        type:'date'},
    {key:'category',    label:'Category',    type:'text'},
    {key:'subcategory', label:'Subcategory', type:'text'},
    {key:'paymentMode', label:'Mode',        type:'select', opts:['Bank Transfer','Cash','Auto-Debit','UPI','RBL CC','ICICI CC']},
    {key:'accountUsed', label:'Account',     type:'text'},
    {key:'description', label:'Description', type:'text'},
    {key:'amount',      label:'Amount (₹)',  type:'number'},
    {key:'month',       label:'Month',       type:'text'},
    {key:'status',      label:'Status',      type:'select', opts:['Paid','Pending','Delayed']},
    {key:'remarks',     label:'Remarks',     type:'text'}
  ],
  lending:[
    {key:'sno',         label:'#',            type:'sno'},
    {key:'personName',  label:'Person',       type:'text'},
    {key:'contact',     label:'Contact',      type:'text'},
    {key:'type',        label:'Type',         type:'select', opts:['Lent','Borrowed']},
    {key:'mode',        label:'Mode',         type:'select', opts:['Bank Transfer','Cash','UPI','IDFC CC','RBL CC','ICICI CC']},
    {key:'dateGiven',   label:'Date Given',   type:'date'},
    {key:'dueDate',     label:'Due Date',     type:'date'},
    {key:'interestRate',label:'Interest',     type:'text'},
    {key:'amount',      label:'Amount (₹)',   type:'number'},
    {key:'returned',    label:'Returned (₹)', type:'number'},
    {key:'balance',     label:'Balance (₹)',  type:'number'},
    {key:'status',      label:'Status',       type:'select', opts:['Fully Paid','Partially Paid','Pending']},
    {key:'accountUsed', label:'Account',      type:'text'},
    {key:'remarks',     label:'Remarks',      type:'text'}
  ]
};

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

// ── DRIVE REST API (fetch, OAuth token only) ──────────────────────────────
const H = () => ({ 'Authorization':'Bearer '+accessToken });

async function driveList(q) {
  const p = new URLSearchParams({ q, fields:'files(id,name,mimeType)', pageSize:'10' });
  const r = await fetch('https://www.googleapis.com/drive/v3/files?'+p, { headers:H() });
  if (!r.ok) throw new Error('List failed: '+r.status);
  return (await r.json()).files || [];
}
async function driveCopy(fileId, name, folderId) {
  const body = { name }; if (folderId) body.parents=[folderId];
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name`, {
    method:'POST', headers:{...H(),'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Copy failed: '+r.status+' '+(await r.text()));
  return r.json();
}
async function driveDownloadText(fileId){

  if(!accessToken){
    throw new Error("User not authenticated");
  }

  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers:{
        Authorization: "Bearer " + accessToken
      }
    }
  );

  if(!r.ok){
    const err = await r.text();
    throw new Error("Drive download failed: " + err);
  }

  return r.text();
}
async function driveUploadJson(fileId, obj, name) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type:'application/json' });
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({name})], {type:'application/json'}));
  form.append('file', blob);
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
    method:'PATCH', headers:H(), body:form
  });
  if (!r.ok) throw new Error('Upload failed: '+r.status+' '+(await r.text()));
  return r.json();
}
async function driveCreateJson(name, obj, folderId) {
  // Create new file with content
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type:'application/json' });
  const meta = { name, mimeType:'application/json' };
  if (folderId) meta.parents = [folderId];
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], {type:'application/json'}));
  form.append('file', blob);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method:'POST', headers:H(), body:form
  });
  if (!r.ok) throw new Error('Create failed: '+r.status+' '+(await r.text()));
  return r.json();
}

// ── FILE NAMES ────────────────────────────────────────────────────────────
function getFileName()       { return `${MONTHS[currentMonth.month]}-${currentMonth.year}_Salary_Tracker.json`; }
function getMasterFileName() { return 'master.json'; }

// ── LOAD / CREATE ─────────────────────────────────────────────────────────
async function loadOrCreateCurrentMonth() {
  if (!accessToken)    { showToast('Please sign in first','error'); return; }
  if (!MASTER_FILE_ID) { showToast('Set Master JSON File ID in ⚙️ Settings first','error'); openSettingsModal(); return; }

  const name = getFileName();
  showToast('🔍 Looking for '+name+'...','info');
  try {
    // Search for this month's JSON in the destination folder
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

async function createFromMaster(name) {
  showToast('📋 Creating new month file...','info');
  try {
    let masterData;

    // Try to download master.json from Drive first (works if file is in same account)
    if (MASTER_FILE_ID) {
      try {
        const masterText = await driveDownloadText(MASTER_FILE_ID);
        masterData = JSON.parse(masterText);
        showToast('✓ Master template loaded from Drive','info');
      } catch(e) {
        // File not accessible (different account / not shared) — fall back to built-in template
        console.warn('Master file not accessible, using built-in template:', e.message);
        masterData = getBuiltInMasterData();
      }
    } else {
      masterData = getBuiltInMasterData();
    }

    // Stamp with current month
    const newData = JSON.parse(JSON.stringify(masterData));
    newData._month   = MONTHS[currentMonth.month];
    newData._year    = currentMonth.year;
    newData._created = new Date().toISOString();

    // Create new JSON file in destination folder
    const result = await driveCreateJson(name, newData, DEST_FOLDER_ID);
    currentFileId = result.id;

    loadDataFromObject(newData);
    setFileStatus(true);
    switchTab(currentTab);
    showToast('✓ '+name+' created!','success');
  } catch(e) {
    showToast('❌ Create error: '+e.message,'error');
    console.error(e);
  }
}

// Built-in master template — exact copy of your master.json
// Used as fallback when Drive master file isn't accessible
function getBuiltInMasterData() {
  return {
    "_version": 1,
    "_description": "Salary Tracker Master Template - Naveen Somalapuri",
    "income": [
      {"sno":1,"source":"Naveen","category":"Salary","paymentMode":"Bank Transfer","accountReceived":"ICICI","dateReceived":"","amount":"","status":"Pending","month":"","remarks":"Hide7906rs home knows 35677rs"},
      {"sno":2,"source":"Dad","category":"","paymentMode":"Bank Transfer","accountReceived":"","dateReceived":"","amount":"","status":"Delayed","month":"","remarks":""},
      {"sno":3,"source":"Mom","category":"","paymentMode":"Cash","accountReceived":"","dateReceived":"","amount":"","status":"Delayed","month":"","remarks":""}
    ],
    "fixed": [
      {"sno":1,"source":"FED","loanNumber":"75007600354653","totalLoanAmount":"","category":"","paymentMode":"SBI Bank","dateToPay":"5th","dateStart":"","dateEnd":"","datePaid":"","amount":"2708","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":2,"source":"HDB","loanNumber":"52565440","totalLoanAmount":"","category":"","paymentMode":"SBI Bank","dateToPay":"4th","dateStart":"","dateEnd":"","datePaid":"","amount":"4426","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":3,"source":"SBI","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"ICICI Bank","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"1619","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":4,"source":"AXIS MAX LIFE INSURANCE","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"18th","dateStart":"","dateEnd":"","datePaid":"","amount":"1080","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":5,"source":"RBL","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"1751.83","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":6,"source":"IDFC (Nanna)","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"2187","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":7,"source":"TVS","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"BOI Bank","dateToPay":"3rd","dateStart":"","dateEnd":"","datePaid":"","amount":"5453","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":8,"source":"ICICI","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"1955.43","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":9,"source":"ICICI","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"2036.9","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":10,"source":"ICICI","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"1765.44","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":11,"source":"RBL (For Dad)","loanNumber":"","totalLoanAmount":"16000","category":"","paymentMode":"","dateToPay":"","dateStart":"2025-12-02","dateEnd":"","datePaid":"","amount":"1593.04","status":"Pending","pendingAmount":"","interestRate":"25% + 18%GST on interest","remarks":"Minimum due 2088"},
      {"sno":12,"source":"Naveen Hided Extra Increment amount","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"7906","status":"Pending","pendingAmount":"","interestRate":"16% + 18%GST","remarks":"Minimum due 2547"},
      {"sno":13,"source":"Park Fee","loanNumber":"","totalLoanAmount":"","category":"","paymentMode":"","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"200","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":14,"source":"IDFC (For Dad)","loanNumber":"","totalLoanAmount":"15574","category":"","paymentMode":"","dateToPay":"","dateStart":"2025-12-20","dateEnd":"2026-11-20","datePaid":"","amount":"1413.05","status":"Pending","pendingAmount":"","interestRate":"","remarks":""}
    ],
    "semifixed": [
      {"sno":1,"source":"Room Rent","loanNumber":"","category":"","paymentMode":"Auto-Debit","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":2,"source":"Gas Bill","loanNumber":"","category":"","paymentMode":"Cash","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":3,"source":"Amma Mobile Recharge (Jio)","loanNumber":"","category":"","paymentMode":"Bank Transfer","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":4,"source":"Nanna Mobile Recharge (Airtel)","loanNumber":"","category":"","paymentMode":"Cash","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":5,"source":"Ashwini Mobile Recharge (Jio)","loanNumber":"","category":"","paymentMode":"Bank Transfer","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":6,"source":"Garbage Bill","loanNumber":"","category":"","paymentMode":"Bank Transfer","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"","status":"Pending","pendingAmount":"","interestRate":"","remarks":""},
      {"sno":7,"source":"Internet Bill","loanNumber":"","category":"","paymentMode":"Bank Transfer","dateToPay":"","dateStart":"","dateEnd":"","datePaid":"","amount":"","status":"Pending","pendingAmount":"","interestRate":"","remarks":""}
    ],
    "variable": [
      {"sno":1,"source":"Nanna","date":"","category":"","subcategory":"","paymentMode":"Bank Transfer","accountUsed":"SBI","description":"Every month gives to dad","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":2,"source":"Amazon Pay Later","date":"","category":"","subcategory":"","paymentMode":"Auto-Debit","accountUsed":"BOI","description":"Mobile recharges and small expenses","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":3,"source":"Weekly market 2nd week","date":"","category":"","subcategory":"","paymentMode":"Bank Transfer","accountUsed":"ICICI","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":4,"source":"Weekly market 3rd week","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":5,"source":"Weekly market 4th week","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":6,"source":"Milk Packet, Raja kayanna, RRR kayanna","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":7,"source":"Devudi gurchi Karuchu","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":8,"source":"Naveen Bus Charges For Office","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":9,"source":"Naveen Metro Charges For Office","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":10,"source":"Nanna Bike Petrol","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":11,"source":"Naveen Daily Eggs (30)","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":12,"source":"Amma Kinley Soda","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":13,"source":"Sunday hair colour","date":"","category":"","subcategory":"","paymentMode":"","accountUsed":"","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":14,"source":"Bore Bill","date":"","category":"","subcategory":"","paymentMode":"Bank Transfer","accountUsed":"HDFC","description":"","amount":"","month":"","status":"Pending","remarks":""},
      {"sno":15,"source":"Grocery","date":"","category":"","subcategory":"","paymentMode":"Bank Transfer","accountUsed":"HDFC","description":"","amount":"","month":"","status":"Pending","remarks":""}
    ],
    "unexpected": [],
    "lending": [
      {"sno":1,"personName":"","contact":"","type":"Lent","mode":"IDFC CC","dateGiven":"","dueDate":"","interestRate":"","amount":"","returned":"","balance":"","status":"Partially Paid","accountUsed":"","remarks":""},
      {"sno":2,"personName":"","contact":"","type":"Lent","mode":"Bank Transfer","dateGiven":"","dueDate":"","interestRate":"","amount":"","returned":"","balance":"","status":"Partially Paid","accountUsed":"","remarks":""}
    ]
  };
}

async function loadJsonData() {
  try {
    const text = await driveDownloadText(currentFileId);
    const obj  = JSON.parse(text);
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
  const keys = ['income','fixed','semifixed','variable','unexpected','lending'];
  keys.forEach(k => {
    data[k] = (obj[k] || []).map((row, i) => ({
      ...row,
      _id: row._id || (k + '_' + i + '_' + Date.now())
    }));
  });
}

// ── SAVE ─────────────────────────────────────────────────────────────────
async function saveToGDrive() {
  if (!currentFileId) { await loadOrCreateCurrentMonth(); if (!currentFileId) return; }
  const btn = document.getElementById('saveBtn');
  btn.innerHTML = '<div class="spinner"></div>';
  btn.disabled = true;
  try {
    const payload = {
      _version: 1,
      _month:   MONTHS[currentMonth.month],
      _year:    currentMonth.year,
      _saved:   new Date().toISOString(),
      income:      data.income,
      fixed:       data.fixed,
      semifixed:   data.semifixed,
      variable:    data.variable,
      unexpected:  data.unexpected,
      lending:     data.lending
    };
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

// ── EXPORT TO EXCEL ───────────────────────────────────────────────────────
function exportExcel() {
  try {
    const wb = XLSX.utils.book_new();

    // Dashboard summary sheet
    const fi=sumIf(data.fixed,'amount','status','Paid'), si=sumIf(data.semifixed,'amount','status','Paid');
    const vi=sumIf(data.variable,'amount','status','Paid'), ui=sumIf(data.unexpected,'amount','status','Paid');
    const ti=sum(data.income,'amount'), pi=sumIf(data.income,'amount','status','Paid'), te=fi+si+vi+ui;
    const dashRows = [
      ['Salary Tracker — '+MONTHS[currentMonth.month]+' '+currentMonth.year],
      [''],
      ['Total Income', ti, 'Paid Income', pi, 'Pending Income', ti-pi],
      ['Total Expenses', te, '', '', 'Net Balance', pi-te],
      [''],
      ['Fixed Expenses (Paid)', fi],
      ['Semi Fixed Expenses (Paid)', si],
      ['Variable Expenses (Paid)', vi],
      ['Unexpected Expenses (Paid)', ui],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dashRows), 'Dashboard');

    // Each data sheet
    const sheetDefs = [
      {key:'income',     name:'Income',       headers:['S.No','Source','Category','Mode','Account','Date Received','Amount (₹)','Status','Month','Remarks']},
      {key:'fixed',      name:'Fixed Exp',    headers:['S.No','Source','Loan No.','Total Loan','Category','Mode','Due Day','Start','End','Paid On','Amount (₹)','Status','Pending (₹)','Interest','Remarks']},
      {key:'semifixed',  name:'Semi Fixed',   headers:['S.No','Source','Ref No.','Category','Mode','Due Day','Start','End','Paid On','Amount (₹)','Status','Pending (₹)','Interest','Remarks']},
      {key:'variable',   name:'Variable Exp', headers:['S.No','Source','Date','Category','Subcategory','Mode','Account','Description','Amount (₹)','Month','Status','Remarks']},
      {key:'unexpected', name:'Unexpected',   headers:['S.No','Source','Date','Category','Subcategory','Mode','Account','Description','Amount (₹)','Month','Status','Remarks']},
      {key:'lending',    name:'Lending',      headers:['S.No','Person','Contact','Type','Mode','Date Given','Due Date','Interest','Amount (₹)','Returned (₹)','Balance (₹)','Status','Account','Remarks']},
    ];
    sheetDefs.forEach(({key, name, headers}) => {
      const schema = SCHEMAS[key];
      const aoa = [
        [name + ' — ' + MONTHS[currentMonth.month] + ' ' + currentMonth.year],
        headers,
        ...data[key].map((row,i) => schema.map(c => c.type==='sno' ? i+1 : (row[c.key] || '')))
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    });

    const fname = MONTHS[currentMonth.month]+'-'+currentMonth.year+'_Salary_Tracker.xlsx';
    XLSX.writeFile(wb, fname);
    showToast('📊 Excel downloaded!','success');
  } catch(e) {
    showToast('Export error: '+e.message,'error');
  }
}

// ── MATH HELPERS ─────────────────────────────────────────────────────────
function sum(arr,f)        { return arr.reduce((s,r)=>s+(parseFloat(r[f])||0),0); }
function sumIf(arr,f,cf,cv){ return arr.filter(r=>r[cf]===cv).reduce((s,r)=>s+(parseFloat(r[f])||0),0); }
function fmt(n)            { return '₹'+parseFloat(n||0).toLocaleString('en-IN',{maximumFractionDigits:0}); }

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
  // Income: Total = all rows, Paid = only status 'Paid', Pending = 'Pending'+'Delayed'
  const ti=sum(data.income,'amount');
  const pi=sumIf(data.income,'amount','status','Paid');

  // Expenses: only count rows where status === 'Paid' (Pending/Delayed don't count yet)
  const fi=sumIf(data.fixed,    'amount','status','Paid');
  const si=sumIf(data.semifixed,'amount','status','Paid');
  const vi=sumIf(data.variable, 'amount','status','Paid');
  const ui=sumIf(data.unexpected,'amount','status','Paid');
  const te=fi+si+vi+ui, nb=pi-te, pct=pi>0?Math.min(100,(te/pi)*100):0;

  const noFile = !currentFileId ? `<div class="load-card">
    <div class="load-card-title">📂 ${MONTHS[currentMonth.month]} ${currentMonth.year}</div>
    <div class="load-card-sub">No file loaded. Tap below to load existing or create new from master template.</div>
    <button class="btn btn-primary" style="width:100%" onclick="loadOrCreateCurrentMonth()">📋 Load / Create Month File</button>
  </div>` : '';

  c.innerHTML = noFile + `
    <div class="dashboard-grid">
      <div class="stat-card income"><div class="stat-label">Paid Income</div><div class="stat-value income">${fmt(pi)}</div></div>
      <div class="stat-card expenses"><div class="stat-label">Paid Expenses</div><div class="stat-value expenses">${fmt(te)}</div></div>
      <div class="stat-card balance"><div class="stat-label">Net Balance</div><div class="stat-value ${nb>=0?'balance-pos':'balance-neg'}">${fmt(nb)}</div></div>
      <div class="stat-card pending"><div class="stat-label">Unpaid Income</div><div class="stat-value" style="color:var(--delayed)">${fmt(ti-pi)}</div></div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:.45rem;font-size:.73rem">
        <span style="color:var(--muted)">Spend vs Paid Income</span>
        <span style="color:var(--accent2);font-family:var(--font-head);font-weight:700">${pct.toFixed(1)}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="section-head">Breakdown</div>
    <div class="sheet-table">
      <table style="min-width:unset;width:100%">
        <thead><tr><th>Category</th><th style="text-align:right">Paid</th><th style="text-align:right">Pending</th><th style="text-align:right">Delayed</th></tr></thead>
        <tbody>
          ${[
            ['Fixed Exp',   fi, sumIf(data.fixed,    'amount','status','Pending'), sumIf(data.fixed,    'amount','status','Delayed')],
            ['Semi Fixed',  si, sumIf(data.semifixed,'amount','status','Pending'), sumIf(data.semifixed,'amount','status','Delayed')],
            ['Variable',    vi, sumIf(data.variable, 'amount','status','Pending'), sumIf(data.variable, 'amount','status','Delayed')],
            ['Unexpected',  ui, sumIf(data.unexpected,'amount','status','Pending'),sumIf(data.unexpected,'amount','status','Delayed')]
            ].map(([cat,p,pnd,del])=>`<tr>
              <td>${cat}</td>
              <td style="text-align:right;color:var(--accent);font-family:var(--font-mono)">${fmt(p)}</td>
              <td style="text-align:right;color:var(--accent2);font-family:var(--font-mono)">${fmt(pnd)}</td>
              <td style="text-align:right;color:var(--delayed);font-family:var(--font-mono)">${del>0?fmt(del):'-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderSheet(c, key, title) {
  const schema = SCHEMAS[key];
  const rows   = data[key];
  const stColor = {Paid:'var(--paid)',Pending:'var(--pending)',Delayed:'var(--delayed)','Partially Paid':'var(--accent3)','Fully Paid':'var(--paid)'};

  const thead = schema.map(col=>`<th>${col.label}</th>`).join('')+'<th></th>';
  const tbody = rows.length===0
    ? `<tr><td colspan="${schema.length+1}" style="color:var(--muted);padding:2rem;font-size:.8rem">No entries yet. Tap + to add.</td></tr>`
    : rows.map((row,ri)=>`<tr>${schema.map(col=>{
        const v=(row[col.key]??'').toString().replace(/"/g,'&quot;');
        if (col.type==='sno')    return `<td style="color:var(--muted);font-size:.68rem;min-width:22px">${ri+1}</td>`;
        if (col.type==='select') return `<td><select class="inline-select" style="color:${stColor[row[col.key]]||'var(--text)'}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)">${col.opts.map(o=>`<option ${o===row[col.key]?'selected':''}>${o}</option>`).join('')}</select></td>`;
        if (col.type==='number') return `<td><input class="inline-input" type="number" step="0.01" value="${v}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)" style="width:78px;text-align:right"></td>`;
        if (col.type==='date')   return `<td><input class="inline-input" type="date" value="${v}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)" style="width:118px"></td>`;
        return `<td><input class="inline-input" type="text" value="${v}" onchange="updateCell('${key}',${ri},'${col.key}',this.value)" style="min-width:65px"></td>`;
      }).join('')}<td><button class="delete-btn" onclick="deleteRow('${key}',${ri})">✕</button></td></tr>`
    ).join('');

  c.innerHTML = ` <div class="add-entry-center">
<button class="add-entry-btn" onclick="showAddRow('${key}','${title}')">
➕ Add Entry
</button>
</div> 
    <div class="section-head">${title}</div>
    <div class="sheet-table">
      <div class="table-scroll"><table id="dataTable" ><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>
    </div>
  `;
  setTimeout(()=>{

    if($.fn.DataTable.isDataTable('#dataTable')){
    $('#dataTable').DataTable().destroy();
    }
    
    $('#dataTable').DataTable({
    paging:true,
    searching:false,
    ordering:false,
    pageLength:10,
    lengthChange:true,
    
    scrollX:true,
    scrollY:"60vh",
    scrollCollapse:true,
    
    fixedHeader:true
    });
    
    },50);
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
function deleteRow(key,ri) {
  if (!confirm('Delete this row?')) return;
  data[key].splice(ri,1);
  markDirty(); switchTab(currentTab);
}
function markDirty() { hasChanges=true; document.getElementById('syncBar').classList.add('visible'); }
function discardChanges() {
  if (!confirm('Discard all unsaved changes?')) return;
  hasChanges=false; document.getElementById('syncBar').classList.remove('visible');
  if (currentFileId) loadJsonData(); else { resetData(); switchTab(currentTab); }
}

// ── ADD ROW ───────────────────────────────────────────────────────────────
function showAddRow(key,title){

    addRowContext = key;
    
    document.getElementById('addRowTitle').textContent = 'Add ' + title;
    
    const schema = SCHEMAS[key].filter(c => c.type !== 'sno');
    
    document.getElementById('addRowForm').innerHTML =
    
    '<div class="form-grid">' +
    
    schema.map(col => {
    
    let input = '';
    
    if(col.type === 'select'){
    input = `
    <select class="form-select" name="${col.key}">
    <option value="">Select...</option>
    ${col.opts.map(o => `<option>${o}</option>`).join('')}
    </select>`;
    }
    
    else if(col.type === 'date'){
    input = `<input type="date" class="form-input" name="${col.key}">`;
    }
    
    else if(col.type === 'number'){
    input = `<input type="number" class="form-input" name="${col.key}" step="0.01">`;
    }
    else if(col.type === 'textarea'){
        input = `<textarea class="form-input" name="${col.key}" rows="1" placeholder="${col.label}"></textarea>`;
        }
        
        else{
        input = `<input type="text" class="form-input" name="${col.key}" placeholder="${col.label}">`;
        }
    
    return `
    <div class="form-group">
    <label class="form-label">${col.label}</label>
    ${input}
    </div>
    `;
    
    }).join('')
    
    + '</div>';
    
    openModal('addRowModal');
    
    }
function submitAddRow() {
  const key=addRowContext, schema=SCHEMAS[key], form=document.getElementById('addRowForm');
  const row={_id:key+'_'+Date.now()};
  schema.forEach(col=>{
    if (col.type==='sno') { row.sno=data[key].length+1; return; }
    const el=form.querySelector('[name="'+col.key+'"]');
    row[col.key]=el?el.value:'';
  });
  if (key==='lending') row.balance=String((parseFloat(row.amount)||0)-(parseFloat(row.returned)||0));
  data[key].push(row);
  closeModal('addRowModal'); markDirty(); switchTab(currentTab);
}

// ── MONTH PICKER ──────────────────────────────────────────────────────────
function showMonthPicker() { pickerMonth={...currentMonth}; document.getElementById('yearDisplay').textContent=pickerMonth.year; renderMonthGrid(); openModal('monthModal'); }
function renderMonthGrid() { document.getElementById('monthGrid').innerHTML=MONTHS.map((m,i)=>`<div class="month-chip ${i===pickerMonth.month?'selected':''}" onclick="selMonth(${i})">${m.slice(0,3)}</div>`).join(''); }
function selMonth(i) { pickerMonth.month=i; renderMonthGrid(); }
function changeYear(d) { pickerMonth.year+=d; document.getElementById('yearDisplay').textContent=pickerMonth.year; }
function applyMonth() {
  currentMonth={...pickerMonth}; updateMonthDisplay(); closeModal('monthModal');
  currentFileId=null; resetData(); setFileStatus(false); switchTab(currentTab);
}
function updateMonthDisplay() { document.getElementById('monthDisplay').textContent=MONTHS[currentMonth.month]+' '+currentMonth.year; }

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

// ── THEME TOGGLE ──────────────────────────────────────────────────────────
function toggleTheme() {
  const isDay=document.body.classList.toggle('day');
  localStorage.setItem('st_theme', isDay?'day':'night');
}
function applyStoredTheme() { if (localStorage.getItem('st_theme')==='day') document.body.classList.add('day'); }

// ── HELPERS ───────────────────────────────────────────────────────────────
function setFileStatus(linked) {
  const el=document.getElementById('fileStatus');
  el.className='file-status'+(linked?' linked':'');
  el.innerHTML=`<div class="dot"></div><span>${linked?getFileName():'No file'}</span>`;
}
function resetData() { data={income:[],fixed:[],semifixed:[],variable:[],unexpected:[],lending:[]}; }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(el=>{
  el.addEventListener('click',e=>{ if(e.target===el) el.classList.remove('open'); });
});

let toastTimer;
function showToast(msg,type='info') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3500);
}

async function editMasterJson(){

  if(!accessToken){
    showToast("Please sign in first","error");
    return;
  }

  if(!MASTER_FILE_ID){
    showToast("Master file ID not set","error");
    return;
  }

  try{

    const text = await driveDownloadText(MASTER_FILE_ID);

    document.getElementById("masterJsonEditor").value =
      JSON.stringify(JSON.parse(text), null, 2);

    openModal("masterJsonModal");

  }catch(e){
    console.error(e);
    showToast("Failed to load master.json","error");
  }

}


async function saveMasterJson(){

  try{

    const text = document.getElementById("masterJsonEditor").value;

    const json = JSON.parse(text);

    await driveUploadJson(MASTER_FILE_ID, json, "master.json");

    showToast("✓ Master JSON updated","success");

    closeModal("masterJsonModal");

  }catch(e){

    showToast("Invalid JSON or save failed","error");

  }

}


// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

    applyStoredTheme();
    updateMonthDisplay();
    renderMonthGrid();
  
    document.querySelectorAll('.modal-overlay').forEach(el=>{
      el.addEventListener('click',e=>{
        if(e.target===el) el.classList.remove('open');
      });
    });
  
  });
