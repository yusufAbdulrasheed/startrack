# StarTrack Platform — MVP Blueprint (End-to-End)

_Last updated: 2026-07-15 · Owner: Isaac · Status: pre-build spec_

---

## 0. What StarTrack is

A multi-tenant business-operations platform. Any business registers, picks its
business type, and runs sales, inventory, staff, customers, and dashboards under
its own name. StarTrack is the engine; the business's brand is the face.

Core primitives (full vision):
- **Tenancy chain:** User → Account → Business → Branch → Outlet
  (Account = the login + billing umbrella. Invisible in the UI until a user adds a 2nd business — then it surfaces as "My Businesses".)
- **Product archetypes (9):** stock good · variant good · batch/expiry good ·
  made-to-order (BOM, e.g. window blinds) · recipe/menu item · service ·
  bookable resource (hotel rooms) · package/combo · subscription
- **Folio:** an open bill that accumulates charges across outlets and settles once
  (hotel guest bill, restaurant tab, job ticket)
- **Business type = provisioning template**, not code: outlets + archetypes +
  terminology + KPI pack + defaults

---

## 1. MVP scope (what v1 ships — and what waits)

### IN (v1)
| Area | Scope |
|---|---|
| Tenancy & auth | Register, org/business/branch creation, context switcher |
| Roles | Owner / Admin / Manager / Staff + per-user permission overrides |
| Staff login | Business code + PIN on till devices (server-verified, rate-limited) |
| Products | Stock-good archetype, categories, barcode, reorder level, expiry date |
| POS / Sales | Cart, discounts (stored NET), VAT, multi-payment types, receipts (print + WhatsApp), offline queue |
| Inventory | Stock in, transfers between branches, append-only stock_movements ledger |
| Returns | Submit → approve/reject workflow, stock restore, cost-correct accounting |
| Customers | CRM-lite: name, phone/WhatsApp, spend, visits, per-business only |
| Expenses | Types + records per branch |
| Dashboard | Pre-rolled daily metrics; revenue/profit/cost, top products, payment split, low stock, per-branch and consolidated |
| Staff ops | Clock in/out, basic attendance view |
| Settings | Business profile, tax, receipt template, alert emails |
| Billing | Manual/beta free during pilot; Paystack/Flutterwave subscription in v1.1 |

### OUT (deliberately later)
- v1.5: **Made-to-order/BOM archetype** (window blinds — first differentiator after core is stable), variant matrix (fashion), batch tracking (pharmacy-grade)
- v2: Bookable resources + folio (hotels), recipes + kitchen display (eatery), no-code business-type builder
- Later: AI reports/forecasting, white-label, marketplace, multi-currency

**Discipline rule:** nothing enters v1 that isn't needed by the first 3 pilot
businesses (Tado Foods retail + 2 others you recruit).

---

## 2. Data architecture (MongoDB)

### Tenancy: shared database, tenant-scoped collections
- ONE Atlas database. Every document carries `accountId`, `businessId`, `branchId`.
- Tenant is derived from the JWT **only** — never accepted from the client body.
- A single repository/data-access layer injects the tenant filter into every
  query. No raw collection access anywhere else in the codebase.
- All compound indexes are tenant-prefixed: `{businessId: 1, branchId: 1, ...}`.
- Hybrid escape hatch: the repo layer can later route specific enterprise accounts
  to a dedicated database without app changes.

### Money & correctness rules
- Money is `Decimal128` (or integer minor-units/kobo). Never floats.
- Sales = **header + lines**: one `sales` doc with `items[]`. Discounts and VAT
  live on the header; line totals are net.
- Inventory truth = append-only `stock_movements` (IN/OUT/TRANSFER/RETURN/ADJUST,
  with actor, reason, balanceAfter). `inventory.stock` is a cached derivative.
- Checkout runs in a **multi-document transaction**: movement + sale + customer
  update commit together or not at all.
- Undo = post a reversing movement + mark sale voided (kept, flagged) — never
  delete financial rows. This replaces the delete-row approach of the old app.

### Collections (v1)
```
users            {email, passwordHash, name, ...}
accounts    {name, ownerUserId, plan, status}
businesses       {accountId, name, typeKey, settings{currency, vat...}}
branches         {accountId, businessId, name, address}
memberships      {userId, accountId, businessId?, branchId?, role, permsOverride[], pinHash, status}
businessTypes    {key, label, enabledModules[], terminology, kpiPack, productFields[]}  // seed data
products         {accountId, businessId, sku/barcode, name, category, archetype:'stock',
                  price, cost, expenseOnCost, reorderLevel, expiry?, custom{}}
inventory        {accountId, businessId, branchId, productId, stock, updatedAt}
stock_movements  {accountId, businessId, branchId, productId, type, qty, balanceAfter,
                  refType, refId, actorId, at}
sales            {accountId, businessId, branchId, saleNo, at, staffId, customerId?,
                  items[{productId, name, qty, unitPrice, lineCost, lineNet}],
                  subtotal, discount, vat, total, payments[{method, amount}],
                  status:'completed|voided', voidInfo?}
returns          {accountId, businessId, branchId, saleId, items[], refund{method, amount},
                  reason, status:'pending|approved|rejected', requestedBy, decidedBy, at}
customers        {accountId, businessId, name, phone, whatsapp, totalSpend, visits,
                  firstSeen, lastSeen, lastBranchId}
expenses         {accountId, businessId, branchId, type, amount, notes, paidBy, at}
attendance       {accountId, businessId, branchId, staffId, clockIn, clockOut, hours, date}
daily_metrics    {accountId, businessId, branchId, date, revenue, cost, profit, txns,
                  discountTotal, vatTotal, paymentSplit{}, topProducts[], expenses}
audit_log        {accountId, businessId, actorId, action, target, before?, after?, at}
counters         {scopeKey, seq}    // human-friendly sale/receipt numbers per branch
```

Key indexes (examples):
- `sales`: `{businessId, branchId, at: -1}`, `{businessId, saleNo}`, `{businessId, customerId, at:-1}`
- `products`: `{businessId, name: "text"}` or Atlas Search, `{businessId, barcode}`
- `stock_movements`: `{businessId, branchId, productId, at: -1}`
- `daily_metrics`: `{businessId, branchId, date: -1}` (unique)

---

## 3. Roles & separation of power

### Role ladder (defaults; per-user overrides allowed, like old extraPerms)
| Capability | Owner | Admin | Manager | Staff |
|---|---|---|---|---|
| Billing, create/delete business & branches | ✅ | — | — | — |
| Business settings, VAT, receipt template | ✅ | ✅ | — | — |
| Staff management, roles, PIN reset | ✅ | ✅ | branch only | — |
| See cost & profit, finance dashboard | ✅ | ✅ | optional flag | ❌ never |
| Prices & product management | ✅ | ✅ | ✅ | — |
| Approve returns, stock transfers | ✅ | ✅ | ✅ | — |
| Ops dashboard (own branch) | ✅ | ✅ | ✅ | — |
| Sell, submit returns, own activity, clock in/out | ✅ | ✅ | ✅ | ✅ |
| Cross-branch visibility | all | all | own branch | own branch |

Hard guarantees (server-enforced, not just hidden buttons):
- Staff API responses **never include** cost/profit fields (projection at repo layer).
- Every request is scoped to the membership's branch unless role grants wider.
- All sensitive actions (price change, void, PIN reset, permission change,
  export) write to `audit_log` — owner-visible timeline.
- Two login modes: **full account** (email+password → owner/admin anywhere) and
  **till mode** (business code + staff PIN, device-registered, short sessions,
  server-side rate limiting on PIN attempts — global throttle, not client-keyed).

---

## 4. End-to-end user journey

### A0. "Try the demo" (no-signup sandbox — a core marketing feature)
- Landing page has **Try the demo** → no signup. Server clones a seeded template
  business ("Sunrise Superstore": products, 7 days of sales, staff, a pending
  return, low-stock items) into a throwaway sandbox account for that visitor.
- Sandbox is fully interactive (sell, return, stock-in, dashboards) and
  auto-deleted after 24h (TTL index on the sandbox account).
- Persistent banner: "You're in demo mode — Create your own business →" (the
  conversion hook). Rate-limit sandbox creation per IP.
- Separately, real signups can choose "start with demo data" in the wizard and
  wipe it later.

### A. Acquisition → first sale in under 10 minutes (this IS the marketing)
1. Landing page → **Sign up** (email+password or Google).
2. **Onboarding wizard** (one screen per step, progress bar):
   1) Your name → 2) Business name + pick business type (cards with icons)
   → 3) First branch (name, address; "add more later")
   → 4) Currency + VAT on/off → 5) Add 3 products manually OR import CSV OR
   "start with demo data" → 6) Done → confetti → Dashboard.
3. Dashboard shows a **Getting Started checklist**: add products, add first
   staff, make first sale, connect printer. Each item deep-links.
4. **Demo mode toggle**: seeded sample data they can explore and wipe.

### B. Owner sets up the team
1. Staff page → "Add staff": name, role, branch, generate PIN.
2. Staff opens the till device → enters business code once (registers device)
   → thereafter logs in with PIN only.
3. Owner can suspend staff, reset PIN, grant per-user extras (e.g. give one
   trusted staff "prices"), all audited.

### C. Daily operation loop
Clock in → POS (search/scan → cart → discount → pay → receipt prints/WhatsApps)
→ stock-ins as goods arrive → returns submitted by staff, approved by manager →
owner checks dashboard from phone → clock out. Offline: sales queue locally
(IndexedDB) and sync with idempotency keys when back online.

### D. Growth paths
- Add branch → transfers + per-branch dashboards light up.
- Add a second business (different type) under same account → "My Businesses" switcher appears.
- Upgrade plan when hitting limits (branches, staff count, history depth).

### E. Billing (v1.1)
Plans: Free (1 branch, 2 staff, 30-day history) → Growth → Pro (multi-branch,
finance dashboard, exports, priority support). Paystack/Flutterwave recurring.
Feature gates checked server-side via `accounts.plan`.

---

## 5. UI revamp (design as a marketing weapon)

### System
- Keep the **blue** (#1a48cc family) as brand primary; neutral slate surfaces;
  green/amber/red semantics; light + dark from day one.
- Stack: **Tailwind + shadcn/ui (Radix)** for accessible primitives; design
  tokens file so the brand is one edit away (future white-label).
- Typography: one display face + one body face max (Outfit worked; keep or swap
  for Inter/Geist for a more "product" feel).

### Layout
- **Top bar:** Business → Branch switcher (Account layer hidden; shows as "My Businesses" only when 2+ businesses exist), global search (⌘K), notifications, user menu.
- **Sidebar:** modules driven by business type + role (staff sees 4 items, owner sees all).
- **POS screen** is the crown jewel: full-height product grid with instant
  search, big touch targets, keyboard-first (barcode scanners are keyboards),
  sticky cart, one-tap payment methods, < 3 taps from product to receipt.

### Ease-of-use principles (each one is a demo-able selling point)
1. Every list: instant search, empty states that teach ("No products yet — add
   one or import CSV"), skeleton loaders, never a blank white screen.
2. Every destructive/financial action: confirm with context, undoable where possible.
3. Mobile-first responsive — owners live on phones; the dashboard must be
   excellent on a phone.
4. Onboarding tour (product-tour bubbles) on first visit per module.
5. Plain language + business's own terminology (a hotel sees "Rooms", not "Products").
6. Receipt/WhatsApp templates that look premium out of the box.

---

## 6. Performance ("it must not lag")

Targets: first load < 2.5s on 3G-ish, route changes < 300ms, POS interactions
< 100ms, search results < 250ms.

| Layer | Tactic |
|---|---|
| Frontend | Vite + code-splitting per module; TanStack Query cache with background refetch; optimistic updates (cart, stock-in); virtualized tables (TanStack Virtual) for big lists; debounced server search; PWA asset caching |
| API | NestJS; pagination everywhere (cursor-based on `at`); projections (never send fields the role can't see — also perf); gzip/br; p95 tracking |
| DB | Tenant-prefixed compound indexes; Atlas Search for product/customer search; `daily_metrics` rollups so dashboards never scan raw sales; aggregation pipelines only for custom ranges |
| Cache/jobs | Redis: sessions, rate limits, hot settings; BullMQ workers: rollups (incremental on each sale + nightly reconcile), alerts (low stock, expiry), WhatsApp/receipt sends |
| Offline | IndexedDB (Dexie) outbox for sales with idempotency keys; server dedupes on `clientSaleId` |
| Realtime | Socket.IO rooms per branch: live dashboard tiles, "sale just happened", low-stock pings |

---

## 7. Backend module map (NestJS)

```
auth/            register, login, till-PIN login, sessions, rate-limit
tenancy/         accounts, businesses, branches, context resolution middleware
memberships/     staff, roles, permissions, PIN mgmt, audit hooks
catalog/         products, categories, barcode, import (CSV)
inventory/       stock, movements, transfers, alerts
sales/           checkout (transactional), receipts, void/undo, offline-sync endpoint
returns/         request/approve workflow
customers/       CRM-lite
expenses/
attendance/
metrics/         rollup workers + dashboard read API
settings/
billing/         plans, gates, Paystack webhook (v1.1)
notifications/   email/WhatsApp templates
audit/
```

Frontend (React + TS + Vite): `app-shell` (switcher, sidebar, ⌘K) + one folder
per module mirroring the API; shared `ui/` (design system) and `lib/api` (typed
client generated from the API's OpenAPI spec — end-to-end type safety).

---

## 8. Build phases

| Phase | Deliverable | Exit test |
|---|---|---|
| 0 | Design system + app shell + landing page | Clickable shell, brand locked |
| 1 | Auth, tenancy, onboarding wizard, roles, staff PIN | Register → wizard → invite staff → staff PIN login works |
| 2 | Catalog + Inventory + POS + receipts (the money path) | Real sale end-to-end incl. offline queue + WhatsApp receipt |
| 3 | Returns, expenses, customers, attendance | Full daily loop for a shop |
| 4 | Dashboard (rollups), audit log, settings | Owner runs the business from a phone |
| 5 | Billing + hardening (rate limits, backups, monitoring) + pilot onboarding | 3 pilot businesses live, incl. Tado Foods migrated (CSV import from Sheets) |
| 1.5 | Made-to-order/BOM archetype (window blinds) | The blinds+electronics shop runs fully |
| 2.0 | Bookable+folio (hotel), recipes/KDS (eatery), type-builder | New verticals are config, not code |

Migration for existing customer: export current Google Sheets → CSV → importer
maps to products/customers/sales history. Keep the Apps Script version running
until the pilot signs off.

---

## 9. Decisions locked / still open

**Locked:** MongoDB Atlas · shared-DB multi-tenancy with tenant-scoped repo
layer · React+TS+Vite+Tailwind+shadcn · NestJS+Redis+BullMQ · keep the blue ·
retail is vertical #1 · blinds/BOM is v1.5 · hotels/eatery v2.

**Open (answer before Phase 1):**
1. Offline-first depth: outbox-for-sales only (recommended for MVP) vs full
   offline catalog sync?
2. Pilot pricing: free pilot for 3 businesses, then launch plans?
3. Staff PIN policy: PIN-only on registered devices, or PIN+business code every time?
4. Hosting region/budget (Fly/Render/Railway + Atlas M0→M10, Vercel front).
