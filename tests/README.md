# Testing Suite

This repository uses a unit-testing-first layout designed to support isolated verification before system/integration testing.

## Tooling

- `vitest` for test runner and assertions
- Backend tests run in `node` environment
- Frontend tests are prepared for `vitest` + React Testing Library (`jsdom` environment)

## Run tests

```bash
npm test
npm run test:watch
npm run test:backend
npm run test:frontend
```

## Organization

### Backend

- `tests/backend/controllers`
- `tests/backend/services`
- `tests/backend/models`
- `tests/backend/validation`
- `tests/backend/valuation`

### Frontend (scaffolded for future React app wiring)

- `tests/frontend/components`
- `tests/frontend/pages`
- `tests/frontend/hooks`
- `tests/frontend/utils`

## Covered backend checks

- Validation rejects malformed or incomplete requests
- Controllers return expected status codes and payload shapes
- Valuation logic returns stable values for known inputs
- Utility/data-transform services map external API payloads correctly
- Auth middleware behavior for valid/invalid keys and tokens
- Edge cases:
  - empty rosters
  - missing player fields
  - duplicate drafted actions
  - invalid player IDs
  - empty API responses
  - unusual/extreme stats inputs
