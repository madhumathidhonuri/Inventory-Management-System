# FuelTracks Technologies — Inventory Management System (IMS)

An enterprise-grade, full-stack **Inventory Management System (IMS)** designed for tracking GPS trackers, VLTD devices, fuel level sensors, OBD units, and SIM cards by IMEI across their entire lifecycle — from bulk spreadsheet upload, warehouse storage, and vehicle installations to customer CRM and executive reporting.

---

## 🚀 Key Modules & Capabilities

### 1. 📊 Executive Dashboard & Audit Feed
- **Live Inventory KPIs**: Real-time counts for Total Devices, In-Stock Warehouse inventory, Installed Fleet units, and Faulty/RMA devices.
- **Recently Updated & Edited Activity Feed**: Tracks live field edits, IMEI status changes, and technician audit histories.
- **One-Click List Management**: Directly view or delete uploaded spreadsheet lists from the dashboard.

### 2. 📁 Excel Bulk Upload & Dynamic List Management
- **Smart Spreadsheet Ingestion**: Auto-detects and ingests columns from various vendor formats (*VAMO, Tracknow, Volty, BSTPL, etc.*).
- **Preserves All Custom Excel Attributes**: Retains every original Excel column (e.g. `Vehicle Number`, `Stock Place`, `Sim 1`, `Sim 2`, `Customer`, `RTO Location`, `Vahan ID`, `Certificate Date`, etc.).
- **List-Based Deletion**: Select any upload list to instantly wipe or replace batch records.

### 3. 📄 Executive Reports & Excel Export Hub
- **Manager Statement Format**: One-click download of clean billing & installation statements with exact manager columns:
  - `Sl No`, `Device Name`, `Vehicle Number`, `Customer Name`, `Phone Number`, `SIM Numbers`, `IMEI Number`, `Total Cost`, `Amount Received Status`, `Stock Place`, `Date`.
- **List-Specific Clean Exports**: Download spreadsheets matching the exact original columns of a selected file without unwanted synthetic fields.
- **Multi-Dimensional Filters**: Filter exports by Upload List Name, Installation Status (Vehicle Number presence), Stock Place (dynamic per list), Date Range, and Device Type.
- **Smart Excel Date & Text Formatting**: Automatic conversion of raw Excel serial date numbers (e.g., `46302` $\rightarrow$ `07-10-2026`) and preserved long SIM/IMEI text formatting.

### 4. 🔍 15-Digit IMEI Journey & Traceability Drawer
- **Instant Search**: Slide-over journey drawer detailing any device's full lifecycle (`PURCHASED` → `INSTALLED` → `CUSTOMER`).
- **Complete Timeline**: Timestamped history of status updates, vehicle assignments, and field edits.

### 5. 📸 Continuous Barcode & Camera Scanner
- **Live Camera Scanning**: High-speed camera reader (`html5-qrcode`) for smartphone cameras and webcams.
- **Continuous Scan Mode**: Sequential scanning loop with live item counter and instant vehicle installation trigger.
- **Simulation Mode**: Built-in test scanner for desktop testing.

### 6. 🛠️ Vehicle Installation & CRM Hub
- **Single-Action Installation**: Record IMEI, vehicle license plate, customer name, phone number, and sale price in one step.
- **Customer CRM**: Automatic customer profile creation and multi-vehicle fleet tracking.

### 7. 📱 Mobile Field Scanner Mode
- **Responsive Field UI**: Optimized interface for field technicians and installers.
- **Quick Actions**: Rapid device lookup and vehicle installations on mobile devices.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, Lucide Icons, SheetJS (`xlsx`) |
| **Backend** | Node.js, Express.js REST API |
| **Database** | SQLite (`better-sqlite3`) with WAL (Write-Ahead Logging) mode |
| **Scanning** | `html5-qrcode` Camera & Barcode Reader |

---

## 💻 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/madhumathidhonuri/Inventory-Management-System.git
cd Inventory-Management-System
```

### 2. Install Dependencies
```bash
npm install
```
*(This installs dependencies for both `backend` and `frontend` sub-packages).*

### 3. Run Locally (Development Mode)
```bash
npm run dev
```
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **Backend REST API**: [http://localhost:5000](http://localhost:5000)

### Additional Scripts:
- `npm run backend` — Run backend server only with `node --watch` auto-reloading
- `npm run frontend` — Run Vite frontend development server only
- `npm run build` — Build production bundles
- `npm run clear` — Clear database records
- `npm test` — Run backend integration tests

---

## 📂 Directory Structure

```
Inventory-Management-System/
├── backend/
│   ├── data/                 # SQLite database storage (inventory.db)
│   ├── src/
│   │   ├── db/               # DB initialization, clear, and seed scripts
│   │   ├── routes/           # REST API routes (devices, dashboard, reports, etc.)
│   │   ├── test/             # API test suite
│   │   └── index.js          # Express server entrypoint
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Header, Sidebar, Scanner Modal, Journey Drawer
│   │   ├── context/          # Role switcher & Auth context
│   │   ├── pages/            # Dashboard, Inventory, Reports, CRM, Upload, etc.
│   │   ├── services/         # API HTTP service layer
│   │   ├── App.jsx           # Main React component
│   │   └── index.css         # Styling & Glassmorphism design tokens
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── package.json              # Root package orchestrator
└── README.md
```

---

## 📝 License
Proprietary & Confidential — **FuelTracks Technologies Private Limited**.
