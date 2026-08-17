# FuelTracks Technologies — Inventory Management System (IMS)

An enterprise-grade, full-stack **Inventory Management System (IMS)** designed for tracking GPS trackers, AIS-140 / VLTD devices, fuel level sensors, OBD units, and SIM cards by IMEI across their entire lifecycle — from smart vendor Excel ingestion, warehouse stock management, and batch stock transfers to vehicle installations, customer CRM, granular user permissions, and executive reporting.

---

## 🚀 Key Modules & Capabilities

### 1. 📊 Executive Dashboard & Real-Time Alerts
- **5-Metric KPI Summary**: Live counts for **Total Master Stock**, **Total In-Stock (Unassigned + With Dealers)**, **Installed Fleet Units**, **With Dealer Dispatches**, and **Faulty / RMA Bay**.
- **30-Day Warranty & Certificate Renewal Alert Center**: Automated tracking of 1-year certificate validity and SIM recharges with color-coded urgency badges (`Overdue`, `Urgently Due`, `Expiring Soon`) and **1-Click WhatsApp Reminders**.
- **Live Operations Activity Feed**: Real-time log of team edits, field updates, stock transfers, and payment flips with instant CSV/Excel export.
- **Stock Allocation Matrix**: Breakdown of device allocations across dealer branches and Unassigned Stock.

### 2. 🔐 Super Admin Role-Based Access & Granular Column Permissions
- **Team Account Creation**: Super Admin creates and manages **Admin Team** and **Sales Team** logins.
- **Granular Column Edit Matrix**: Super Admin can check/uncheck exact editable columns per user:
  - 🚗 *Vehicle & Registration*: `Vehicle Number`, `Customer Name`, `Chasis Number`, `Engine Number`, `Certificate Issued Date`, etc.
  - 💼 *Commercial & Financials*: `Cost`, `Tax`, `Total Cost`, `Installation Charges`, `Payment Status`, `Amount Received`, etc.
  - 📍 *Logistics & Location*: `Stock Place`, `Stock Place Date`, `SIM Number`, `Status`, `Remarks`.
  - ⚙️ *Core Hardware*: `IMEI Number`, `Device Type`, `Vendor Name`, `Purchase Price`.
- **Default Presets**: Pre-configured defaults for Technical Admins (technical fields unlocked, commercial locked) vs Sales (commercial unlocked, technical locked).
- **1-Click Credential Sharing**: Copy email and password credentials with one click.

### 3. 📦 Dynamic Inventory Spreadsheet Grid & Batch Stock Transfer
- **Full Custom Columns Preservation**: Automatically ingests and renders all vendor custom headers (e.g. `Stock Place`, `Sim 1`, `Vehicle Number`, `Vahan ID`, `Certificate Date`, etc.).
- **Multi-Select & Bulk Stock Movement**: Select multiple rows via checkboxes and transfer **50+ IMEIs** to a dealer, branch, or test office in **1 click** with date and courier reference tracking.
- **Inline Cell Editing & Diff Audit**: Edit cells directly in the table with permission locks (`🔒 Locked`) and automatic before $\rightarrow$ after audit logging.
- **One-Click Payment Flip**: Rapidly toggle payment status (`PENDING` ↔ `PAID`) with real-time financial updates.

### 4. 📑 Smart Vendor Excel Ingestion & Auto-Mapper
- **Intelligent Header Detection**: Automatically identifies `IMEI`, `SIM Number`, and `Cost / Price` from any vendor spreadsheet (*Tracknow, Vamosys, Volty, BSTPL, etc.*).
- **Interactive Visual Column Mapper**: Review or remap columns dynamically with instant row validation before importing into **Unassigned Stock**.
- **Deduplicated Export**: Clean Excel and CSV exports with deduplicated headers and formatted dates (`DD-MM-YYYY`).

### 5. 🔍 15-Digit IMEI Journey & Traceability Drawer
- **Instant Search & History**: Slide-over journey drawer detailing any device's full lifecycle timeline (`PURCHASED` → `STOCK_TRANSFERRED` → `INSTALLED` → `PAYMENT_RECEIVED`).
- **Comprehensive Audit Diff**: Detailed before $\rightarrow$ after value changes for every update.

### 6. 📸 Continuous Barcode & Camera Scanner
- **High-Speed Camera Scanning**: Live camera scanner (`html5-qrcode`) for smartphone cameras and webcams.
- **Continuous Loop Mode**: Scan batches sequentially with live counter and instant installation trigger.
- **Desktop Simulation Mode**: Built-in test scanner for desktop testing.

### 7. 🛠️ Vehicle Installation & Customer CRM Hub
- **Single-Action Vehicle Deployment**: Record IMEI, vehicle registration number, chassis/engine details, customer contact, and installation charges in one step.
- **Customer CRM**: Automatic customer profile generation and multi-vehicle fleet tracking.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, Lucide Icons, SheetJS (`xlsx`) |
| **Backend** | Node.js, Express.js REST API |
| **Database** | SQLite (`better-sqlite3`) with WAL (Write-Ahead Logging) mode |
| **Scanning** | `html5-qrcode` Camera & Barcode Reader |
| **Design System** | Clean Light Theme (Charcoal Slate `#0f172a`, Purple `#7c3aed`, Emerald `#059669`, Amber `#d97706`) |

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
*(Installs dependencies for both `backend` and `frontend` workspaces).*

### 3. Run Locally (Development Mode)
```bash
npm run dev
```
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **Backend REST API**: [http://localhost:5000](http://localhost:5000)

---

## 🔑 Default Credentials & Role Matrix

| Role | Default Access | Editable Fields |
|---|---|---|
| **👑 Super Admin** | Full access to all modules, lists, deletions, user roles, and audits | All fields unlocked |
| **🛠️ Admin Team** | Operations, inventory, vehicle installations, stock movement | Vehicle info, certificates, stock place, SIM |
| **💼 Sales Team** | Commercial tracking, customer CRM, payment updates | Cost, tax, payment status, amount received, sale price |

---

## 📂 Directory Structure

```
Inventory-Management-System/
├── backend/
│   ├── data/                 # SQLite database storage (inventory.db)
│   ├── src/
│   │   ├── db/               # DB schema, migrations, and seed scripts
│   │   ├── routes/           # REST API routes (devices, dashboard, users, reports, etc.)
│   │   └── index.js          # Express server entrypoint
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Header, Sidebar, Scanner Modal, Journey Drawer
│   │   ├── context/          # AuthContext & Column Permission Matrix
│   │   ├── pages/            # Dashboard, Inventory, Upload, Users, CRM, Reports
│   │   ├── services/         # REST API client services
│   │   ├── App.jsx           # Application routing & layout
│   │   └── main.jsx          # React DOM entrypoint
│   ├── index.html
│   └── package.json
├── package.json              # Root workspace orchestrator
└── README.md                 # Project documentation
```

---

## 📄 License
FuelTracks Technologies — Proprietary Inventory & Fleet Management System.
