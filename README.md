# StarTrack

Sales, stock, staff and customers for small businesses, built as a **platform with independent business services**: supermarket, window blinds, electronics, training academy, poultry farm and water factory. Each business lives in its own folder and plugs into the shared platform through a small, checked contract.

**Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for how it is organized, the rules, and how to add a business.

## Run it

```bash
npm install
npm run dev            # local database + API + web client together
```

The API reads `.env` (database, mail, payments, AI keys). `npm run dev:db` starts a local MongoDB, so no external database is needed to develop.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | database, API and web client with hot reload |
| `npm run build` | type-check and build the client |
| `npm run check:architecture` | fails if a business reaches into another business or the platform's internals, or the platform reaches into a business |
| `npm run e2e` | the end-to-end suite, in a real browser, against a throwaway local database |
| `npm run seed:showcase` | permanent demo accounts: every business on every plan |
| `npm run seed:empty` | empty test accounts for first-run flows |
| `npm run seed:admin` | the platform admin login |

## Layout

```
server/platform/     the contract and the platform's public interface
server/businesses/   the six businesses, each self-contained
server/modules/      the shared platform services
public/businesses/   each business's screens
```
