# Goods Importation

A small full-stack app for tracking import shipments from origin to delivery.
It is a TypeScript monorepo with an Express + SQLite API and a Vite + React UI.

## Stack

- **server/** — Express 4 REST API in TypeScript, persisted with SQLite (`better-sqlite3`).
- **client/** — React 18 + Vite single-page UI (dev server proxies `/api` to the API).
- npm workspaces tie the two packages together.

## Requirements

- Node.js >= 20 (developed on Node 22)
- npm >= 10

## Getting started

```bash
npm install        # install all workspace dependencies
npm run dev        # start the API (:3001) and the web UI (:5173) together
```

Then open http://localhost:5173.

The API stores data in `data/goods.sqlite` (created automatically and git-ignored)
and seeds a couple of example shipments on first run.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API + web UI concurrently for development. |
| `npm run build` | Type-check and build both packages. |
| `npm test` | Run the API test suite (Vitest + Supertest). |
| `npm run lint` | Lint the whole workspace with ESLint. |
| `npm start` | Run the compiled API from `server/dist`. |

## API

Base URL: `http://localhost:3001`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health and valid statuses. |
| `GET` | `/api/shipments` | List all shipments. |
| `POST` | `/api/shipments` | Create a shipment. |
| `GET` | `/api/shipments/:id` | Fetch a single shipment. |
| `PATCH` | `/api/shipments/:id` | Update a shipment's status. |
| `DELETE` | `/api/shipments/:id` | Delete a shipment. |

A shipment moves through the statuses: `pending → in_transit → customs → cleared → delivered`.

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm install` and runs
`npm run dev` in a persistent `dev` terminal, exposing ports 5173 (web) and 3001 (API).
