# FuelTracks Technologies — Enterprise Inventory & Fleet Management Platform

An enterprise-grade, full-stack **Inventory Management & Telematics Operations System (IMS)** designed for tracking GPS trackers, AIS-140 / VLTD devices, fuel level sensors, OBD units, and M2M SIM cards by IMEI across their entire lifecycle — from smart vendor Excel ingestion, centralized warehouse storage, dealer dispatches, and Delivery Challans (DCN) to vehicle installations, project categorization, KYC customer CRM, RMA warranty repairs, automated WhatsApp payment acknowledgements, and executive financial reporting.

---

## 🚀 Key Modules & Capabilities

### 1. 📊 Executive Telemetry & Real-Time Dashboard
- **5-Metric Live Fleet Summary**: Real-time counters for **Total Master Stock**, **Total In-Stock**, **Installed In Vehicles**, **With Dealers / Branches**, and **Unassigned Central Warehouse Stock**.
- **Financial & Payment Collection Telemetry**: Tracks collected revenue vs pending amounts, active collection rates, and payments received today with custom date-range filters.
- **1-Click Monthly Payments Excel Statements**: Instant download of formatted `.xlsx` financial records with collection percentages and breakdowns.
- **Dealer & Branch Stock Allocation Matrix**: Real-time breakdown of device allocations per dealer with 1-click dossier views and **Reset Stock Holding** actions.
- **Dead-Stock & Aging Analysis Engine**: Color-coded aging brackets (`< 30 Days`, `30–60 Days`, `> 60 Days`) with 1-click **WhatsApp Stock Nudge Notices** to dealers for idle stock reconciliation.
- **Telecom & M2M SIM Validity Watcher**: Real-time carrier analytics (Airtel, Vi, Jio, BSNL) with 30-day pre-expiry alerts and bulk SIM validity updates.

---

### 2. 🏷️ Project Category System (`VLTD`, `TG MINING`, `AP MINING`, `GENERAL`)
- **Quick 1-Click Category Badging**: Instant selection for major government/fleet project categories:
  - `VLTD` (AIS-140 / Commercial Passenger Vehicles)
  - `TG MINING` (Telangana Mining Department Projects)
  - `AP MINING` (Andhra Pradesh Mining Department Projects)
  - `GENERAL` (Standard Commercial & Private GPS Tracking)
  - `+ Custom Category` (Type and assign any custom department or project name)
- **Omnipresent Category Filter**: Quick filter pills across Installation logs, Inventory tables, and Device Specification Passports.

---

### 3. 📑 Smart Vendor Excel Ingestion & Positional Column Preservation
- **Brand-Specific Column Detection**: Tailored column templates for different hardware vendors (*Vamosys, Volty, Tracknow, BSTPL, etc.*).
- **Exact Nameless / Blank Header Column Preservation**: Preserves empty or nameless columns in their exact 1-to-1 positional order during both Excel upload and formatted Excel export.
- **Intelligent Header Detection**: Automatically identifies `IMEI`, `SIM Number`, `Cost / Price`, `Vehicle Number`, and vendor custom attributes from any spreadsheet.
- **Interactive Visual Column Mapper**: Review and remap columns dynamically with row-by-row validation before importing into **Central Warehouse Stock**.
- **Excel Batch Tracker**: Filter the dashboard and inventory grid by specific Excel upload sheets and import dates.

---

### 4. 📦 Dynamic Inventory Spreadsheet Grid & Lifecycle Traceability
- **Full Custom Column Preservation**: Ingests and displays all vendor custom headers (`Stock Place`, `Sim 1`, `Vehicle Number`, `Vahan ID`, `Certificate Date`, etc.).
- **Multi-Select & Bulk Stock Movement**: Select multiple rows via checkboxes to transfer or dispatch **50+ IMEIs** in **1 click**.
- **Inline Cell Editing & Audit Diff**: Direct table editing with before $\rightarrow$ after audit logs and column permission locks.
- **15-Digit IMEI Journey Drawer**: Slide-over lifecycle drawer detailing any device's full chronological history (`PURCHASED` → `DISPATCHED` → `INSTALLED` → `PAYMENT_RECEIVED`).

---

### 5. 🚚 Stock Dispatches, Digital Delivery Challans (DCN) & Delete Controls
- **Digital Delivery Challan (DCN)**: Generates official serialized Delivery Challans (`FT-DCN-2026-XXXX`) with printable layouts, dispatch metadata, and serialized IMEI handover tables.
- **1-Click WhatsApp Challan Sharing**: Send formatted dispatch handover manifests directly to dealers via WhatsApp.
- **Stock Dispatches & Assign Management**: Dispatch stock to registered or custom dealers with bulk barcode scanning or comma-separated IMEI inputs.
- **Full Delete & Reset Controls**:
  - **Single Dispatch Deletion**: Delete any past dispatch record with automatic device return back to Central Warehouse.
  - **Clear All Dispatches**: 1-click purge of all dispatch history with complete warehouse stock restoration.
  - **Reset Dealer Holding**: Instantly revert uninstalled devices held by any dealer back to Central Warehouse.

---

### 6. 👥 Customer KYC Directory & Formatted Excel Export
- **Comprehensive Customer KYC Fields**: Captures and manages complete customer records:
  - `Customer Name`, `Phone Number`, `Aadhar Number`, `PAN Number`, `Chassis Number`, `Engine Number`, `Vehicle Number`, `Email`.
- **1-Click KYC Excel Export**: Download formatted, professional `.xlsx` customer directories directly from the CRM and Reports Hub.
- **Multi-Vehicle Fleet CRM**: Automatically groups installed vehicles under customer profiles with login credentials tracking.

---

### 7. 🛠️ Vehicle Installations & 1-Click WhatsApp Payment Hub
- **Rapid Installation Entry**: Single-step deployment recording IMEI, vehicle registration, customer contact, GPS software credentials, project category, and sale price.
- **Instant 1-Click WhatsApp Payment Received Acknowledgement**:
  - Replaces paper slips with instant, professional WhatsApp confirmation messages containing:
    - *Customer Name & Contact*
    - *Vehicle Number & Device IMEI*
    - *Amount Received (₹) & Payment Date*
    - *Payment Mode / Ref ID*
    - *Confirmation that tracking services are active*
- **1-Click WhatsApp UPI Payment Request**: Send instant payment requests with direct tap-to-pay deep links and QR codes.
- **1-Click App Login Sharing**: Send mobile app login credentials (User ID and Password) to vehicle owners via WhatsApp.

---

### 8. 🔧 RMA & Warranty Repairs Pipeline
- **4-Stage Lifecycle Tracking**:
  1. `FAULTY_REPORTED` (Defective device reported from field / dealer)
  2. `RECEIVED_LAB` (Received at central technical testing bench)
  3. `SENT_TO_OEM` (Dispatched to vendor / manufacturer for repair)
  4. `REPLACED` (Repaired or replaced with new unit)
- **Vendor RMA Logging**: Record vendor names, courier tracking numbers, repair notes, and replacement IMEIs.

---

### 9. 🔐 Access Control & 1-Click Factory Reset
- **Granular Role Permissions**: Customize exact editable column permissions for Operations and Sales teams.
- **1-Click Full System Factory Reset**: Safely purge all devices, batches, installations, dispatches, customers, and extra user roles to start completely fresh (while preserving the master Super Admin login).

---

### 10. ☁️ Cloud Persistence & Zero Data Loss Engine
- **Cloud Storage Sync**: Automatic database persistence compatible with Supabase S3, Cloudflare R2, and AWS S3.
- **Automatic Pre-Boot Cloud Restore**: Automatically downloads the latest database snapshot from cloud storage on container startup/reboot.
- **Instant Mutation Sync**: Automatically pushes changes to cloud storage within 1 second of any Excel upload, installation, or device edit.
- **Crash-Safe SQLite WAL Mode**: Configured with `synchronous = NORMAL` and non-blocking background snapshot backups.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Vanilla CSS Design System, Lucide Icons, SheetJS (`xlsx`), `qrcode` |
| **Backend** | Node.js, Express.js REST API |
| **Database** | SQLite (`better-sqlite3`) with WAL (Write-Ahead Logging) mode |
| **Cloud Storage** | S3-Compatible Storage (Supabase S3, Cloudflare R2, AWS S3) |
| **Scanning** | `html5-qrcode` Camera & Barcode Reader |
| **Deployment** | Render, Railway, AWS EC2, VPS, Docker |

---

## 💻 Getting Started Locally

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

## 🏭 Production Deployment & Cloud Setup

### 1. Build Production Bundle
```bash
npm run build
```

### 2. Start Production Server
```bash
npm start
```

### 3. Cloud Storage Persistence Setup (Render / Free Containers)
To keep data safely persisted across redeployments on ephemeral servers like Render:
1. Go to your **Render Dashboard** ➔ Web Service ➔ **Environment**.
2. Add the following variables:

| Environment Variable | Description | Example Value |
|---|---|---|
| `S3_ENDPOINT` | Supabase / S3 API Endpoint | `https://<ref>.supabase.co/storage/v1/s3` |
| `S3_ACCESS_KEY_ID` | Storage Access Key ID | `<your-access-key>` |
| `S3_SECRET_ACCESS_KEY` | Storage Secret Key | `<your-secret-key>` |
| `S3_BUCKET` | Storage Bucket Name | `ims-database-backup` |
| `S3_REGION` | Storage Region | `ap-south-1` *(or `auto`)* |

---

## 🔑 Default Administrator Credentials

| Role | Username / Mobile | Password | Access Level |
|---|---|---|---|
| **Super Admin** | `admin@fueltracks.in` *(or `9999999999`)* | `123456` *(or `admin`)* | Master Admin Control (All modules, dispatches, settings, and user permissions) |

---

## 📂 Directory Structure

```
Inventory-Management-System/
├── backend/
│   ├── data/                 # SQLite database storage & /backups/
│   ├── src/
│   │   ├── db/               # DB schema, cloud sync (S3/Supabase), migrations, backups
│   │   ├── routes/           # REST API routes (devices, dashboard, dispatches, backup, users, reports, etc.)
│   │   ├── scripts/          # Database maintenance and cleanup utilities
│   │   ├── test/             # Automated integration test suite
│   │   └── index.js          # Express server entrypoint & graceful shutdown
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Delivery Challan, RMA Modal, Scanner, Journey Drawer, QR Modal
│   │   ├── context/          # AuthContext & Column Permission Matrix
│   │   ├── pages/            # Dashboard, Inventory, Dispatches, Upload, CRM, Installations, Reports, Users
│   │   ├── services/         # REST API client services
│   │   ├── utils/            # WhatsApp templates, UPI generator, Excel formatters
│   │   ├── App.jsx           # Application routing & layout
│   │   └── main.jsx          # React DOM entrypoint
│   ├── index.html
│   └── package.json
├── ecosystem.config.js       # PM2 process manager configuration
├── .env.example              # Environment variables template
├── package.json              # Root workspace orchestrator
└── README.md                 # Project documentation
```

---

## 📄 License
FuelTracks Technologies — Proprietary Inventory & Fleet Management System.
