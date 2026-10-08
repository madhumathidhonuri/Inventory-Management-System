# Product Requirements Document (PRD)

**Project Name:** FuelTracks Inventory & GPS Management System (IMS)  
**Version:** 1.0.0  
**Status:** Active  

---

## 1. Executive Summary & Overview
FuelTracks IMS is a full-stack, offline-first & cloud-synced inventory and operations platform. It manages GPS tracking device lifecycles (purchase batches, warehouse stock, vehicle installations, IMEI tracking), financial tracking (payments, partial dues, pending receivables), daily installation reporting (categorized into TG Mining, AP Mining, VLTD/AIS-140, General), and customer records.

---

## 2. Tech Stack & Architecture
- **Frontend:** React 18, Vite, TailwindCSS, Lucide Icons, Axios.
- **Backend:** Node.js, Express.js, `better-sqlite3` (WAL mode enabled).
- **Sync & Backup:** Cloudflare / Turso SQLite Cloud Sync, Google Sheets Live Sync, automatic hourly/daily local database snapshots.
- **Tools & Utilities:** Ngrok / Cloudflared tunnels for remote field technician access.

---

## 3. Core Functional Requirements & Features

### 3.1 Device & Purchase Batch Management
- [x] Register device batches with vendor, purchase order date, unit cost, and device category.
- [x] Bulk IMEI import via Excel/CSV (`.xlsx`, `.csv`) with auto-deduplication and format standardization.
- [x] Device status tracking (`IN_STOCK`, `INSTALLED`, `RETURNED`, `FAULTY`).

### 3.2 Vehicle Installations & Daily Reports
- [x] Record single and bulk vehicle installations with technician assignment, vehicle number, customer details, and category tag (`TG MINING`, `AP MINING`, `VLTD`, `GENERAL`).
- [x] Date-driven daily installation logs with date filtering (Today, Yesterday, Specific Date, All Dates).
- [x] Batch Excel upload for daily installations with custom column mapping and automatic device linking.
- [x] Delete installation record with safe device status reversion to warehouse stock.

### 3.3 Financial & Pending Payment Hub
- [x] Track payment status (`RECEIVED`, `PARTIAL`, `PENDING`) and amount paid vs. total sale price.
- [x] Mark payment modal supporting multiple payment modes (`UPI`, `CASH`, `BANK_TRANSFER`, `CHEQUE`) with partial payment support and balance recalculation.
- [x] Top header notification modal for overdue & pending installation payments with WhatsApp reminder generation and direct search.

### 3.4 IMEI Lifecycle & Journey Drawer
- [x] Unified IMEI journey drawer showing complete historical timeline: Purchase Batch $\to$ Warehouse Inward $\to$ Vehicle Installation $\to$ Payments Recorded $\to$ Replaced / Service history.

### 3.5 Synchronization & Data Integrity
- [x] Real-time / debounced background synchronization to Google Sheets.
- [x] SQLite database automated backups before destructive operations.
- [x] Robust error handling and offline fallback support.

---

## 4. Current Quality & Stability Tasks for Ralph Loop

- [ ] **Task 1: Build & Syntax Verification**
  - Verify `frontend/` builds without errors (`npm --prefix frontend run build`).
  - Verify `backend/` starts and syntax is valid across all route handlers.

- [ ] **Task 2: Component & Modal Resilience**
  - Ensure all modal components (`PendingPaymentNotificationModal`, `MarkPaymentModal`, `ImeiJourneyDrawer`) handle empty or partial data gracefully without throwing `undefined` reference errors.

- [ ] **Task 3: Daily Reports & Date Filter Integrity**
  - Validate that daily report date filtering, category badge counters, and search filters operate smoothly without breaking table rendering.

- [ ] **Task 4: Payment Calculation & Status Consistency**
  - Confirm partial payment updates properly adjust `sale_price`, `amount_paid`, and `payment_status` without negative balances.

- [ ] **Task 5: Cloud & Google Sheets Sync Reliability**
  - Ensure background sync tasks fail gracefully when network or API tokens are unavailable without crashing the Node.js server process.

---

## 5. Verification Commands
- **Frontend Lint & Build:** `npm --prefix frontend run build`
- **Backend Test / Health Check:** `npm --prefix backend start` or `node backend/src/index.js`
- **Full Development Runner:** `npm run dev`
