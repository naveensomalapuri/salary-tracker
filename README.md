# 💰 Salary Tracker — Mobile Web App

A mobile-first web app to manage your monthly salary tracker Excel files on Google Drive, directly from your phone.

## What It Does

- 📋 **Opens your master Excel file** and copies it into your Google Drive folder for the selected month
- 📊 **Loads all 7 sheets**: Dashboard, Income, Fixed Expenses, Semi Fixed, Variable, Unexpected, Lending & Borrowing
- ✏️ **Edit all entries inline** — tap any cell to change values, status, dates, amounts
- ➕ **Add new rows** via a mobile-friendly form
- ☁️ **Saves back to Google Drive** with one tap — no laptop needed!

---

## 🚀 Deployment (GitHub Pages)

### Step 1: Create GitHub Repo
1. Go to [github.com](https://github.com) → New Repository
2. Name it `salary-tracker` (or anything you like)
3. Upload `index.html` to the repo
4. Go to **Settings → Pages → Source: Deploy from branch → main → / (root)**
5. Your URL will be: `https://YOUR_USERNAME.github.io/salary-tracker`

---

## 🔑 Google API Setup (One-Time)

### Step 1: Create Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → Give it a name → Create
3. Select the project

### Step 2: Enable APIs
In the left menu go to **APIs & Services → Library** and enable:
- ✅ **Google Drive API**
- ✅ **Google Picker API**

### Step 3: Create OAuth 2.0 Credentials
1. Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
2. If asked to configure consent screen: External → fill in App name → Save
3. Application type: **Web Application**
4. Authorized JavaScript origins: Add your GitHub Pages URL
   ```
   https://YOUR_USERNAME.github.io
   ```
5. Click **Create** → Copy the **Client ID**

### Step 4: Create API Key
1. Go to **Credentials → Create Credentials → API Key**
2. Copy the key
3. Click **Edit** → Restrict to: Drive API + Picker API

### Step 5: Get Your Master File ID
1. Open your master Excel file in Google Drive
2. Click Share → Copy link
3. The link looks like: `https://drive.google.com/file/d/XXXXXXXXXXXXXXX/view`
4. Copy the part between `/d/` and `/view` — that's your **File ID**

### Step 6: Get Your Destination Folder ID
1. Open the folder in Google Drive where you want monthly copies saved
2. Look at the URL: `https://drive.google.com/drive/folders/XXXXXXXXXXXXXXX`
3. Copy the ID after `/folders/` — that's your **Folder ID**

### Step 7: Configure the App
1. Open the app → Click the ⚙️ Settings button
2. Paste in your: Client ID, API Key, Master File ID, Folder ID
3. Click **Save Config**

---

## 📱 How to Use (Every Month)

1. Open the app URL on your phone
2. Sign in with Google
3. Tap **📅 month selector** → pick the month → Apply
4. Tap **📋 Load / Create Month File** on the dashboard
   - If file exists: loads it from Drive
   - If new: copies master file into your folder automatically
5. Go through each tab and fill in your data
6. Tap **☁️ Save to Drive** — done!

---

## 📋 Sheet Structure

| Tab | What it tracks |
|-----|---------------|
| Dashboard | Summary: Total Income, Expenses, Net Balance |
| Income | Salary & other income sources |
| Fixed Expenses | EMIs, loans, insurance (monthly fixed) |
| Semi Fixed | Rent, recharges, bills (mostly fixed) |
| Variable Expenses | Weekly market, fuel, daily expenses |
| Unexpected | Medical, repairs, surprise costs |
| Lending & Borrowing | Money lent/borrowed with balance tracking |

---

## 🔧 Tech Stack
- Pure HTML + CSS + JavaScript (no frameworks, no server needed)
- [SheetJS](https://sheetjs.com/) for Excel read/write
- Google Drive API v3 for file management
- Google Identity Services for OAuth
