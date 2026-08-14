# FuelTracks IMS — Backend API

Node.js + Express + SQLite backend API for FuelTracks Technologies Inventory Management System.

## API Endpoints
- `GET /api/health` — API health status.
- `GET /api/dashboard/stats` — Executive dashboard metrics.
- `GET /api/devices` — Device stock inventory.
- `GET /api/devices/:imei` — Single device details & full audit trail.
- `POST /api/purchase-batches/preview` — Excel file parse & duplicate IMEI validation preview.
- `POST /api/purchase-batches/confirm` — Bulk import purchase batch into inventory.
- `POST /api/dispatches` — Create stock dispatch to dealer.
- `POST /api/installations` — Record vehicle installation with auto customer lookup/creation.
- `GET /api/customers` — CRM customer profiles and vehicle fleets.
- `GET /api/reports/export` — Download stock reports in `.xlsx` or `.csv` format.

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start API server:
   ```bash
   npm start
   ```
   Server runs on `http://localhost:5000`.

3. Re-seed test database:
   ```bash
   npm run seed
   ```
