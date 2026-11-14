# StarTrack architecture

StarTrack is a **platform** with independent **business services** plugged into it.

- The **platform** is everything every business needs: sign-in and tenancy, staff and permissions, the product catalogue, stock, the till and checkout, returns, customers, expenses, reports, billing, support, team chat, the online store and the AI assistant.
- A **business** (supermarket, window blinds, electronics, training academy, poultry farm, water factory) is a self-contained folder that adds what is particular to that trade, and nothing else.

A business is independent of the others: it cannot see them, import them, or reach their data, and the platform cannot reach into it. The two sides meet at one narrow, checked contract.

```
                    ┌───────────────────────────────────────────────┐
                    │                  THE PLATFORM                 │
                    │  auth · tenancy · products · stock · till     │
                    │  checkout · returns · customers · reports     │
                    │  billing · chat · online store · AI · import  │
                    └──────────────▲──────────────┬─────────────────┘
        public interface           │              │   hooks it calls, by business type
        (#platform/index.js)       │              ▼   (via platform/registry.js)
   ┌────────────┬────────────┬─────┴──────┬────────────┬────────────┬────────────┐
   │supermarket │   blinds   │electronics │  academy   │  poultry   │   water    │
   └────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘
        independent: no business imports another, or the platform's internals
```

## Where things live

```
server/
  platform/          the contract and the platform's public interface
    index.js           what a business may use (and nothing else)
    contract.js        defineBusinessService(): what a business may register
    registry.js        the ONE place the platform meets the businesses
    importKit.js       helpers for a business's spreadsheet import
    demoKit.js         helpers for a business's demo data
    lazy.js            lazy tables (breaks an import cycle; see the file)
  businesses/        the businesses — one folder each, fully self-contained
    manifests.js       the installed businesses, as data (the browser reads it)
    services.js        the installed businesses, server side
    <key>/
      manifest.js      plain data: name, wording, categories, features, menu pages
      service.js       routes + hooks, the only file the platform loads
      *.routes.js, *.model.js    the business's own API and collections
      checkout.js, imports.js, ai.js, demo.js    its hooks
  modules/           the shared platform services (auth, products, sales, ...)
  core/              platform plumbing (db, http, tenancy middleware, audit)
  shared/            code the server and the browser both read
    businessTypes.js   built FROM the manifests; the types the app knows
public/
  businesses/        the browser half of each business
    index.ts           the installed businesses (routes + icons)
    <key>/ui.ts        its icon, its screens, its AI prompts
    <key>/*.tsx        its screens
  pages/ components/ lib/    the shared app
```

## The six businesses

| Business | What it owns | API (only that business can reach it) | Its own collections |
|---|---|---|---|
| Supermarket | nothing extra: plain retail is what the platform runs | | |
| Window Blinds | the **made-to-order** engine: items priced by size from a recipe of components | | |
| Electronics | **serial numbers**: tracked from stock-in to sale, with warranty | `/api/serials` | `serials` |
| Training Academy | **courses, intakes, enrolments, fees**; services (a fee is sold, never counted); the course-list import | `/api/academy` | `courses`, `intakes`, `enrollments`, `classsessions` |
| Poultry Farm | **living batches** and the **vaccination & medication** log | `/api/cohorts`, `/api/vaccinations` | `cohorts`, `vaccinationrecords` |
| Water Factory | **production runs** and **loyalty tokens** | `/api/production`, `/api/loyalty` | `productionruns` |

Blinds and electronics both use the platform's **Job Tickets** (work taken in, worked on, collected), and poultry and water both use the platform's **customer credit**. These are platform features a business switches on in its manifest (`capabilities`), not code either business owns.

## The contract

A business registers by providing two files and one line in each list.

**`manifest.js`** is plain data with no imports, because the browser loads it too:

| Field | Meaning |
|---|---|
| `key`, `label`, `tagline` | identity |
| `terminology.products`, `posLabel` | what the catalogue and the till are called |
| `defaultCategories`, `modules`, `skuPrefix` | sensible starting setup for a new business of this type |
| `capabilities` | platform features it uses (`jobs`, `credit`) or declares for itself (`serials`) |
| `capabilityInfo`, `ownsModules` | labels for what it declares / optional modules only it can switch on |
| `allowedUnits`, `positions` | trade rules and staff job titles |
| `service` | present only for a business that sells services, not stock: the wording it uses (`item`, `saleNoun`, `priceLabel`) and whether it also sells physical goods |
| `primaryImport`, `tillHome` | what "upload my list" means; where till staff land |
| `nav` | pages it adds to the menu (`group` is `operations` or `inventory`) |

**`service.js`** calls `defineBusinessService({ ... })` with any of:

| Field | What it does |
|---|---|
| `routes` | `[{ path, router, feature? }]`. The platform mounts each behind sign-in, the tenant context and a check that the caller's business **is** this type. `/api/cohorts` answers only to a poultry farm; anyone else gets `404 not_available`. |
| `checkout.archetypes` | `{ made_to_order: { lines(env) } }`. Turns cart items of a product archetype this business owns into priced sale lines. A business with no handler for an archetype cannot sell it, and cannot create products of it. |
| `checkout.validate` | `async (env) → { commit? }`. Runs before stock moves; throw to refuse the sale; `commit` runs once the sale exists. (Electronics checks serials here and marks them sold.) |
| `checkout.onCustomerSale` | `async (env)`. Runs inside the sale's transaction when it has a customer. (Water counts loyalty tokens.) |
| `imports` | spreadsheet import targets only this business has (the academy's course list). |
| `ai` | `brief` (how the business makes money and the mistakes a generic assistant would make), `modules` (its screens, with who may ask, a guide, and a builder returning live facts), `snapshot` (screens included in the whole-business overview). |
| `demo` | `shop` (sample business for the demo picker and showcase accounts), `seed` (its signature records), `sandbox` (extras for the 24-hour demo). |

## What a business may use from the platform

Only `#platform/index.js`: the tenant context and route gates (`requirePerm`, `requireBranch`, `requireCapability`, `requireFeature`), the shared records (`Product`, `Customer`, `StockMovement`, `Inventory`, `Job`), money (`postServicePayment`, `bumpDailyMetric`, `applyCreditChange`), stock (`applyMovement`, `afterStockChange`), and utilities (`withTransaction`, `audit`, `nextSeq`, `money`, `HttpError`...). If a business needs something that isn't there, add it there on purpose, so the platform knows it now has a promise to keep. Never import a platform module's internals.

## The rules, and the guard that enforces them

1. A business imports only **its own files**, **`#platform/index.js`** (and `contract.js`), and third-party packages.
2. A manifest imports **nothing**.
3. The platform imports **no business**. Two files are the doors, because their job is to list the installed businesses: `platform/registry.js` and `shared/businessTypes.js`.
4. A business's screens (`public/businesses/<key>/`) import shared client code and their own files, never another business's screens.
5. Shared client code imports a business's screens only through `public/businesses/index.ts`.

`npm run check:architecture` checks all five and exits non-zero with every violation listed. `e2e/architecture.spec.ts` runs it, and also proves the boundaries over HTTP: each business's routes are closed to other business types, a business cannot sell an item kind it doesn't handle, only the owner of an optional module is offered it, and a retired business type's old accounts keep working as plain retail.

## Adding a business

1. `server/businesses/<key>/manifest.js`, then `service.js` (start from `supermarket`, the smallest).
2. Add each to `manifests.js` and `services.js`.
3. If it has screens: `public/businesses/<key>/ui.ts` and add it to `public/businesses/index.ts`.
4. Run `npm run check:architecture`.

The platform needs no change. The sign-up form, demo picker, menu, AI, import, demo/showcase seeding and cleanup all discover the new business through the registry.

## Data ownership

Every business collection carries `accountId`/`businessId`, like the platform's. The platform's collections (users, accounts, memberships, businesses, branches, products, inventories, stockmovements, sales, returns, customers, expenses, jobs, tickets, ...) are shared by every business: a sale is a sale whoever made it. A business's own collections (table above) are read and written only by that business. Cleanup of throwaway data (`modules/auth/purgeTenant.js`) deletes every collection that has an `accountId`, so a new business's collections are covered without anyone listing them.

## Deployment, and the road to separate processes

Today this is a **modular monolith**: one API process (or one Netlify function) and one MongoDB, with hard boundaries inside it. That was a deliberate first step: the boundaries are enforced and tested now, and the code can be split later without untangling it first.

What a business already has that a separate service needs: its own routes under its own path prefix, its own models, its own checkout/AI/import/demo logic behind a declared interface, and no imports of the platform's internals. What extracting it would still take:

- run its router in its own process behind a gateway that forwards its `path` prefixes;
- turn the checkout hooks (`archetypes`, `validate`, `onCustomerSale`), which are in-process function calls inside a database transaction, into service calls or events, and decide how a sale that spans two services stays consistent;
- replace the `#platform` imports (`Product`, `applyMovement`, ...) with calls to the platform's API;
- give it its own database, or at least its own credentials, and migrate its collections.

Those are real changes with real trade-offs (the till's single transaction is the hardest), which is why they are not done yet. The contract above is the seam they would cut along.

## Retired businesses

Restaurant, hotel, cold room, laundry, gym, salon and agency were removed. An account that still has one of those types is not broken: an unknown type is run as plain retail ("General Business"), with none of the retired trade's screens. Nothing was deleted from the database; their old collections are simply no longer read.
