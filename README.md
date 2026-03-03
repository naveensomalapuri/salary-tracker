# 💰 Salary Tracker
### Naveen Somalapuri — Mobile Finance Manager

A mobile-first web app to manage your monthly finances directly from your phone. All data is stored as clean **JSON files in your Google Drive** — no Excel formatting issues, no laptop needed.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📋 **Monthly files** | Auto-creates `March-2026_Salary_Tracker.json` from your master template each month |
| ✏️ **Inline editing** | Tap any cell to edit values, status, dates, amounts directly in the table |
| ➕ **Add / Delete rows** | Mobile-friendly form to add entries, one-tap delete |
| ☁️ **Save to Drive** | One tap saves your JSON back to Google Drive |
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
| **Dashboard** | Paid Income, Paid Expenses, Net Balance, Unpaid Income |
| **Income** | Salary and other income sources |
| **Fixed Expenses** | EMIs, loans, insurance (monthly fixed amounts) |
| **Semi Fixed** | Rent, recharges, bills (mostly fixed) |
| **Variable Expenses** | Weekly market, fuel, daily expenses |
| **Unexpected** | Medical, repairs, surprise costs |
| **Lending & Borrowing** | Money lent/borrowed with auto balance tracking |

### Status Values

- **Income & all Expense tabs:** `Paid` · `Pending` · `Delayed`
- **Lending & Borrowing:** `Fully Paid` · `Partially Paid` · `Pending`

### Dashboard Logic

The dashboard **only counts rows where `status = Paid`**:

| Card | What it shows |
|---|---|
| **Paid Income** | Sum of income rows marked Paid |
| **Paid Expenses** | Sum of Fixed + Semi Fixed + Variable + Unexpected rows marked Paid |
| **Net Balance** | Paid Income minus Paid Expenses |
| **Unpaid Income** | Total income minus Paid income |

The breakdown table shows **Paid**, **Pending**, and **Delayed** columns per expense category. Lending & Borrowing is intentionally excluded from expense totals.

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

### Step 5 — Upload master.json *(optional)*
The app has the full master template built-in as a fallback, so this step is optional. Only needed if you want to customise the template:
1. Edit and upload `master.json` to your Drive folder
2. Right-click → Get link → copy the File ID from between `/d/` and `/view`
3. Paste it in the app Settings as **Master JSON File ID**

> **Pre-configured defaults already in the app:**
> - Master File ID: `1G-TZIlJPtSygE7jDmDDbJsuAr8pRGP8T`
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
| Create error: Failed to fetch | App automatically falls back to the built-in template — no action needed |
| File not found on load | Check the Folder ID in Settings and ensure you have edit access to that folder |
| Changes not saving | Make sure you are signed in and a file has been loaded (green dot shows in header) |
| Excel export looks plain | Expected — the export is a freshly generated file; use it for viewing or printing |
