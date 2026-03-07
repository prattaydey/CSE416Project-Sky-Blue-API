# DraftKit API Backend (MVP)

This service is the standalone, licensable DraftKit API product.

## Environment variables

Copy `.env.example` to `.env` and fill in:

- `PORT` (optional, default `3000`)
- `MONGODB_URI`
- `EXTERNAL_API_KEY`
- `APP_CLIENT_KEY`
- `CORS_ORIGIN`

## Run locally

```bash
npm install
npm run dev
```

## API endpoints

- `GET /api/players`
- `GET /api/players/:playerId`

Requires header:

`Authorization: Bearer <APP_CLIENT_KEY>`

## Product boundary
- This API is intentionally app-agnostic.
- Any third-party client can consume it with a valid license key.
- DraftKit frontend is one licensed consumer, not a hard dependency.

## Quick verification with curl

Missing auth (should be `401`):

```bash
curl -i http://localhost:3000/api/players/123
```

Authorized first request (should be `source: "external"`):

```bash
curl -i \
  -H "Authorization: Bearer $APP_CLIENT_KEY" \
  http://localhost:3000/api/players/123
```

Second authorized request for same ID (should be `source: "cache"`):

```bash
curl -i \
  -H "Authorization: Bearer $APP_CLIENT_KEY" \
  http://localhost:3000/api/players/123
```
