# Stockroom

A basic inventory and sales manager for a small business. Manage a product catalog, adjust stock, review low-stock alerts, and record sales that automatically deduct inventory.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

From the project root:

```powershell
npm install
npm install --prefix frontend
npm install --prefix backend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs on port 5000 and the Vite dev server proxies `/api` requests to it. Product, category, sale, and stock movement data are stored in `backend/data/store.json`, created automatically on first write.

## Production build

```powershell
npm run build
npm start
```

The current backend serves the API only; serve the generated `frontend/dist` separately in production and configure `/api` to reach the backend.

## Basic API

- `GET /api/health`, `/api/dashboard`, `/api/products`, `/api/categories`, `/api/sales`, `/api/stock/movements`
- `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`
- `POST /api/stock/adjustments/:productId` with `{ "adjustment": 5, "note": "New shipment" }`
- `POST /api/sales` with `{ "customer": "Customer", "items": [{ "productId": "...", "quantity": 2 }] }`

The app is intended for a trusted local development environment. Authentication, user accounts, multi-user access, and production database support are not included.

## Test

```powershell
npm test --prefix backend
npm run build
```