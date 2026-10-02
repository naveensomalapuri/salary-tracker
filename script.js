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
let signedIn      = false;  // true after the first token; later tokens are silent refreshes
let currentMonth  = { month: new Date().getMonth(), year: new Date().getFullYear() };
let pickerMonth   = { ...currentMonth };
let currentTab    = 'dashboard';
let currentFileId = null;
let currentFileModified = null;  // Drive modifiedTime when we last loaded/saved — used for conflict detection
let prevMonth     = null;   // { label, totals } of the previous month's file, for the dashboard comparison
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
  nextmonth: [
    { key:'sno',           label:'#',             type:'sno' },
    { key:'source',        label:'Source',        type:'text' },
    { key:'date',          label:'Date Spent',    type:'date' },
    { key:'category',      label:'Category',      type:'text' },
    { key:'paymentMode',   label:'Payment Mode',  type:'select', opts:[] },
    { key:'accountUsed',   label:'Account Used',  type:'select', opts:[] },
    { key:'description',   label:'Description',   type:'textarea' },
    { key:'amount',        label:'Amount (₹)',    type:'number' },
    { key:'targetSection', label:'Apply To',      type:'select', opts:['Variable','Unexpected','Fixed','Semi Fixed'] },
    { key:'status',        label:'Status',        type:'select', opts:['Staged','Migrated'] },
    { key:'remarks',       label:'Remarks',       type:'text' },
  ],
};

// Maps the user-facing "Apply To" label on a nextmonth row to the canonical section key
const NEXTMONTH_TARGET_MAP = {
  'Variable':   'variable',
  'Unexpected': 'unexpected',
  'Fixed':      'fixed',
  'Semi Fixed': 'semifixed',
};

// Default dropdown options merged into every paymentMode / accountUsed select across the app.
// User-entered values from data are merged in too (they appear first in the dropdown).
const DEFAULT_PAYMENT_MODES = [
  'Cash',
  'UPI',
  'UPI - Google Pay',
  'UPI - PhonePe',
  'UPI - Paytm',
  'UPI - BHIM',
  'HDFC Credit Card',
  'ICICI Credit Card',
  'SBI Credit Card',
  'Axis Credit Card',
  'Kotak Credit Card',
  'IDFC Credit Card',
  'Yes Bank Credit Card',
  'IndusInd Credit Card',
  'RBL Credit Card',
  'American Express',
  'HDFC Debit Card',
  'ICICI Debit Card',
  'SBI Debit Card',
  'Axis Debit Card',
  'Kotak Debit Card',
  'Net Banking',
  'NEFT',
  'IMPS',
  'RTGS',
  'Cheque',
  'Demand Draft',
  'Auto Debit',
  'EMI',
];

const DEFAULT_ACCOUNTS = [
  'HDFC Bank',
  'ICICI Bank',
  'SBI',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'IDFC First Bank',
  'Yes Bank',
  'IndusInd Bank',
  'Bank of Baroda',
  'Punjab National Bank',
  'Canara Bank',
  'Union Bank',
  'Federal Bank',
  'IDBI Bank',
  'RBL Bank',
  'AU Small Finance Bank',
  'Bandhan Bank',
  'DBS Bank',
  'HSBC',
  'Standard Chartered',
  'Citibank',
];

// Field-key → default options list. Applied across all sections during schema hydration.
const FIELD_DEFAULTS = {
  paymentMode:     DEFAULT_PAYMENT_MODES,
  mode:            DEFAULT_PAYMENT_MODES,   // lending uses 'mode'
  accountUsed:     DEFAULT_ACCOUNTS,
  accountReceived: DEFAULT_ACCOUNTS,
};

// ── ICONS ─────────────────────────────────────────────────────────────────
// Inline SVG line icons (Lucide-style, 24×24, stroked with currentColor so they follow theme/button colours).
const ICONS = {
  wallet:      '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  lightbulb:   '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  settings:    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  calendar:    '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  user:        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  moon:        '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun:         '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  x:           '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check:       '<path d="M20 6 9 17l-5-5"/>',
  plus:        '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash:       '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  cloudUpload: '<path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/>',
  sheet:       '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  edit:        '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  clipboard:   '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  save:        '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight:'<path d="m9 18 6-6-6-6"/>',
  alignLeft:   '<path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  info:        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  folderOpen:  '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  filePlus:    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock:       '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  list:        '<path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>',
  arrowRightCircle: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="m12 16 4-4-4-4"/>',
  creditCard:  '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  bank:        '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 20 7H4z"/>',
  arrowUp:     '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown:   '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  bell:        '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  chartBar:    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h3"/>',
  trendingUp:  '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
};
function icon(name, cls = '') {
  return `<svg class="ico${cls ? ' '+cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
// Static markup uses <i data-icon="name" class="..."></i> placeholders — swap them for SVGs
function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon, el.className); });
}

// ── SCHEMA BUILDER ────────────────────────────────────────────────────────
// Uses canonical schemas as the structural backbone.
// Hydrates select options (except status) from actual master.json data values.
// This means schemas are ALWAYS correct even when sections are empty.
function buildSchemasFromData(masterObj) {
  const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending','nextmonth'];

  SCHEMAS = {};

  sections.forEach(section => {
    const rows = masterObj[section] || [];
    // Deep-clone canonical schema so we can safely mutate opts
    const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMAS[section] || [{ key:'sno', label:'#', type:'sno' }]));

    // Hydrate dynamic select options from data (skip fixed-opts columns: status, lending type, nextmonth's targetSection)
    schema.forEach(col => {
      if (col.type !== 'select') return;
      if (col.key === 'status' || col.key === 'type' || col.key === 'targetSection') return;

      // Start with values already used in this section's rows (user's most-used appear first)
      const userVals = rows.length > 0
        ? [...new Set(rows.map(r => r[col.key]).filter(v => v && v !== ''))]
        : [];
      // Merge in hardcoded defaults for known fields (paymentMode, accountUsed, etc.)
      const defaults = FIELD_DEFAULTS[col.key] || [];
      const merged   = [...new Set([...userVals, ...defaults])];
      if (merged.length > 0) col.opts = merged;
    });

    SCHEMAS[section] = schema;
  });

  // nextmonth never lives in master.json. In addition to defaults already applied above,
  // also pull paymentMode / accountUsed values used in OTHER sections so user-custom values are picked up.
  if (SCHEMAS.nextmonth) {
    SCHEMAS.nextmonth.forEach(col => {
      if (col.type !== 'select') return;
      if (col.key !== 'paymentMode' && col.key !== 'accountUsed') return;
      const altKey = (col.key === 'accountUsed') ? 'accountReceived' : null;
      const values = new Set(col.opts || []);
      sections.forEach(s => {
        if (s === 'nextmonth') return;
        (masterObj[s] || []).forEach(r => {
          if (r[col.key])           values.add(r[col.key]);
          if (altKey && r[altKey])  values.add(r[altKey]);
        });
      });
      if (values.size > 0) col.opts = [...values];
    });
  }

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
  // Silent refreshes reuse this callback — only run the sign-in flow once,
  // otherwise a refresh would reload the month file and wipe unsaved edits.
  if (signedIn) return;
  signedIn = true;
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
  showToast('Signed in!','success');
  // Auto-load current month file
  loadOrCreateCurrentMonth();
}
async function signOut() {
  const msg = hasChanges
    ? 'You have unsaved changes. Sign out anyway?'
    : 'Sign out?';
  const ok = await showConfirmModal('Sign Out', msg);
  if (!ok) return;
  if (accessToken && typeof google!=='undefined') google.accounts.oauth2.revoke(accessToken,()=>{});
  accessToken=null; tokenExpiresAt=0; signedIn=false;
  currentFileId=null; currentFileModified=null; gisLoaded=false;
  hasChanges=false;
  document.getElementById('syncBar').classList.remove('visible');
  resetData();
  document.getElementById('splash').style.display='flex';
  document.getElementById('app').classList.remove('visible');
}

// Warn before closing/reloading the tab if there are unsaved edits
window.addEventListener('beforeunload', (e) => {
  if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
});

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
    'master.json not found (404). Open Settings and paste the correct File ID from your Drive share link.'
  );
  if (r2.status === 403) throw new Error(
    'Access denied (403). Make sure the Google account you signed in with owns master.json or has been shared on it directly. Then retry.'
  );
  throw new Error('Download failed: ' + msg);
}
async function driveGetModifiedTime(fileId) {
  await ensureFreshToken();
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime&supportsAllDrives=true`, { headers:H() });
  if (!r.ok) throw new Error('Metadata fetch failed: '+r.status);
  return (await r.json()).modifiedTime || null;
}
async function driveUploadJson(fileId, obj, name) {
  await ensureFreshToken();
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({name})], {type:'application/json'}));
  form.append('file',     new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'}));
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`, {
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
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
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
  if (!MASTER_FILE_ID) { showToast('Set Master JSON File ID in Settings first','error'); openSettingsModal(); return; }

  const name = getFileName();
  showToast('Looking for '+name+'...','info');
  try {
    let q = `name='${name}' and trashed=false and mimeType='application/json'`;
    if (DEST_FOLDER_ID) q += ` and '${DEST_FOLDER_ID}' in parents`;
    const files = await driveList(q);

    prevMonth = null;
    let ok;
    if (files.length > 0) {
      currentFileId = files[0].id;
      showToast('File found! Loading...','success');
      ok = await loadJsonData();
    } else {
      ok = await createFromMaster(name);
    }
    // Read the previous month once: it feeds the dashboard comparison and the
    // "Next Month" carry-over — only when this month's file is actually loaded,
    // otherwise carried entries would go into empty data
    if (ok) {
      const prev = await loadPreviousMonth();
      if (prev) await migrateFromPreviousMonth(prev);
    }
  } catch(e) {
    showToast(e.message,'error');
    console.error(e);
  }
}

// Download the previous month's file (if any) and keep its totals for the comparison.
// Returns { id, name, label, data } or null.
async function loadPreviousMonth() {
  let prevM = currentMonth.month - 1;
  let prevY = currentMonth.year;
  if (prevM < 0) { prevM = 11; prevY--; }   // January → previous December
  const name = `${MONTHS[prevM]}-${prevY}_Salary_Tracker.json`;
  try {
    let q = `name='${name}' and trashed=false and mimeType='application/json'`;
    if (DEST_FOLDER_ID) q += ` and '${DEST_FOLDER_ID}' in parents`;
    const files = await driveList(q);
    if (files.length === 0) return null;   // no previous month file — silent no-op
    const prev = { id: files[0].id, name, label: `${MONTHS[prevM]} ${prevY}`,
                   data: JSON.parse(await driveDownloadText(files[0].id)) };
    prevMonth = { label: prev.label, totals: computeTotals(prev.data) };
    if (currentTab === 'dashboard') switchTab('dashboard');
    return prev;
  } catch (e) {
    console.error('Previous month error:', e);
    showToast('Could not read previous month: ' + e.message, 'error');
    return null;
  }
}

// Migrate entries staged in the previous month's file into the current month's
// target section (Variable / Unexpected / Fixed / SemiFixed).
// The current month is saved FIRST, then source entries are flipped to "Migrated",
// so an interruption can never lose entries. Each carried row remembers its source
// _id, so a retry after a partial failure won't duplicate it.
async function migrateFromPreviousMonth(prev) {
  const { id: prevId, name: prevName, data: prevData } = prev;
  const prevLabel = prev.label;
  try {
    const staged   = (prevData.nextmonth || []).filter(r => sameText(r.status, 'Staged'));
    if (staged.length === 0) return;

    let migrated = 0;
    staged.forEach(src => {
      const targetKey = NEXTMONTH_TARGET_MAP[src.targetSection] || 'variable';
      if (!data[targetKey]) data[targetKey] = [];
      src.status = 'Migrated';

      // Already carried over by an earlier run that failed before updating the previous file
      if (src._id && data[targetKey].some(r => r._carriedFromId === src._id)) return;

      const row = {
        _id:            targetKey + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        source:         src.source || '',
        category:       src.category || '',
        paymentMode:    src.paymentMode || '',
        accountUsed:    src.accountUsed || '',
        amount:         src.amount || '',
        status:         'Pending',
        remarks:        src.remarks || '',
        _carriedFrom:   prevLabel,
        _carriedFromId: src._id || '',
      };
      // Per-target field shape — schemas differ between variable/unexpected and fixed/semifixed
      if (targetKey === 'variable' || targetKey === 'unexpected') {
        row.date        = src.date || '';
        row.description = src.description || '';
        row.month       = MONTHS[currentMonth.month];
      } else if (targetKey === 'fixed' || targetKey === 'semifixed') {
        row.datePaid = src.date || '';
      }
      data[targetKey].push(row);
      migrated++;
    });

    // Persist the carried rows in this month before marking the sources Migrated
    if (migrated > 0) await uploadCurrentMonth();
    await driveUploadJson(prevId, prevData, prevName);

    if (migrated > 0) {
      switchTab(currentTab); // re-render so migrated rows show immediately
      showToast(`Migrated ${migrated} ${migrated===1?'entry':'entries'} from ${prevLabel.split(' ')[0]} → ${MONTHS[currentMonth.month]} and saved`, 'success');
    }
  } catch (e) {
    console.error('Migration error:', e);
    showToast('Migration check failed: ' + e.message, 'error');
  }
}

// Always reads master.json from Drive — no hardcoded data anywhere.
// Returns true if the month file was created and loaded.
async function createFromMaster(name) {
  showToast('Loading master.json from Drive...','info');
  try {
    // Use MASTER_FILE_ID directly — driveDownloadText handles all fallbacks
    if (!MASTER_FILE_ID) throw new Error('No Master File ID set. Open Settings and paste your master.json file ID.');
    showToast('Downloading master.json (ID: ' + MASTER_FILE_ID.slice(0,8) + '...)','info');
    const masterText = await driveDownloadText(MASTER_FILE_ID);
    const masterData = JSON.parse(masterText);

    // Build schemas from master structure
    buildSchemasFromData(masterData);

    const newData = JSON.parse(JSON.stringify(masterData));
    newData._month   = MONTHS[currentMonth.month];
    newData._year    = currentMonth.year;
    newData._created = new Date().toISOString();

    showToast('Creating ' + name + ' in Drive...','info');
    const result = await driveCreateJson(name, newData, DEST_FOLDER_ID);
    currentFileId       = result.id;
    currentFileModified = result.modifiedTime || null;

    loadDataFromObject(newData);
    setFileStatus(true);
    switchTab(currentTab);
    showToast(name + ' created from master!','success');
    return true;
  } catch(e) {
    showToast(e.message, 'error');
    console.error('createFromMaster error:', e);
    return false;
  }
}

// Returns true on success. On failure the file is unlinked so a later Save
// can't overwrite the Drive copy with empty data.
async function loadJsonData() {
  try {
    const text = await driveDownloadText(currentFileId);
    const obj  = JSON.parse(text);
    currentFileModified = await driveGetModifiedTime(currentFileId);
    // Rebuild schemas from the loaded file's actual keys
    buildSchemasFromData(obj);
    loadDataFromObject(obj);
    setFileStatus(true);
    switchTab(currentTab);
    showToast('Data loaded!','success');
    return true;
  } catch(e) {
    currentFileId = null; currentFileModified = null;
    resetData(); setFileStatus(false); switchTab(currentTab);
    showToast('Load error: '+e.message,'error');
    console.error(e);
    return false;
  }
}

function loadDataFromObject(obj) {
  const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending','nextmonth'];
  data = {};
  sections.forEach(k => {
    data[k] = (obj[k] || []).map((row, i) => ({
      ...row,
      // _id is interpolated into inline handlers — regenerate anything that isn't a plain token
      _id: (typeof row._id === 'string' && /^[\w-]+$/.test(row._id)) ? row._id : (k+'_'+i+'_'+Date.now()),
      ...(k === 'lending' ? { balance: String(lendBalance(row)) } : {})
    }));
  });
}

// ── SAVE MONTH FILE ───────────────────────────────────────────────────────
function buildPayload() {
  const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending','nextmonth'];
  const payload = { _version:1, _month:MONTHS[currentMonth.month], _year:currentMonth.year, _saved:new Date().toISOString() };
  sections.forEach(k => {
    // Keep stored sno in step with display order (deletes leave gaps otherwise)
    payload[k] = (data[k] || []).map((r, i) => (r.sno !== undefined ? { ...r, sno: i + 1 } : r));
  });
  return payload;
}

async function uploadCurrentMonth() {
  const result = await driveUploadJson(currentFileId, buildPayload(), getFileName());
  currentFileModified = result.modifiedTime || null;
  hasChanges = false;
  document.getElementById('syncBar').classList.remove('visible');
}

async function saveToGDrive() {
  if (!currentFileId) { await loadOrCreateCurrentMonth(); if (!currentFileId) return; }
  const btn = document.getElementById('saveBtn');
  btn.innerHTML = '<div class="spinner"></div>';
  btn.disabled = true;
  try {
    // Saving replaces the whole file — warn if it changed elsewhere (e.g. another device) since we loaded it
    if (currentFileModified) {
      const remote = await driveGetModifiedTime(currentFileId);
      if (remote && remote !== currentFileModified) {
        const ok = await showConfirmModal(
          'File changed on Drive',
          'This month\'s file was modified elsewhere (another device or tab) after you loaded it. Saving will <strong>overwrite those changes</strong>. Save anyway?'
        );
        if (!ok) return;
      }
    }
    await uploadCurrentMonth();
    showToast('Saved to Google Drive!','success');
  } catch(e) {
    showToast('Save error: '+e.message,'error');
    console.error(e);
  } finally {
    btn.innerHTML = icon('cloudUpload') + ' Save';
    btn.disabled = false;
  }
}

// ── MASTER JSON EDITOR ────────────────────────────────────────────────────
// Downloads master.json and returns { id, text }. Uses the configured ID; if that
// file doesn't exist (404), falls back to searching Drive by filename.
async function downloadMaster() {
  if (MASTER_FILE_ID) {
    try {
      return { id: MASTER_FILE_ID, text: await driveDownloadText(MASTER_FILE_ID) };
    } catch (e) {
      // Only a wrong ID is worth searching for — surface access/network errors as-is
      if (!/\(404\)/.test(e.message)) throw e;
    }
  }
  // ID missing or 404 — search Drive by filename (only finds files you own)
  showToast('Searching Drive for master.json...','info');
  const q = `name='master.json' and trashed=false and mimeType='application/json'`;
  const files = await driveList(q);
  if (files.length === 0) throw new Error(
    'master.json not found. Check the File ID in Settings — paste the ID from your Drive share link.'
  );
  const foundId = files[0].id;
  MASTER_FILE_ID = foundId;
  localStorage.setItem('st_master_id', foundId);
  showToast('Found master.json — ID updated in Settings','success');
  return { id: foundId, text: await driveDownloadText(foundId) };
}


async function editMasterJson() {
  if (!accessToken) { showToast('Please sign in first','error'); return; }
  closeModal('settingsModal');
  showToast('Loading master.json...','info');
  try {
    const { text } = await downloadMaster();
    document.getElementById('masterJsonEditor').value = JSON.stringify(JSON.parse(text), null, 2);
    showToast('master.json loaded','success');
    openModal('masterJsonModal');
  } catch(e) {
    console.error('editMasterJson error:', e);
    showToast(e.message,'error');
  }
}

async function saveMasterJson() {
  let json;
  try { json = JSON.parse(document.getElementById('masterJsonEditor').value); }
  catch(e) { showToast('Invalid JSON: '+e.message,'error'); return; }
  try {
    showToast('Saving...','info');
    await driveUploadJson(MASTER_FILE_ID, json, 'master.json');
    // Rebuild schemas from updated master
    buildSchemasFromData(json);
    showToast('master.json saved!','success');
    closeModal('masterJsonModal');
  } catch(e) {
    showToast(e.message,'error');
    console.error(e);
  }
}

// ── EXPORT TO EXCEL ───────────────────────────────────────────────────────
function exportExcel() {
  try {
    const wb = XLSX.utils.book_new();
    const sections = ['income','savings','fixed','semifixed','variable','unexpected','lending','nextmonth'];
    const sheetNames = {income:'Income',savings:'Savings',fixed:'Fixed Expenses',semifixed:'Semi Fixed Exp',
                        variable:'Variable Exp',unexpected:'Unexpected Exp',lending:'Lending & Borrowing',
                        nextmonth:'Next Month (Reminder)'};
    // Same numbers as the in-app dashboard
    const t = computeTotals();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Salary Tracker — '+MONTHS[currentMonth.month]+' '+currentMonth.year],[''],
      ['Income Received (Paid)', t.incomePaid, '', 'Pending Income', t.incomePending, '', 'Delayed Income', t.incomeDelayed],[''],
      ['Total Expenses (Paid)', t.expPaid, '', 'Savings (Saved)', t.saved, '', 'Net Balance', t.net],
      ['Withdrawn from Savings', t.withdrawn, '', 'Net Savings', t.netSaved, '', 'Projected Month-End', t.projected],[''],
      ['Category', 'Paid', 'Pending', 'Delayed'],
      ['Fixed Expenses',      t.cat.fixed.paid,      t.cat.fixed.pending,      t.cat.fixed.delayed],
      ['Semi Fixed Expenses', t.cat.semifixed.paid,  t.cat.semifixed.pending,  t.cat.semifixed.delayed],
      ['Variable Expenses',   t.cat.variable.paid,   t.cat.variable.pending,   t.cat.variable.delayed],
      ['Unexpected Expenses', t.cat.unexpected.paid, t.cat.unexpected.pending, t.cat.unexpected.delayed],
      ['Total Expenses',      t.expPaid,             t.expPending,             t.expDelayed],
      ['Savings',             t.saved,               t.savingsPending,         ''],[''],
      ['Lending', 'Total Lent', t.lent, 'Total Borrowed', t.borrowed, 'To Receive', t.toReceive, 'To Pay', t.toPay],
      ...(t.loanCount ? [[''], ['Loans', 'EMIs This Month', t.emi, 'Principal Remaining', t.loanRemaining,
                               'EMI % of Expected Income', t.emiPct === null ? '' : round2(t.emiPct)]] : []),
      ...(t.categories.length ? [[''], ['Spending by Category (Paid)', 'Amount', 'Subcategories'],
          ...t.categories.map(c => [c.name, c.amount, c.subs.map(x => `${x.name}: ${x.amount}`).join(', ')])] : []),
    ]), 'Dashboard');
    sections.forEach(key => {
      const schema = SCHEMAS[key] || [];
      const headers = schema.map(c => c.label);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        [sheetNames[key]+' — '+MONTHS[currentMonth.month]+' '+currentMonth.year],
        headers,
        ...(data[key]||[]).map((row,i)=>schema.map(c=>{
          if (c.type === 'sno') return i+1;
          if (c.key === 'balance') return lendBalance(row);
          if (c.type === 'number') return (row[c.key] === '' || row[c.key] == null) ? '' : toNum(row[c.key]);
          return row[c.key] || '';
        }))
      ]), sheetNames[key]);
    });
    XLSX.writeFile(wb, MONTHS[currentMonth.month]+'-'+currentMonth.year+'_Salary_Tracker.xlsx');
    showToast('Excel downloaded!','success');
  } catch(e) { showToast('Export error: '+e.message,'error'); }
}

// ── MATH HELPERS ─────────────────────────────────────────────────────────
// Amounts are stored as strings and may be hand-edited in master.json ("1,250", "₹500", " 300 ")
function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[₹,\s]/g, ''));
  return isFinite(n) ? n : 0;
}
// Round to paise so float noise (0.1+0.2) never leaks into totals or stored balances
function round2(n)          { return Math.round((n + Number.EPSILON) * 100) / 100; }
// Status / type match ignores case and stray spaces ("paid " counts as "Paid")
function sameText(a, b)     { return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase(); }
function sum(arr,f)         { return round2(arr.reduce((s,r)=>s+toNum(r[f]),0)); }
function sumIf(arr,f,cf,cv) { return sum(arr.filter(r=>sameText(r[cf],cv)), f); }
function fmt(n) {
  const v = round2(toNum(n));
  const s = Math.abs(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (v < 0 ? '−₹' : '₹') + s;   // round2 first so -0.001 shows ₹0.00, not ₹-0.00
}
// Lending balance = amount − returned (what is still owed on the entry)
function lendBalance(r)     { return round2(toNum(r.amount) - toNum(r.returned)); }

// ── TABS ─────────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  const tabs = ['dashboard','income','savings','fixed','semifixed','variable','unexpected','nextmonth','lending'];
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',tabs[i]===tab));
  const c = document.getElementById('content');
  const titles = {income:'Income',savings:'Savings',fixed:'Fixed Expenses',semifixed:'Semi Fixed Expenses',
                  variable:'Variable Expenses',unexpected:'Unexpected Expenses',lending:'Lending & Borrowing',
                  nextmonth:'Next Month'};
  if (tab==='dashboard') renderDashboard(c); else renderSheet(c, tab, titles[tab]);
}

// Single source of truth for every number on the dashboard and in the Excel export.
// Rules: income counts Paid, expenses count Paid, savings count Saved − Withdrawn;
// Lending & Next Month are kept separate. Takes any month's data (used for the comparison too).
const EXPENSE_SECTIONS = ['fixed','semifixed','variable','unexpected'];
const LOAN_SECTIONS    = ['fixed','semifixed'];
const EMI_GUIDELINE_PCT = 40;   // common rule of thumb: total EMIs under ~40% of income
function computeTotals(d = data) {
  const by = (k, st) => sumIf(d[k] || [], 'amount', 'status', st);
  const t = {
    incomePaid:     by('income','Paid'),
    incomePending:  by('income','Pending'),
    incomeDelayed:  by('income','Delayed'),
    saved:          by('savings','Saved'),
    savingsPending: by('savings','Pending'),
    withdrawn:      by('savings','Withdrawn'),
    savingsTarget:  sum(d.savings || [], 'targetAmount'),
    cat: {},
  };
  t.incomeExpected = round2(t.incomePaid + t.incomePending + t.incomeDelayed);
  EXPENSE_SECTIONS.forEach(k => t.cat[k] = { paid: by(k,'Paid'), pending: by(k,'Pending'), delayed: by(k,'Delayed') });
  const total = f => round2(EXPENSE_SECTIONS.reduce((s, k) => s + t.cat[k][f], 0));
  t.expPaid    = total('paid');
  t.expPending = total('pending');
  t.expDelayed = total('delayed');

  // A Withdrawn row is money taken back out of savings: it lowers net savings and
  // returns to the balance. Net savings can go negative when drawing on older savings.
  t.netSaved = round2(t.saved - t.withdrawn);

  // Net Balance = Paid Income − Paid Expenses − Net Saved
  t.net = round2(t.incomePaid - t.expPaid - t.netSaved);
  // Projected month-end: as if every expected income arrives and every bill / planned saving goes out
  t.projected = round2(t.incomeExpected - (t.expPaid + t.expPending + t.expDelayed) - (t.netSaved + t.savingsPending));
  // Share of received income already spent or saved (null when nothing received yet)
  t.usedPct = t.incomePaid > 0 ? (t.expPaid + t.netSaved) / t.incomePaid * 100 : null;
  t.savingsPct = t.savingsTarget > 0 ? Math.max(0, t.netSaved) / t.savingsTarget * 100 : null;

  // Loans: Fixed / Semi Fixed rows with a loan number or a total loan amount.
  // Amount is the monthly EMI, Pending Amount the principal still outstanding.
  const loans = LOAN_SECTIONS.flatMap(k => (d[k] || []).filter(r => String(r.loanNumber ?? '').trim() !== '' || toNum(r.totalLoanAmount) > 0));
  const withTotal = loans.filter(r => toNum(r.totalLoanAmount) > 0);
  const rated     = loans.filter(r => toNum(r.interestRate) > 0 && toNum(r.pendingAmount) > 0);
  t.loanCount     = loans.length;
  t.emi           = sum(loans, 'amount');
  t.loanRemaining = sum(loans, 'pendingAmount');
  t.loanTotal     = sum(withTotal, 'totalLoanAmount');
  t.loanRepaidPct = t.loanTotal > 0
    ? Math.min(100, Math.max(0, (t.loanTotal - sum(withTotal, 'pendingAmount')) / t.loanTotal * 100)) : null;
  t.emiPct        = t.incomeExpected > 0 ? t.emi / t.incomeExpected * 100 : null;
  // Interest rate weighted by what's still outstanding ("8.5%", "8.5 % p.a." → 8.5)
  const ratedBase = sum(rated, 'pendingAmount');
  t.loanRate      = ratedBase > 0 ? rated.reduce((s, r) => s + toNum(r.interestRate) * toNum(r.pendingAmount), 0) / ratedBase : null;

  // Where the money went: paid expenses grouped by Category (case-insensitive), with Subcategory detail
  const groups = new Map();
  EXPENSE_SECTIONS.forEach(k => (d[k] || []).filter(r => sameText(r.status, 'Paid')).forEach(r => {
    const name = String(r.category ?? '').trim() || 'Uncategorized';
    const g = groups.get(name.toLowerCase()) || { name, amount: 0, subs: new Map() };
    g.amount += toNum(r.amount);
    const sub = String(r.subcategory ?? '').trim();
    if (sub) {
      const sg = g.subs.get(sub.toLowerCase()) || { name: sub, amount: 0 };
      sg.amount += toNum(r.amount);
      g.subs.set(sub.toLowerCase(), sg);
    }
    groups.set(name.toLowerCase(), g);
  }));
  t.categories = [...groups.values()]
    .map(g => ({ name: g.name, amount: round2(g.amount),
                 subs: [...g.subs.values()].map(x => ({ name: x.name, amount: round2(x.amount) }))
                                           .filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount) }))
    .filter(g => g.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Lending: what's still open is amount − returned on entries not marked Fully Paid.
  // Money owed TO you and money YOU owe are kept apart — adding them together means nothing.
  const lend = d.lending || [];
  const open = r => !sameText(r.status, 'Fully Paid');
  const openBal = type => round2(lend.filter(r => sameText(r.type, type) && open(r))
                                     .reduce((s, r) => s + Math.max(0, lendBalance(r)), 0));
  t.lent      = sumIf(lend, 'amount', 'type', 'Lent');
  t.borrowed  = sumIf(lend, 'amount', 'type', 'Borrowed');
  t.toReceive = openBal('Lent');
  t.toPay     = openBal('Borrowed');
  t.lendSettled = lend.filter(r => !open(r)).length;
  t.lendOpen    = lend.length - t.lendSettled;
  return t;
}

// ── DUE-DATE ALERTS ───────────────────────────────────────────────────────
const DUE_SOON_DAYS = 3;
// "Date To Pay" is free text: a day of the month ("5", "5th", "every 5th") falls in the
// month being viewed; full dates ("2026-10-05", "05/10/2026" as dd/mm/yyyy) are taken as-is.
function parseDueDate(v) {
  const s = String(v ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)))           return new Date(+m[1], +m[2]-1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return new Date(+m[3], +m[2]-1, +m[1]);
  if ((m = s.match(/^(?:on\s+|every\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of\s+(?:every|each)\s+month)?$/i))) {
    const day = +m[1];
    if (day < 1 || day > 31) return null;
    const last = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
    return new Date(currentMonth.year, currentMonth.month, Math.min(day, last));   // "31st" → 30 Nov
  }
  return null;
}
// Unpaid bills and open lending entries that are overdue or due within DUE_SOON_DAYS
function computeDueAlerts(d = data, today = new Date()) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = due => Math.round((due - t0) / 86400000);   // round() absorbs DST hour shifts
  const out = [];
  const sectionLabel = { fixed:'Fixed', semifixed:'Semi Fixed' };
  LOAN_SECTIONS.forEach(k => (d[k] || []).forEach(r => {
    if (sameText(r.status, 'Paid')) return;
    const due = parseDueDate(r.dateToPay);
    if (due) out.push({ name: r.source || '—', what: sectionLabel[k], amount: toNum(r.amount), due, days: days(due) });
  }));
  (d.lending || []).forEach(r => {
    if (sameText(r.status, 'Fully Paid') || lendBalance(r) <= 0) return;
    const due = parseDueDate(r.dueDate);
    const what = sameText(r.type, 'Borrowed') ? 'To pay back' : 'To receive';
    if (due) out.push({ name: r.personName || '—', what, amount: lendBalance(r), due, days: days(due) });
  });
  return out.filter(a => a.days <= DUE_SOON_DAYS).sort((a, b) => a.days - b.days);
}

function renderDashboard(c) {
  const t = computeTotals();
  const usedBar = t.usedPct === null ? 0 : Math.min(100, t.usedPct);  // bar is capped, the % text is not
  const over    = t.usedPct !== null && t.usedPct > 100;

  const noFile = !currentFileId ? `<div class="load-card">
    <div class="load-card-title">${icon('folderOpen')} ${MONTHS[currentMonth.month]} ${currentMonth.year}</div>
    <div class="load-card-sub">No file loaded. Tap below to load or create from master template.</div>
    <button class="btn btn-primary" style="width:100%" onclick="loadOrCreateCurrentMonth()">${icon('filePlus')} Load / Create Month File</button>
  </div>` : '';

  const money = (v, color) => `<td style="text-align:right;color:var(${color});font-family:var(--font-mono)">${v>0?fmt(v):'-'}</td>`;
  const catLabels = { fixed:'Fixed', semifixed:'Semi Fixed', variable:'Variable', unexpected:'Unexpected' };

  c.innerHTML = noFile + dueAlertsHtml() + `
    <div class="dashboard-grid">
      <div class="stat-card income">
        <div class="stat-label">Income Received</div>
        <div class="stat-value income">${fmt(t.incomePaid)}</div>
        <div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Expected total: <span style="color:var(--text)">${fmt(t.incomePaid + t.incomePending + t.incomeDelayed)}</span></div>
      </div>
      <div class="stat-card expenses">
        <div class="stat-label">Total Expenses (Paid)</div>
        <div class="stat-value expenses">${fmt(t.expPaid)}</div>
        ${t.expPending + t.expDelayed > 0 ? `<div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Still to pay: <span style="color:var(--pending)">${fmt(t.expPending + t.expDelayed)}</span></div>` : ''}
      </div>
      <div class="stat-card" style="background:linear-gradient(135deg,rgba(0,229,160,.08),rgba(0,229,160,.03));border-color:rgba(0,229,160,.25)">
        <div class="stat-label">${t.withdrawn > 0 ? 'Net Savings' : 'Total Savings'}</div>
        <div class="stat-value" style="color:var(--accent)">${fmt(t.netSaved)}</div>
        ${t.withdrawn > 0 ? `<div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Saved ${fmt(t.saved)} − Withdrawn <span style="color:var(--delayed)">${fmt(t.withdrawn)}</span></div>` : ''}
        <div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Pending: <span style="color:var(--pending)">${fmt(t.savingsPending)}</span></div>
        ${t.savingsPct !== null ? `
        <div style="margin-top:.55rem">
          <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--muted);margin-bottom:.25rem">
            <span>Target: ${fmt(t.savingsTarget)}</span>
            <span style="color:var(--accent);font-weight:700">${t.savingsPct.toFixed(1)}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, t.savingsPct)}%;background:linear-gradient(90deg,var(--accent),var(--accent))"></div></div>
        </div>` : ''}
      </div>
      <div class="stat-card balance">
        <div class="stat-label">Net Balance</div>
        <div class="stat-value ${t.net>=0?'balance-pos':'balance-neg'}">${fmt(t.net)}</div>
        <div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">Received − Paid Expenses − ${t.withdrawn > 0 ? 'Net Saved' : 'Saved'}</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-label">Pending Income</div>
        <div class="stat-value" style="color:var(--pending)">${fmt(t.incomePending)}</div>
        ${t.incomeDelayed>0?`<div style="font-size:.68rem;margin-top:.3rem;color:var(--delayed)">Delayed: ${fmt(t.incomeDelayed)}</div>`:''}
      </div>
      <div class="stat-card projected">
        <div class="stat-label">Projected Month-End</div>
        <div class="stat-value ${t.projected>=0?'balance-pos':'balance-neg'}">${fmt(t.projected)}</div>
        <div style="font-size:.68rem;margin-top:.3rem;color:var(--muted)">If all expected income arrives and every bill &amp; saving is done</div>
      </div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:.45rem;font-size:.73rem">
        <span style="color:var(--muted)">Spent + Saved vs Income Received</span>
        <span style="color:var(--accent2);font-family:var(--font-head);font-weight:700">${t.usedPct === null ? '—' : t.usedPct.toFixed(1)+'%'}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${usedBar}%"></div></div>
      ${over ? `<div style="font-size:.68rem;margin-top:.4rem;color:var(--accent2)">Over by ${fmt(-t.net)} — more spent/saved than received</div>` : ''}
    </div>
    <div class="section-head">Expense Breakdown</div>
    <div class="sheet-table">
      <div class="breakdown-table-wrap"><table style="min-width:unset;width:100%">
        <thead><tr><th>Category</th><th style="text-align:right">Paid</th><th style="text-align:right">Pending</th><th style="text-align:right">Delayed</th></tr></thead>
        <tbody>
          ${EXPENSE_SECTIONS.map(k => `<tr>
            <td>${catLabels[k]}</td>
            ${money(t.cat[k].paid,'--paid')}${money(t.cat[k].pending,'--pending')}${money(t.cat[k].delayed,'--delayed')}
          </tr>`).join('')}
          <tr style="border-top:1px solid var(--border);font-weight:700">
            <td>Total Expenses</td>
            <td style="text-align:right;color:var(--paid);font-family:var(--font-mono)">${fmt(t.expPaid)}</td>
            <td style="text-align:right;color:var(--pending);font-family:var(--font-mono)">${fmt(t.expPending)}</td>
            <td style="text-align:right;color:var(--delayed);font-family:var(--font-mono)">${fmt(t.expDelayed)}</td>
          </tr>
          <tr>
            <td>Savings <span style="font-size:.65rem;color:var(--muted)">(${t.withdrawn > 0 ? 'Saved − Withdrawn' : 'Saved'} / Pending)</span></td>
            ${money(t.netSaved,'--paid')}${money(t.savingsPending,'--pending')}<td style="text-align:right;color:var(--muted)">-</td>
          </tr>
        </tbody>
      </table></div>
    </div>

    ${categoryChartHtml(t)}
    ${loansHtml(t)}
    ${comparisonHtml(t)}

    ${(()=>{
      const lend = data.lending || [];
      if (lend.length === 0) return '';
      const cell = (label, v, color) => `<div>
            <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem">${label}</div>
            <div style="font-family:var(--font-head);font-size:1rem;font-weight:700;color:var(${color})">${fmt(v)}</div>
          </div>`;
      return `
      <div class="section-head" style="margin-top:1.4rem">
        ${icon('users')} Lending & Borrowing
        <span style="font-size:.65rem;font-weight:400;color:var(--muted);margin-left:.5rem;text-transform:none;letter-spacing:0">— not included in salary calculations</span>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.9rem .75rem;text-align:center">
          ${cell('Total Lent', t.lent, '--accent2')}
          ${cell('Total Borrowed', t.borrowed, '--accent3')}
          ${cell('To Receive', t.toReceive, '--paid')}
          ${cell('To Pay', t.toPay, '--delayed')}
        </div>
        <div style="margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border);display:flex;justify-content:center;gap:1.5rem;font-size:.7rem;color:var(--muted)">
          <span>${icon('checkCircle')} Settled: <strong style="color:var(--paid)">${t.lendSettled}</strong></span>
          <span>${icon('clock')} Open: <strong style="color:var(--pending)">${t.lendOpen}</strong></span>
          <span>${icon('list')} Total entries: <strong>${lend.length}</strong></span>
        </div>
      </div>`;
    })()}

    ${(()=>{
      const nm = data.nextmonth || [];
      const stagedRows = nm.filter(r => sameText(r.status, 'Staged'));
      if (stagedRows.length === 0) return '';
      const total = sum(stagedRows, 'amount');
      return `
      <div class="section-head" style="margin-top:1.4rem">
        ${icon('arrowRightCircle')} Next Month
        <span style="font-size:.65rem;font-weight:400;color:var(--muted);margin-left:.5rem;text-transform:none;letter-spacing:0">— not included in this month's balance</span>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;text-align:center">
          <div>
            <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem">Staged Entries</div>
            <div style="font-family:var(--font-head);font-size:1rem;font-weight:700;color:var(--accent3)">${stagedRows.length}</div>
          </div>
          <div>
            <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.25rem">Total Amount</div>
            <div style="font-family:var(--font-head);font-size:1rem;font-weight:700;color:var(--accent3)">${fmt(total)}</div>
          </div>
        </div>
        <div style="margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border);font-size:.68rem;color:var(--muted);text-align:center;line-height:1.5">
          These will move to ${MONTHS[(currentMonth.month+1)%12]} when you open it.
        </div>
      </div>`;
    })()}`;
}

// ── DASHBOARD SECTIONS ────────────────────────────────────────────────────
function sectionHead(ic, title, note) {
  return `<div class="section-head">${icon(ic)} ${title}${note ? `<span class="section-note">— ${note}</span>` : ''}</div>`;
}
function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

function dueAlertsHtml() {
  if (!currentFileId) return '';
  const alerts = computeDueAlerts();
  if (alerts.length === 0) return '';
  const when = a => a.days < 0 ? `Overdue by ${plural(-a.days, 'day')}`
                  : a.days === 0 ? 'Due today'
                  : `Due in ${plural(a.days, 'day')}`;
  return `${sectionHead('bell', 'Due Soon', `unpaid, overdue or due within ${DUE_SOON_DAYS} days`)}
    <div class="dash-panel due-list">
      ${alerts.map(a => `<div class="due-item ${a.days < 0 ? 'overdue' : 'soon'}">
        ${icon(a.days < 0 ? 'alertCircle' : 'clock', 'due-ico')}
        <div class="due-main">
          <div class="due-name">${escHtml(a.name)}</div>
          <div class="due-sub">${escHtml(a.what)} · ${fmtDate(a.due.getFullYear()+'-'+String(a.due.getMonth()+1).padStart(2,'0')+'-'+String(a.due.getDate()).padStart(2,'0'))}</div>
        </div>
        <div class="due-right">
          <div class="due-amt">${fmt(a.amount)}</div>
          <div class="due-when">${when(a)}</div>
        </div>
      </div>`).join('')}
    </div>`;
}

// Horizontal bar list — one series (amount), so one hue; bars share a baseline and
// are scaled to the largest category. Tap a category to see its subcategories.
const CATEGORY_LIMIT = 8;
function categoryChartHtml(t) {
  let cats = t.categories;
  if (cats.length === 0) return '';
  if (cats.length > CATEGORY_LIMIT) {
    const rest = cats.slice(CATEGORY_LIMIT - 1);
    cats = [...cats.slice(0, CATEGORY_LIMIT - 1),
            { name: `Other (${rest.length})`, amount: round2(rest.reduce((s, c) => s + c.amount, 0)),
              subs: rest.map(c => ({ name: c.name, amount: c.amount })) }];
  }
  const total = round2(cats.reduce((s, c) => s + c.amount, 0));
  const max   = Math.max(...cats.map(c => c.amount));
  const row = c => {
    const pct = c.amount / total * 100;
    const head = `<div class="cat-top">
        <span class="cat-name">${escHtml(c.name)}${c.subs.length ? icon('chevronRight', 'cat-chev') : ''}</span>
        <span class="cat-amt">${fmt(c.amount)}<span class="cat-pct">${pct.toFixed(pct < 10 ? 1 : 0)}%</span></span>
      </div>
      <div class="cat-track"><div class="cat-bar" style="width:${Math.max(1, c.amount / max * 100)}%"></div></div>`;
    const tip = `${escAttr(c.name)}: ${fmt(c.amount)} · ${pct.toFixed(1)}% of paid expenses`;
    if (!c.subs.length) return `<div class="cat-row" title="${tip}">${head}</div>`;
    return `<details class="cat-row"><summary title="${tip}">${head}</summary>
      <div class="cat-subs">${c.subs.map(x => `<div class="cat-sub"><span>${escHtml(x.name)}</span><span>${fmt(x.amount)}</span></div>`).join('')}</div>
    </details>`;
  };
  return `${sectionHead('chartBar', 'Spending by Category', `paid expenses, ${fmt(total)}`)}
    <div class="dash-panel cat-chart">${cats.map(row).join('')}</div>`;
}

function miniStat(label, value, color) {
  return `<div class="mini-stat"><div class="mini-label">${label}</div><div class="mini-value"${color ? ` style="color:var(${color})"` : ''}>${value}</div></div>`;
}

function loansHtml(t) {
  if (t.loanCount === 0) return '';
  const high = t.emiPct !== null && t.emiPct >= EMI_GUIDELINE_PCT;
  return `${sectionHead('bank', 'Loans & EMIs', plural(t.loanCount, 'loan'))}
    <div class="dash-panel">
      <div class="mini-grid">
        ${miniStat('EMIs This Month', fmt(t.emi), '--accent2')}
        ${miniStat('Principal Remaining', fmt(t.loanRemaining), '--pending')}
        ${miniStat('Repaid', t.loanRepaidPct === null ? '—' : t.loanRepaidPct.toFixed(1) + '%', '--paid')}
        ${miniStat('Avg Interest', t.loanRate === null ? '—' : t.loanRate.toFixed(2) + '%')}
      </div>
      <div class="panel-foot">
        <div style="display:flex;justify-content:space-between;font-size:.73rem">
          <span style="color:var(--muted)">EMI burden vs expected income</span>
          <span style="font-family:var(--font-head);font-weight:700">${t.emiPct === null ? '—' : t.emiPct.toFixed(1) + '%'}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${t.emiPct === null ? 0 : Math.min(100, t.emiPct)}%;background:var(${high ? '--delayed' : '--accent'})"></div></div>
        ${t.emiPct === null ? '' : `<div class="status-line" style="color:var(${high ? '--delayed' : '--paid'})">
          ${icon(high ? 'alertCircle' : 'checkCircle')} ${high ? 'Above' : 'Within'} the ${EMI_GUIDELINE_PCT}% guideline</div>`}
      </div>
    </div>`;
}

// This month vs the previous month's file. For money going out, up is shown as bad.
function comparisonHtml(t) {
  if (!prevMonth || !currentFileId) return '';
  const p = prevMonth.totals;
  const rows = [
    ['Income Received', t.incomePaid, p.incomePaid, true],
    ['Expenses Paid',   t.expPaid,    p.expPaid,    false],
    ...EXPENSE_SECTIONS.map(k => [`<span class="cmp-indent">${{fixed:'Fixed',semifixed:'Semi Fixed',variable:'Variable',unexpected:'Unexpected'}[k]}</span>`,
                                  t.cat[k].paid, p.cat[k].paid, false]),
    ['Net Savings',     t.netSaved,   p.netSaved,   true],
    ['Net Balance',     t.net,        p.net,        true],
  ];
  const change = (cur, prev, upIsGood) => {
    const diff = round2(cur - prev);
    if (diff === 0) return `<span style="color:var(--muted)">No change</span>`;
    const good = (diff > 0) === upIsGood;
    const pct  = prev !== 0 ? ` (${Math.abs(diff / prev * 100).toFixed(Math.abs(diff / prev) < .1 ? 1 : 0)}%)` : '';
    return `<span style="color:var(${good ? '--paid' : '--delayed'})">${icon(diff > 0 ? 'arrowUp' : 'arrowDown')}${fmt(Math.abs(diff))}${pct}</span>`;
  };
  const short = prevMonth.label.slice(0, 3);
  return `${sectionHead('trendingUp', 'Compared to ' + prevMonth.label)}
    <div class="sheet-table"><div class="breakdown-table-wrap"><table class="cmp-table" style="min-width:unset;width:100%">
      <thead><tr><th></th><th style="text-align:right">${short}</th><th style="text-align:right">${MONTHS[currentMonth.month].slice(0,3)} <span style="font-weight:400">/ change</span></th></tr></thead>
      <tbody>${rows.map(([label, cur, prev, upIsGood]) => `<tr>
        <td>${label}</td>
        <td class="num" style="color:var(--muted)">${fmt(prev)}</td>
        <td class="num">${fmt(cur)}<div class="cmp-change">${change(cur, prev, upIsGood)}</div></td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
}

// ── ROW-CARD CONFIG (used for mobile card view) ───────────────────────────
const PRIMARY_FIELD = {
  income:'source', savings:'source', fixed:'source', semifixed:'source',
  variable:'source', unexpected:'source', lending:'personName', nextmonth:'source'
};
const META_FIELD = {
  income:'category', savings:'category', fixed:'category', semifixed:'category',
  variable:'category', unexpected:'category', lending:'type', nextmonth:'targetSection'
};
const DATE_FIELD = {
  income:'dateReceived', savings:'date', fixed:'datePaid', semifixed:'datePaid',
  variable:'date', unexpected:'date', lending:'dateGiven', nextmonth:'date'
};
const PAYMENT_FIELD = {
  income:'paymentMode', savings:'paymentMode', fixed:'paymentMode', semifixed:'paymentMode',
  variable:'paymentMode', unexpected:'paymentMode', lending:'mode', nextmonth:'paymentMode'
};
// fixed / semifixed have no account column
const ACCOUNT_FIELD = {
  income:'accountReceived', savings:'accountUsed', variable:'accountUsed',
  unexpected:'accountUsed', lending:'accountUsed', nextmonth:'accountUsed'
};
// "2026-10-02" → "02 Oct 2026"; anything else is shown as-is
function fmtDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return v || '';
  return new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
// Collapsed-card detail line: date · payment mode · account (always shown, "—" when empty)
function cardDetailsHtml(key, row) {
  const bits = [
    ['calendar',   DATE_FIELD[key]    ? fmtDate(row[DATE_FIELD[key]]) : null],
    ['creditCard', PAYMENT_FIELD[key] ? row[PAYMENT_FIELD[key]]       : null],
    ['bank',       ACCOUNT_FIELD[key] ? row[ACCOUNT_FIELD[key]]       : null],
  ].filter(([, v]) => v !== null);
  return bits.map(([name, v]) =>
    `<span class="row-card-chip${v ? '' : ' empty'}">${icon(name)} ${escHtml(v || '—')}</span>`
  ).join('');
}
function statusSlug(s) { return (s||'empty').toString().toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function isMobileView() { return window.matchMedia('(max-width: 767px)').matches; }
function escAttr(v) { return (v ?? '').toString().replace(/"/g,'&quot;'); }
function escHtml(v) { return (v ?? '').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function renderSheet(c, key, title) {
  const rows    = data[key]    || [];
  // If all rows have been deleted, restore schema from master cache so new rows get correct headers
  if (rows.length === 0 && SCHEMAS_MASTER[key] && SCHEMAS_MASTER[key].length > 1) {
    SCHEMAS[key] = JSON.parse(JSON.stringify(SCHEMAS_MASTER[key]));
  }
  const schema = SCHEMAS[key] || [];

  if (isMobileView()) { renderSheetCards(c, key, title, rows, schema); return; }
  renderSheetTable(c, key, title, rows, schema);
}

function renderSheetTable(c, key, title, rows, schema) {
  // Status colour coding matches Excel status values
  const stColor = {
    'Paid':         'var(--paid)',
    'Pending':      'var(--pending)',
    'Delayed':      'var(--delayed)',
    'Partially Paid':'var(--accent3)',
    'Fully Paid':   'var(--paid)',
    'Staged':       'var(--accent3)',
    'Migrated':     'var(--muted)'
  };

  const thead = schema.map(col=>`<th>${col.label}</th>`).join('')+'<th></th>';
  const tbody = rows.length===0 ? '' : rows.map((row,ri)=>{
      const id = row._id;
      return `<tr data-id="${id}">${schema.map(col=>{
        const v=escHtml(row[col.key]);
        if (col.type==='sno')      return `<td style="color:var(--muted);font-size:.68rem;min-width:22px">${ri+1}</td>`;
        if (col.type==='readonly') return `<td style="font-family:var(--font-mono);font-size:.8rem;color:var(--accent3);min-width:80px;text-align:right">${v||'—'}</td>`;
        if (col.type==='select')   return `<td><select class="inline-select" style="color:${stColor[row[col.key]]||'var(--text)'}" onchange="updateCell('${key}','${id}','${col.key}',this.value,this)"><option value="">—</option>${(col.opts||[]).map(o=>`<option ${o===row[col.key]?'selected':''}>${escHtml(o)}</option>`).join('')}</select></td>`;
        if (col.type==='number')   return `<td><input class="inline-input" type="number" step="0.01" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value,this)" style="width:90px;text-align:right"></td>`;
        if (col.type==='date')     return `<td><input class="inline-input" type="date" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value,this)" style="width:118px"></td>`;
        if (col.type==='textarea') return `<td><input class="inline-input" type="text" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value,this)" style="min-width:120px"></td>`;
        return `<td><input class="inline-input" type="text" value="${v}" onchange="updateCell('${key}','${id}','${col.key}',this.value,this)" style="min-width:65px"></td>`;
      }).join('')}<td><button class="delete-btn" onclick="deleteRow('${key}','${id}')" title="Delete">${icon('x')}</button></td></tr>`;
    }).join('');

  // Empty state: show table with headers + a "no entries" row so column structure is always visible
  const emptyTbody = rows.length===0
    ? `<tr><td colspan="${schema.length+1}" style="text-align:center;padding:2rem 1rem;color:var(--muted);font-size:.82rem">No entries yet — tap Add Entry to get started.</td></tr>`
    : '';

  c.innerHTML = `
    <div class="add-entry-center">
      <button class="add-entry-btn" onclick="showAddRow('${key}','${title}')">${icon('plus')} Add Entry</button>
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

// ── MOBILE: render rows as expandable cards ──────────────────────────────
function renderCardField(col, row, key, id) {
  if (col.type === 'sno') return '';
  const v = escAttr(row[col.key]);
  const span = (col.type === 'textarea') ? ' span-2' : '';
  const onchange = `updateCell('${key}','${id}','${col.key}',this.value,this)`;
  let input;
  if (col.type === 'readonly') {
    input = `<div class="form-readonly">${escHtml(row[col.key]) || '—'}</div>`;
  } else if (col.type === 'select') {
    input = `<select class="form-select" onchange="${onchange}"><option value="">—</option>${(col.opts||[]).map(o=>`<option ${o===row[col.key]?'selected':''}>${escHtml(o)}</option>`).join('')}</select>`;
  } else if (col.type === 'number') {
    input = `<input class="form-input" type="number" step="0.01" value="${v}" onchange="${onchange}">`;
  } else if (col.type === 'date') {
    input = `<input class="form-input" type="date" value="${v}" onchange="${onchange}">`;
  } else if (col.type === 'textarea') {
    input = `<textarea class="form-input" rows="2" onchange="${onchange}">${escHtml(row[col.key])}</textarea>`;
  } else {
    input = `<input class="form-input" type="text" value="${v}" onchange="${onchange}">`;
  }
  return `<div class="form-group${span}"><label class="form-label">${col.label}</label>${input}</div>`;
}

function renderSheetCards(c, key, title, rows, schema) {
  const primaryK = PRIMARY_FIELD[key]    || 'source';
  const metaK    = META_FIELD[key]       || 'category';

  const empty = `<div class="row-card" style="text-align:center;padding:2rem 1rem;color:var(--muted);font-size:.82rem">
    No entries yet — tap <strong style="color:var(--accent)">Add Entry</strong> to get started.
  </div>`;

  const cards = rows.map((row, i) => {
    const id      = row._id;
    const primary = row[primaryK] || '—';
    const metaTxt  = row[metaK] || '\u00A0';
    const status   = row.status || '';
    const slug     = statusSlug(status);
    const amountTxt = (row.amount !== undefined && row.amount !== '')
      ? fmt(row.amount) : (key === 'lending' && row.balance ? fmt(row.balance) : '—');

    const bodyFields = schema.map(col => renderCardField(col, row, key, id)).join('');

    return `<details class="row-card" data-id="${id}">
      <summary>
        <div class="row-card-num">${i+1}</div>
        <div class="row-card-main">
          <div class="row-card-title">${escHtml(primary)}</div>
          <div class="row-card-meta">${escHtml(metaTxt)}</div>
        </div>
        <div class="row-card-right">
          <div class="row-card-amount">${amountTxt}</div>
          <div class="row-card-status status-${slug}">${escHtml(status || '—')}</div>
        </div>
        <div class="row-card-details">${cardDetailsHtml(key, row)}</div>
      </summary>
      <div class="row-card-body">
        ${bodyFields}
        <div class="row-card-actions">
          <button class="delete-btn-card" onclick="deleteRow('${key}','${id}')">${icon('trash')} Delete entry</button>
        </div>
      </div>
    </details>`;
  }).join('');

  c.innerHTML = `
    <div class="add-entry-center">
      <button class="add-entry-btn" onclick="showAddRow('${key}','${title}')">${icon('plus')} Add Entry</button>
    </div>
    <div class="section-head">${title} · ${rows.length} ${rows.length===1?'entry':'entries'}</div>
    <div class="card-list">${rows.length === 0 ? empty : cards}</div>`;
}

// Re-render the active sheet on viewport breakpoint changes (rotate / resize)
let _lastIsMobile = isMobileView();
window.addEventListener('resize', () => {
  const now = isMobileView();
  if (now === _lastIsMobile) return;
  _lastIsMobile = now;
  if (currentTab !== 'dashboard') switchTab(currentTab);
});

// ── CELL EDIT / DELETE ────────────────────────────────────────────────────
// Rejects an edit that would make the numbers meaningless; returns the error message or ''
function validateEdit(key, row, field, value) {
  const col = (SCHEMAS[key] || []).find(c => c.key === field);
  if (!col || col.type !== 'number' || String(value ?? '').trim() === '') return '';
  if (!isFinite(parseFloat(String(value).replace(/[₹,\s]/g, '')))) return 'Please enter a valid number';
  if (toNum(value) < 0) return `${col.label.replace(/\s*\(₹\)/, '')} can't be negative`;
  if (key === 'lending' && (field === 'amount' || field === 'returned')) {
    const amount   = field === 'amount'   ? toNum(value) : toNum(row.amount);
    const returned = field === 'returned' ? toNum(value) : toNum(row.returned);
    if (returned > amount) return `Returned (${fmt(returned)}) can't be more than Amount (${fmt(amount)})`;
  }
  return '';
}

function updateCell(key, rowId, field, value, el) {
  const row = data[key].find(r => r._id === rowId);
  if (!row) return;
  const err = validateEdit(key, row, field, value);
  if (err) {
    showToast(err, 'error');
    if (el) el.value = row[field] ?? '';   // put the previous value back
    return;
  }
  row[field] = value;

  if (key === 'lending') {
    row.balance = String(lendBalance(row));
    // Update the rendered balance cell immediately without full re-render (table view)
    const tr = document.querySelector(`tr[data-id="${rowId}"]`);
    if (tr) {
      const schema = SCHEMAS[key] || [];
      const balIdx = schema.findIndex(c => c.key === 'balance');
      const cells  = tr.querySelectorAll('td');
      if (balIdx >= 0 && cells[balIdx]) cells[balIdx].textContent = row.balance || '—';
    }
    // Update balance readonly inside expanded card body, if present
    const cardBalance = document.querySelector(`.row-card[data-id="${rowId}"] .form-readonly`);
    if (cardBalance) cardBalance.textContent = row.balance || '—';
  }

  // Live-update card summary (mobile view) so the collapsed header stays accurate
  const card = document.querySelector(`.row-card[data-id="${rowId}"]`);
  if (card) {
    const primaryK = PRIMARY_FIELD[key], metaK = META_FIELD[key];
    if (field === primaryK) {
      const t = card.querySelector('.row-card-title');
      if (t) t.textContent = value || '—';
    }
    if (field === metaK) {
      const m = card.querySelector('.row-card-meta');
      if (m) m.textContent = value || '\u00A0';
    }
    if (field === DATE_FIELD[key] || field === PAYMENT_FIELD[key] || field === ACCOUNT_FIELD[key]) {
      const d = card.querySelector('.row-card-details');
      if (d) d.innerHTML = cardDetailsHtml(key, row);
    }
    if (field === 'amount') {
      const a = card.querySelector('.row-card-amount');
      if (a) a.textContent = String(value ?? '').trim() !== '' ? fmt(value) : '—';
    }
    if (field === 'status') {
      const s = card.querySelector('.row-card-status');
      if (s) { s.textContent = value || '—'; s.className = `row-card-status status-${statusSlug(value)}`; }
    }
  }

  markDirty();
}
async function deleteRow(key, rowId) {
  const row = data[key].find(r => r._id === rowId);
  if (!row) return;
  const label = row.source || row.personName || row.name || `Row`;

  // Custom confirm modal — ask about monthly file first
  const confirmed = await showConfirmModal(
    'Delete Row',
    `Delete <strong>${escHtml(label)}</strong> from this month's file?`
  );
  if (!confirmed) return;

  // Remove from monthly data using _id — safe across DataTables pagination
  const idx = data[key].findIndex(r => r._id === rowId);
  if (idx === -1) return;
  data[key].splice(idx, 1);
  markDirty();

  // Now ask about master.json (skip for nextmonth — never written there)
  if (accessToken && MASTER_FILE_ID && key !== 'nextmonth') {
    const alsoMaster = await showConfirmModal(
      'Also delete from Master?',
      `Do you also want to remove <strong>${escHtml(label)}</strong> from <code>master.json</code>?<br><span style="font-size:.75rem;color:var(--muted)">This will affect all future months created from master.</span>`
    );
    if (alsoMaster) {
      await syncDeleteToMaster(key, label, row);
    }
  }

  switchTab(currentTab);
}

// Fields that are blanked when a row is copied into master.json
const MASTER_MONTH_ONLY_FIELDS = ['dateReceived','datePaid','dateGiven','dateStart','dateEnd','dueDate','date','amount','returned','balance','_id'];

async function syncDeleteToMaster(key, label, deletedRow) {
  try {
    showToast('Syncing deletion to master.json...', 'info');
    const { id: masterFileId, text: masterText } = await downloadMaster();
    const masterData   = JSON.parse(masterText);

    if (!masterData[key]) { showToast('Section not found in master.json', 'error'); return; }

    // Match by source/personName/name — same field used for the label
    const matchKeys = ['source', 'personName', 'name'];
    const matchKey  = matchKeys.find(k => deletedRow[k]);
    const matchVal  = matchKey ? deletedRow[matchKey] : null;

    const masterRows = masterData[key];
    let candidates = matchVal ? masterRows.filter(r => r[matchKey] === matchVal) : [];

    // Several master rows share the name — narrow down on the structural fields
    // master keeps (month-specific fields are blank there, so they can't be compared)
    if (candidates.length > 1) {
      const skip = new Set([...MASTER_MONTH_ONLY_FIELDS, 'sno', 'status', '_carriedFrom', '_carriedFromId']);
      const fields = Object.keys(deletedRow).filter(k => !skip.has(k) && k !== matchKey);
      const exact = candidates.filter(r => fields.every(k => (r[k] ?? '') === (deletedRow[k] ?? '')));
      if (exact.length !== 1) {
        showToast(`${candidates.length} rows named "${label}" in master.json — couldn't tell which one, so none were deleted. Use Edit Master JSON.`, 'error');
        return;
      }
      candidates = exact;
    }

    const idx = candidates.length === 1 ? masterRows.indexOf(candidates[0]) : -1;
    if (idx === -1) {
      showToast(`Could not find "${label}" in master.json — not deleted there`, 'error');
      return;
    }

    masterData[key].splice(idx, 1);
    // Re-number sno
    masterData[key].forEach((r, i) => { if (r.sno !== undefined) r.sno = i + 1; });

    await driveUploadJson(masterFileId, masterData, 'master.json');
    buildSchemasFromData(masterData);
    showToast(`"${label}" deleted from master.json too`, 'success');
  } catch(e) {
    showToast('Master sync error: ' + e.message, 'error');
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

function markDirty() {
  hasChanges = true;
  document.getElementById('syncBar').classList.add('visible');
  // Re-render dashboard immediately if it's the current tab so totals stay live
  if (currentTab === 'dashboard') {
    renderDashboard(document.getElementById('content'));
  }
}

// Called after any tab switch to dashboard — always reads live data[]
// (No caching — data[] is the single source of truth)
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
      if      (col.type==='select')   {
        // Pre-select sensible defaults for the Next Month tab
        let preset = '';
        if (key === 'nextmonth' && col.key === 'status')        preset = 'Staged';
        if (key === 'nextmonth' && col.key === 'targetSection') preset = 'Variable';
        input = `<select class="form-select" name="${col.key}"><option value="">Select...</option>${(col.opts||[]).map(o=>`<option${o===preset?' selected':''}>${escHtml(o)}</option>`).join('')}</select>`;
      }
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
  form.querySelectorAll('.form-input,.form-select').forEach(el => el.classList.remove('input-error'));

  let hasError = false;

  const nameField = form.querySelector('[name="source"],[name="personName"],[name="name"]');
  if (nameField && !nameField.value.trim()) {
    nameField.classList.add('input-error');
    nameField.focus();
    showToast('Please enter a name / source', 'error');
    hasError = true;
  }

  const amountField = form.querySelector('[name="amount"]');
  if (amountField && toNum(amountField.value) <= 0) {
    amountField.classList.add('input-error');
    if (!hasError) { amountField.focus(); showToast('Amount must be greater than 0', 'error'); }
    hasError = true;
  }

  if (!hasError) {
    const draft = {};
    form.querySelectorAll('[name]').forEach(el => draft[el.name] = el.value);
    for (const col of schema) {
      const err = col.type === 'number' ? validateEdit(key, draft, col.key, draft[col.key]) : '';
      if (err) {
        const el = form.querySelector('[name="' + col.key + '"]');
        if (el) { el.classList.add('input-error'); el.focus(); }
        showToast(err, 'error');
        hasError = true;
        break;
      }
    }
  }

  if (hasError) return;
  // ─────────────────────────────────────────────────────────────────────

  const row = { _id: key + '_' + Date.now() };
  schema.forEach(col => {
    if (col.type === 'sno')      { row.sno = (data[key]||[]).length + 1; return; }
    if (col.type === 'readonly') return;
    const el = form.querySelector('[name="' + col.key + '"]');
    row[col.key] = el ? el.value : '';
  });
  if (key === 'lending') row.balance = String(lendBalance(row));

  if (!data[key]) data[key] = [];
  data[key].push(row);

  closeModal('addRowModal');
  markDirty();

  // Switch to the section tab so user sees new row immediately
  switchTab(key);

  // Ask if user wants to add to master.json too (skip for nextmonth — transient by design)
  if (accessToken && MASTER_FILE_ID && key !== 'nextmonth') {
    const label = row.source || row.personName || row.name || 'new row';
    const alsoMaster = await showConfirmModal(
      'Also add to Master?',
      `Add <strong>${escHtml(label)}</strong> to <code>master.json</code> as well?<br><span style="font-size:.75rem;color:var(--muted)">It will then appear in all future months created from master.</span>`
    );
    if (alsoMaster) {
      await syncAddToMaster(key, row);
    }
  }

  // Final re-render of section tab to ensure DataTables is stable
  switchTab(key);
}

async function syncAddToMaster(key, newRow) {
  try {
    showToast('Syncing new row to master.json...', 'info');
    const { id: masterFileId, text: masterText } = await downloadMaster();
    const masterData   = JSON.parse(masterText);

    if (!masterData[key]) masterData[key] = [];

    // Strip month-specific fields (dates, amounts) — keep structural fields only
    const masterRow = {};
    Object.keys(newRow).forEach(k => {
      masterRow[k] = MASTER_MONTH_ONLY_FIELDS.includes(k) ? '' : newRow[k];
    });
    masterRow.sno = masterData[key].length + 1;
    masterRow.status = 'Pending'; // always reset to Pending in master

    masterData[key].push(masterRow);

    await driveUploadJson(masterFileId, masterData, 'master.json');
    buildSchemasFromData(masterData);
    const label = newRow.source || newRow.personName || newRow.name || 'row';
    showToast(`"${label}" added to master.json too`, 'success');
  } catch(e) {
    showToast('Master sync error: ' + e.message, 'error');
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
  pickerMonth.year += d;
  document.getElementById('yearDisplay').textContent = pickerMonth.year;
}
async function applyMonth() {
  if (hasChanges) {
    const ok = await showConfirmModal(
      'Unsaved Changes',
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
  showToast('Settings saved!','success');
}

// ── THEME ─────────────────────────────────────────────────────────────────
function toggleTheme() {
  const isDay=document.body.classList.toggle('day');
  localStorage.setItem('st_theme', isDay?'day':'night');
}
function applyStoredTheme() {
  // Light mode is the default (iOS-style); only apply dark mode if explicitly chosen
  if (localStorage.getItem('st_theme') !== 'night') document.body.classList.add('day');
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function setFileStatus(linked) {
  const el=document.getElementById('fileStatus');
  el.className='file-status'+(linked?' linked':'');
  el.innerHTML=`<div class="dot"></div><span>${linked?getFileName():'No file'}</span>`;
}
function resetData() { data={}; SCHEMAS={}; prevMonth=null; }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

let toastTimer;
function showToast(msg, type='info') {
  const t=document.getElementById('toast');
  const ico = { success:'checkCircle', error:'alertCircle', info:'info' }[type] || 'info';
  t.innerHTML = icon(ico) + `<span>${escHtml(msg)}</span>`;
  t.className = `toast ${type} show`;
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

  hydrateIcons();
  applyStoredTheme();
  updateMonthDisplay();
  renderMonthGrid();
  document.querySelectorAll('.modal-overlay').forEach(el=>{
    el.addEventListener('click', e=>{ if(e.target===el) el.classList.remove('open'); });
  });
});
