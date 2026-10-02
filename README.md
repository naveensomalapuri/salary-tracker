# 💰 Salary Tracker
### Naveen Somalapuri — Mobile Finance Manager

A mobile-first web app to manage your monthly finances directly from your phone. All data is stored as clean **JSON files in your Google Drive** — no Excel formatting issues, no laptop needed.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📋 **Monthly files** | Auto-creates `March-2026_Salary_Tracker.json` from your master template each month |
| 📤 **Next Month carry-over** | Stage an expense now; it moves into next month's file automatically when you open that month |
| ✏️ **Inline editing** | Tap any cell to edit values, status, dates, amounts directly in the table |
| ➕ **Add / Delete rows** | Mobile-friendly form to add entries, one-tap delete |
| ☁️ **Save to Drive** | One tap saves your JSON back to Google Drive (warns if the file was changed on another device since you loaded it) |
| 📊 **Export Excel** | Download a formatted `.xlsx` anytime from the sync bar |
| 🌙 **Day / Night mode** | Toggle between dark and light theme — preference is remembered |
| 📅 **Month picker** | Switch any month/year freely |
| 📱 **Mobile first** | Built for phone, works on desktop too |

---

## 📂 Data Storage (JSON)

Each month's file is a clean JSON file saved in your Drive folder:

```
Drive Folder/
├── master.json                          ← your template (never modified)
├── January-2026_Salary_Tracker.json
├── February-2026_Salary_Tracker.json
├── March-2026_Salary_Tracker.json
└── ...
```

**No more Excel formatting issues.** The app reads/writes pure JSON. Use the **📊 Export Excel** button whenever you want a spreadsheet copy.

---

## 📋 Tabs & What They Track

| Tab | What it tracks |
|---|---|
| **Dashboard** | Total Income, Paid Expenses, Savings, Net Balance, Pending Income |
| **Income** | Salary and other income sources |
| **Savings** | Money set aside, with optional target amounts |
| **Fixed Expenses** | EMIs, loans, insurance (monthly fixed amounts) |
| **Semi Fixed** | Rent, recharges, bills (mostly fixed) |
| **Variable Expenses** | Weekly market, fuel, daily expenses |
| **Unexpected** | Medical, repairs, surprise costs |
| **Next Month** | Expenses to carry into next month (Variable / Unexpected / Fixed / Semi Fixed) |
| **Lending & Borrowing** | Money lent/borrowed with auto balance tracking |

### Status Values

- **Income & all Expense tabs:** `Paid` · `Pending` · `Delayed`
- **Savings:** `Saved` · `Pending` · `Withdrawn`
- **Next Month:** `Staged` · `Migrated`
- **Lending & Borrowing:** `Fully Paid` · `Partially Paid` · `Delayed`

### Dashboard Logic

The dashboard **only counts rows where `status = Paid`** (or `Saved` for savings):

| Card | What it shows |
|---|---|
| **Total Income** | Sum of income rows marked Paid |
| **Total Expenses (Paid)** | Sum of Fixed + Semi Fixed + Variable + Unexpected rows marked Paid |
| **Total Savings** | Sum of savings rows marked Saved (with progress toward the target, if set) |
| **Net Balance** | Total Income − Paid Expenses − Savings |
| **Pending Income** | Sum of income rows marked Pending (Delayed shown underneath) |

The breakdown table shows **Paid**, **Pending**, and **Delayed** columns per expense category plus Savings. Lending & Borrowing and Next Month are shown separately and excluded from the totals.

### Next Month carry-over

Rows in the **Next Month** tab with status `Staged` are copied into next month's file (into the section chosen in **Apply To**, with status `Pending`) the first time that month is loaded. The new month is saved first, then the source rows are marked `Migrated`, so nothing is lost if the process is interrupted.

---

## 🚀 Deployment — GitHub Pages

### Step 1 — Create GitHub Repo
1. Go to [github.com](https://github.com) and create a **New Repository**
2. Name it `salary-tracker`
3. Upload `index.html` to the repo root
4. Go to **Settings → Pages → Source: Deploy from branch → main → / (root)**
5. Your app URL: `https://naveensomalapuri.github.io/salary-tracker/`

---

## 🔑 Google API Setup (One-Time)

### Step 1 — Create Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → give it a name → Create
3. Select the project

### Step 2 — Enable Google Drive API
1. Go to **APIs & Services → Library**
2. Search **Google Drive API** → Enable

### Step 3 — Create OAuth 2.0 Client ID
1. Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
2. If prompted, configure consent screen: **External** → fill App name → Save
3. Application type: **Web Application**
4. Under **Authorized JavaScript origins** add:
   ```
   https://naveensomalapuri.github.io
   ```
5. Click **Create** → copy the **Client ID**

### Step 4 — Get Your Destination Folder ID
1. Open the Google Drive folder where you want monthly files saved
2. URL looks like: `https://drive.google.com/drive/folders/XXXXXXXX`
3. Copy the ID after `/folders/` — that is your **Folder ID**

### Step 5 — Upload master.json
New month files are created from `master.json` in your Drive (there is no built-in fallback):
1. Upload `master.json` to your Drive folder (keep it private — the signed-in account just needs access)
2. Right-click → Get link → copy the File ID from between `/d/` and `/view`
3. Paste it in the app Settings as **Master JSON File ID**

> **Pre-configured defaults already in the app:**
> - Master File ID: `1HNzAmH7cP7CRMtQyb8XkkyB0ttkNKicw`
> - Folder ID: `1FpSq1CKfMec2P3p15C8U7HFYgK-HLiNE`

### Step 6 — Configure the App
1. Open the app → tap **⚙️** in the top-right header
2. Paste your **Client ID**, **Master JSON File ID**, and **Folder ID**
3. Tap **💾 Save**

---

## 📱 Monthly Workflow

1. Open `https://naveensomalapuri.github.io/salary-tracker/` on your phone
2. Tap **Continue with Google** → sign in
3. Tap **📅** → select the month → **Apply**
4. On the Dashboard tap **📋 Load / Create Month File**
   - File already exists → loads it instantly from Drive
   - New month → auto-creates `Month-Year_Salary_Tracker.json` from master template
5. Go through each tab and update your data
6. Tap **☁️ Save** in the bottom bar to save back to Drive
7. Tap **📊 Excel** to download a `.xlsx` spreadsheet copy anytime

---

## 🔧 Tech Stack

| Tool | Purpose |
|---|---|
| HTML + CSS + JavaScript | Entire app — no frameworks, no build step, no server |
| Google Drive API v3 | File read/write via OAuth token — no API key needed |
| Google Identity Services | OAuth 2.0 sign-in |
| SheetJS (xlsx.js) | Excel export only |
| GitHub Pages | Free hosting |

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| Sign-in popup blocked | Allow popups for the site in your browser |
| Sign-in fails with origin error | Add `https://naveensomalapuri.github.io` to **Authorized JavaScript origins** in Google Cloud Console |
| Create error / master.json not found | Check the Master JSON File ID in Settings and that your account can open the file |
| "File changed on Drive" warning on Save | The file was saved from another device/tab after you loaded it. Choose No, then Discard to reload the latest copy, or Yes to overwrite it |
| File not found on load | Check the Folder ID in Settings and ensure you have edit access to that folder |
| Changes not saving | Make sure you are signed in and a file has been loaded (green dot shows in header) |
| Excel export looks plain | Expected — the export is a freshly generated file; use it for viewing or printing |
