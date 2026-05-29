# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

### Development Startup (Requires 3 terminals)

PerixMonitor is a **three-tier application** that requires all three servers to run simultaneously:

```bash
# Terminal 1: Database & Infrastructure
supabase start

# Terminal 2: Python/Flask Backend API (port 5328)
.\.venv\Scripts\activate  # Windows
python api/index.py

# Terminal 3: Next.js Frontend (port 3500)
npm run dev
```

Then open http://localhost:3500 in your browser.

### Linting & Building

```bash
npm run lint                # Run ESLint
npm run build               # Build Next.js production bundle
npm run start               # Start production server (after build)
npx supabase db reset       # Reset local database to migrations
```

### Database Management

```bash
# Create a new migration
supabase migration new <migration_name>

# Run migrations (automatic during development)
supabase db push

# Reset local DB to clean state
npm run db:reset
```

## Architecture Overview

### System Design: Two-Server Pattern

```
User Browser (http://localhost:3500)
          ↓
    Next.js Frontend (3500)
          ↓
    Python/Flask Backend (5328)
          ↓
    Supabase Database
```

**Frontend (Next.js)**
- Handles UI rendering, forms, and charts
- Uses React Query for server state management
- Makes HTTP requests to `/api/*` routes
- In development, requests are rewired to `http://127.0.0.1:5328/api/*` (see `next.config.ts`)

**Backend (Python/Flask)**
- Executes financial calculations (XIRR, MWR)
- Parses and ingests Excel files
- Acts as gatekeeper for database access using `SERVICE_ROLE_KEY`
- Implements Row Level Security (RLS) logic
- Runs on port 5328

**Database (Supabase PostgreSQL)**
- Hosts schema defined in `supabase/migrations/`
- RLS policies restrict direct access; backend is the sole writer/reader
- Contains asset data, transactions, dividends, portfolios, prices, and snapshots

### Frontend Structure

**Pages** (`app/`)
- `dashboard` — Main portfolio overview (net worth chart, summary cards, holdings)
- `portfolio` — Asset list with detail panel, prices, movements, variations analysis
- `analytics` — Allocation breakdown and performance metrics
- `certificati` — List of all analyzed certificates in DB (global master data) with live Worst-Of distance, refresh and delete
- `upload` — Excel ingestion with reconciliation preview
- `memory` — Transaction and dividend history with notes
- `settings` — Configuration, asset color mapping, debug tools
- `export` — PDF report generation
- `login` — Authentication

**Components** (`components/`)
- `ui/` — Shadcn/UI primitives (buttons, dialogs, forms, tables, etc.)
- `dashboard/` — Summary cards, charts, date range picker, detail modals
- `portfolio/` — Asset list, detail panel, prices modal, movements modal
- `ingestion/` — Excel upload form, reconciliation modal, price variation modal
- `settings/` — Configuration panels (AI, system, asset mapping, dev test)
- `layout/` — Sidebar, headers
- `providers/` — React Query and client-side providers

**Custom Hooks** (`hooks/`)
- `useDashboard` — Fetch portfolio summary, chart data, holdings
- `useMemory` — Fetch transaction/dividend history
- `useAssetMovements` — Fetch asset-specific transaction timeline
- `useAssetPrices` — Fetch and manage asset price history
- `usePortfolioMovements` — Fetch portfolio-level operations
- `useReport` — Fetch PDF report data

**State Management**
- React Query (TanStack Query) caches API responses and handles fetching
- Formik + Yup for form validation (ingestion, settings)
- Context API for portfolio selection (user state)

### Backend Structure

**Core Modules** (`api/`)
- `index.py` — Flask app setup, CORS, error handlers, blueprint registration
- `finance.py` — XIRR/MWR calculation engine (core wealth-tracking logic)
- `ingest.py` — Parse Excel, detect transactions/dividends/prices, build delta for preview
- `backup_service.py` — Full JSON backup/restore with price history
- `price_manager.py` — Store, retrieve, and manage asset price history

**API Route Handlers**
- `dashboard.py` — Summary KPIs, net worth trend, holdings with calculated returns
- `portfolio.py` — Portfolio CRUD, asset allocation by class
- `memory.py` — Aggregated transaction history, P&L, dividend flows
- `analysis.py` — Fine-grained allocation and performance breakdowns
- `assets.py` — Asset metadata; `GET /api/assets/<isin>/external` runs the integrated certificate analysis (cache-first, enriches DB)
- `cert_routes.py` — Certificate domain routes (list/refresh/patch/ticker/delete/price)
- `asset_movements.py` — Transaction timeline per asset
- `asset_prices.py` — Price CRUD, time-range filtering, history export

**Utilities & Support**
- `db_helper.py` — Unified database CRUD interface (query, upsert, update, delete)
- `supabase_client.py` — Supabase client initialization with SERVICE_ROLE_KEY
- `color_manager.py` — Persistent asset color assignment
- `cert_analyzer.py`, `cert_extractor.py`, `cert_db.py` — Integrated certificate analysis (LLM web_search + yfinance prices + DB cache), ported from the former external `analisicertificati` service
- `llm_asset_info.py`, `llm_report.py`, `llm_utils.py` — AI-assisted analysis and reporting
- `logger.py` — Audit and debug logging
- `settings.py` — Environment variable validation

**API Endpoints** (non-exhaustive)
- `POST /api/ingest` — Preview Excel import
- `POST /api/sync` — Commit ingestion to database
- `GET /api/dashboard/summary` — KPIs, net worth, allocations
- `GET /api/memory/data` — Transaction and dividend history
- `GET /api/asset-prices` — Price history with filtering
- `GET /api/analysis/allocation` — Asset class breakdown
- `GET /api/report/generate` — PDF report data
- `GET /api/backup/download` — Full JSON backup
- `GET /api/assets/<isin>/external` — Certificate analysis (integrated; cache-first, enriches DB on first analysis)
- `GET /api/certificates` — List all certificates (with live Worst-Of); `POST /api/certificates/<isin>/refresh`, `PATCH /api/certificates/<isin>`, `POST /api/certificates/<isin>/ticker`, `DELETE /api/certificates/<isin>`

### Database Schema (Key Tables)

**Core**
- `assets` — Asset master data (ticker, ISIN, type, name)
- `transactions` — Buy/sell/fee records with quantity, price, cost
- `dividends` — Dividend and expense flows
- `portfolios` — Portfolio containers owned by users
- `asset_prices` — Manual price history for assets

**Snapshots & Aggregation**
- `snapshots` — Portfolio value snapshots at key dates
- `materialized_views` — Pre-aggregated data (holdings, returns by class, etc.)

**Configuration & UI**
- `app_config` — Key-value store for persistent UI settings
- `portfolio_asset_settings` — Per-asset per-portfolio settings (color, visibility)
- `asset_notes` — User annotations on assets

**Certificates** (global master data, no portfolio_id)
- `certificates` — Certificate analysis cache (barrier, coupon, autocall, dates)
- `underlyings` — Underlyings per certificate (ticker, strike, barrier, manual `corrected_ticker` override)

**Security**
- RLS policies on all tables enforce user isolation
- Only authenticated users with correct portfolio ownership can read/write

## Development Workflow

### Adding a Feature

1. **Frontend** → Create/modify page or component in `app/` or `components/`
2. **Hook** → Create custom hook in `hooks/` to fetch data from backend
3. **Backend** → Add endpoint in `api/` module, register in `index.py`
4. **Database** → If schema changes needed, create migration in `supabase/migrations/`
5. **Test** → Start all three servers and test in browser at http://localhost:3500

### Adding a New Page

1. Create `app/new-page/page.tsx`
2. Add navigation link in `components/layout/AppSidebar.tsx`
3. Create custom hook `hooks/useNewPage.ts` if API data is needed
4. Implement React components, call hook with React Query
5. Add corresponding backend endpoint in `api/new_module.py`

### Modifying Database Schema

1. Create migration: `supabase migration new add_new_table`
2. Write SQL in `supabase/migrations/<timestamp>_add_new_table.sql`
3. Update backend CRUD logic in `db_helper.py` if needed
4. Generate types (if TypeScript types are needed) or manually define
5. Push migration: `supabase db push`

### Testing Backend Endpoints

The backend runs independently on port 5328. You can test endpoints directly:
```bash
# Example: Test ingest preview
curl -X POST http://localhost:5328/api/ingest \
  -F "file=@path/to/file.xlsx" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Key Patterns & Conventions

### Frontend → Backend Communication

- React Query hooks in `hooks/` encapsulate API calls
- Hooks use `fetch()` or `axios` to call `/api/*` endpoints
- Responses are cached and automatically invalidated on mutations
- Error handling is centralized in hooks

### Financial Calculations

- **XIRR** (Internal Rate of Return) is computed in `finance.py` using numpy
- **MWR** (Money-Weighted Return) aggregates returns by period
- Both use transaction dates and amounts to compute returns
- Results are cached in `snapshots` table for dashboard performance

### Secure Excel Ingestion

1. User uploads file in `upload` page
2. Frontend sends to `POST /api/ingest` (preview mode)
3. Backend parses, detects structure, returns delta of proposed changes
4. User reviews and confirms in reconciliation modal
5. Frontend sends `POST /api/sync` to commit atomically
6. Backend validates, writes to database, returns updated snapshots

### Asset Color Assignment

- Colors are stored in `portfolio_asset_settings.color`
- `color_manager.py` assigns consistent colors on first assignment
- Persisted so colors remain stable across sessions

## Common Issues & Solutions

### "ECONNREFUSED 127.0.0.1:5328"
- The Python backend is not running on port 5328. Start it with `python api/index.py` in a separate terminal.

### Database Migrations Not Applied
- Ensure `supabase start` is running and migrations exist in `supabase/migrations/`
- Check migration file format and SQL syntax

### Frontend Build Errors
- ESLint and TypeScript errors are ignored during dev (`next.config.ts` has `ignoreDuringBuilds: true`)
- For production, fix any type errors or adjust `tsconfig.json`

### React Query Cache Issues
- Data may be stale if backend was restarted while frontend is running
- Manually invalidate cache in React Query DevTools or refresh browser

## Important Notes

- **Language**: Application is fully in Italian (UI, variable names, comments in some modules)
- **Styling**: Tailwind CSS with custom glassmorphism design (blurred backgrounds, dark/blue gradients)
- **Performance**: Large tables (asset prices) use React virtualization for 60fps scrolling
- **Security**: Row Level Security active on all tables; service role key is sole database accessor
- **Financial Logic**: Returns are calculated net of fees and expenses; dividend management is automatic
