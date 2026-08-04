# call_ui

Frontend for **Subash Care** Malayalam voice product registration.

Vite + React + TypeScript dashboard:

- Browser mic session against **swaram.live** (token from `call_api`)
- Live registration card + recent-registrations queue
- CSV export of completed registrations

Pair with the backend repo: **`call_api`**.

---

## Quick start

1. Start **`call_api`** first (`http://localhost:8090`, with `SWARAM_API_KEY` set).
2. Then:

```bash
# optional: cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Open **http://localhost:5173**, press **Start call**, and talk to Anjana.

In dev, Vite proxies `/api/*` → `http://localhost:${API_PORT}` (default `8090`), so you
can leave `VITE_API_BASE_URL` unset.

---

## Environment

Copy `.env.example` → `.env` if you need overrides:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | no in dev | Absolute `call_api` URL when UI is hosted separately (no trailing slash). Example: `https://api.example.com` |
| `CLIENT_PORT` | no | Vite port (default `5173`) |
| `API_PORT` | no | Proxy target for `/api` in dev (default `8090`) |

When `VITE_API_BASE_URL` is set, all `/api/...` fetches go there. Ensure `call_api` has
that UI origin in `CORS_ORIGINS`.

---

## How voice works (browser)

1. UI `POST`s `/api/swaram-token` on `call_api`
2. Browser opens WebSocket to `wss://api.swaram.live/v1/realtime` with the ephemeral token
3. Mic → 24 kHz PCM16 → swaram; audio deltas play back
4. Function calls (`select_service`, `save_registration`, `complete_registration`) hit
   `call_api` `/api/subash/*`

Phone calls do **not** go through this UI — they hit `call_api`’s Plivo bridge directly.
Phone completions still show in the recent queue here (refresh).

---

## Scripts

```bash
npm run dev         # Vite + HMR
npm run build       # typecheck + production bundle → dist/
npm run preview     # serve dist locally
npm run typecheck
```

---

## Production tip

Host `call_ui` (static `dist/`) and `call_api` separately:

```bash
# call_ui build
VITE_API_BASE_URL=https://your-api.example.com npm run build
```

```bash
# call_api .env
CORS_ORIGINS=https://your-ui.example.com
```
