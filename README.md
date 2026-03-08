# DraftKit API Backend (MVP)

This service is the standalone, licensable DraftKit API product.

## Environment variables

Copy `.env.example` to `.env` and fill in:

- `PORT` (optional, default `3000`)
- `MONGODB_URI`
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

If a player ID is not in MongoDB, `GET /api/players/:playerId` returns `404`.

## Product boundary
- This API is intentionally app-agnostic.
- Any third-party client can consume it with a valid license key.
- DraftKit frontend is one licensed consumer, not a hard dependency.

## Quick verification with curl

Missing auth (should be `401`):

```bash
curl -i http://localhost:3000/api/players/123
```

Authorized request for existing player (should be `200`):

```bash
curl -i \
  -H "Authorization: Bearer $APP_CLIENT_KEY" \
  http://localhost:3000/api/players/123
```

Authorized request for unknown player ID (should be `404`):

```bash
curl -i \
  -H "Authorization: Bearer $APP_CLIENT_KEY" \
  http://localhost:3000/api/players/does-not-exist
```
