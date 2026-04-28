# Dynamic Pricing & Demand Intelligence

A MERN pricing intelligence dashboard for importing sales CSVs, checking data quality, estimating customer price response, simulating pricing scenarios, and recommending business-friendly price ranges.

## Current Capabilities

- Robust CSV upload with flexible header mapping, duplicate detection, raw-row preservation, and 15 MB upload limit.
- Data quality summaries for imported rows, skipped rows, customer groups, optional fields, stockouts, promotions, and product readiness.
- Pricing insights using an explainable Simple Price Response Model, Log-Log Elasticity Model, and Context-Adjusted Price Response Model when enough promotion, competitor, seasonality, region, or channel variation exists.
- Seasonality, promotion, competitor-market, customer-segment, product-relationship, and model-comparison views for examiner-friendly explanation.
- Price simulation with calculation steps for demand, revenue, profit, competitor adjustment, confidence, and warnings.
- Best price recommendation with profit/revenue/inventory/competitor objectives, guardrails, good price range, avoid range, and CSV export.
- Demo login, JWT expiry, API-key protection, admin reset flow requiring `RESET`, and API-first JSON ingestion for machine-fed sales rows.

## Prerequisites

- Node.js 20+
- npm
- MongoDB running locally, or MongoDB Atlas for deployment

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create environment files:

   ```bash
   copy .env.example server\.env
   copy .env.example client\.env
   ```

3. Start MongoDB locally.

4. Run the app:

   ```bash
   npm run dev
   ```

Backend: `http://localhost:5000`

Frontend: `http://localhost:5173`

## Demo Flow for Examiner

1. Open Settings or Home and reset workspace data.
2. Upload one curated sales CSV from Sales Data.
3. Show the import quality summary and product readiness badges.
4. Open Pricing Insights and create an insight for a ready product.
5. Open Seasonality & Promotion and Product Relationships to explain model limitations honestly.
6. Run Scenario Planner or Price Simulator with one below-cost and one profitable price.
7. Generate a Best Price Recommendation and explain the good/avoid ranges.
8. Open Performance Dashboard and export the examiner workbook.

## Recommended CSV Fields

Core fields:

```csv
Date,SKU,Product Name,Category,Customer Segment,Unit Price,Cost,Competitor Price,Quantity Sold,Inventory,Revenue,Gross Margin
```

Optional fields:

```csv
Region,Channel,Promotion,Discount,Holiday,Marketing Spend,Stockout
```

For strong model results, each important product should have at least 8-15 rows, multiple price points, valid cost, and no stockout-heavy history.

## Production Deployment Notes

- Frontend: Vercel or Netlify
- Backend: Render, Railway, or Fly.io
- Database: MongoDB Atlas
- Set production values for `MONGODB_URI`, `PORT`, `CORS_ORIGIN`, `CLIENT_ORIGIN`, `JWT_SECRET`, `NODE_ENV`, and `VITE_API_BASE_URL`.
- The current system has demo-grade role-based access. For production, set strong `JWT_SECRET`, `API_KEY`, and hashed password environment values.

## API-First Ingestion

CSV remains the main demo path, but systems such as Shopify, ERP, or CRM tools can send sales rows directly:

```http
POST /api/ingest/sales
x-api-key: your-api-key
Authorization: Bearer <admin-token>
Content-Type: application/json
```

```json
{
  "source": "shopify-daily-sync",
  "rows": [
    {
      "date": "2026-04-01",
      "sku": "SKU-1001",
      "productName": "Smart TV",
      "category": "Electronics",
      "customerSegment": "Retail",
      "price": 12000,
      "cost": 9000,
      "quantity": 4,
      "revenue": 48000,
      "competitorPrice": 11800,
      "promotion": false,
      "region": "West",
      "channel": "Online"
    }
  ]
}
```

## Verification

- API health: `GET http://localhost:5000/health`
- Products: `GET http://localhost:5000/products`
- Readiness: `GET http://localhost:5000/analytics/insight-readiness`
- Seasonality: `GET http://localhost:5000/analytics/seasonality`
- Product relationships: `GET http://localhost:5000/analytics/product-relationships`
- API ingestion: `POST http://localhost:5000/api/ingest/sales`
- CSV upload: `POST http://localhost:5000/upload/sales`
- Recommendation export: `GET http://localhost:5000/reports/recommendations.csv`
