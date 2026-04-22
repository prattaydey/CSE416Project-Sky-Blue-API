# DraftKit API Backend

This service is the standalone, licensable DraftKit API product.

## Environment variables

Copy `.env.example` to `.env` and fill in:

- `PORT` (optional, default `3000`)
- `MONGODB_URI`
- `APP_CLIENT_KEY`
- `JWT_SECRET`
- `CORS_ORIGIN` (optional, default `http://localhost:5173`)

## Run locally

```bash
npm install
npm run dev
```

## Authentication

All `/api/players`, `/api/player`, and `/api/teams` endpoints require:

```
Authorization: Bearer <APP_CLIENT_KEY>
```

User endpoints (`/api/users`) are unauthenticated (register/login) or JWT-authenticated (generate API key).

## API Endpoints

### Players

#### `GET /api/players`

Returns all players. Supports league filtering via query param.

| Query Param | Values | Description |
|-------------|--------|-------------|
| `league` | `AL`, `NL`, `MLB` (or omit) | Filter by league. `MLB` or omitting returns all players. |

```bash
# All players
curl -H "Authorization: Bearer $APP_CLIENT_KEY" http://localhost:3000/api/players

# AL only
curl -H "Authorization: Bearer $APP_CLIENT_KEY" "http://localhost:3000/api/players?league=AL"

# NL only
curl -H "Authorization: Bearer $APP_CLIENT_KEY" "http://localhost:3000/api/players?league=NL"
```

#### `GET /api/players/:playerId`

Returns detailed info for a single player by MLB integer ID.

```bash
curl -H "Authorization: Bearer $APP_CLIENT_KEY" http://localhost:3000/api/players/605141
```

### Player Valuation

All valuation endpoints accept `leagueSettings` and `draftState` in the request body.

`leagueSettings` supports:

- `budget` (number, required)
- `teams` (integer, required)
- `scoringSystem` (`roto` or `points`, optional, default `roto`)
- `categories.hitters` / `categories.pitchers` (optional arrays for roto categories)
- `pointsConfig.hitters` / `pointsConfig.pitchers` (optional points weights)
- `budgetSplit` (optional `{ hitters, pitchers }`)
- `rosterSpots` (optional `{ hitters, pitchers }`)
- `minPlayerCost` (optional number)

`draftState` supports:

- `playersDrafted` (optional `[{ playerId, price }]`)
- `teamStates` (optional per-team state):
  - `teamId`
  - `budgetRemaining`
  - `rosterFilled: { hitters, pitchers }`
  - `draftedPlayerIds`

#### `POST /api/player/value`

Single player valuation.

```bash
curl -X POST -H "Authorization: Bearer $APP_CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "leagueSettings": {
      "budget": 260,
      "teams": 12,
      "scoringSystem": "roto",
      "categories": {
        "hitters": ["BA", "HR", "RBI", "SB"],
        "pitchers": ["ERA", "W", "SV", "K"]
      }
    },
    "draftState": {
      "playersDrafted": [],
      "teamStates": [
        {
          "teamId": "TeamA",
          "budgetRemaining": 180,
          "rosterFilled": { "hitters": 8, "pitchers": 5 }
        }
      ]
    },
    "playerId": 605141
  }' \
  http://localhost:3000/api/player/value
```

#### `POST /api/players/value`

Multiple player valuation.

```bash
curl -X POST -H "Authorization: Bearer $APP_CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "leagueSettings": { "budget": 260, "teams": 12 },
    "draftState": { "playersDrafted": [] },
    "playerIds": [605141, 621566]
  }' \
  http://localhost:3000/api/players/value
```

#### `POST /api/players/value/all`

Valuation for all undrafted players.

```bash
curl -X POST -H "Authorization: Bearer $APP_CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "leagueSettings": { "budget": 260, "teams": 12 },
    "draftState": { "playersDrafted": [] }
  }' \
  http://localhost:3000/api/players/value/all
```

### Teams

#### `GET /api/teams`

Returns all 30 MLB teams. Supports league filtering.

```bash
curl -H "Authorization: Bearer $APP_CLIENT_KEY" "http://localhost:3000/api/teams?league=AL"
```

#### `GET /api/teams/:teamId`

Returns a single team by MLB integer ID.

```bash
curl -H "Authorization: Bearer $APP_CLIENT_KEY" http://localhost:3000/api/teams/147
```

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/users/register` | None | Create account |
| POST | `/api/users/login` | None | Login, receive JWT |
| POST | `/api/users/generateapikey` | JWT | Regenerate API key |

## Data Model

### ID System

MLB integer IDs are the single source of truth for both players and teams:

- **Players**: MLB's permanent integer ID (e.g., Freddie Freeman = `605141`)
- **Teams**: MLB's franchise integer ID (e.g., Yankees = `147`, Dodgers = `119`)
- **Lahman cross-reference**: Optional `lahmanId` field on players for mapping to Lahman database string IDs

### Data Sources

| Data | Source | Update Frequency |
|------|--------|------------------|
| Player info | MLB Stats API | Static / on-demand |
| Player stats | Lahman Database / seeded catalog | Historical (3-season capable) |
| Injury status | MLB Transactions | Dynamic |
| Team info | MLB Stats API / Lahman | Static |
| Depth charts | FanGraphs | Dynamic |
| Transactions | MLB Transactions | Dynamic |
| ID cross-reference | Chadwick Register | Static |

## Product boundary

- This API is intentionally app-agnostic.
- Any third-party client can consume it with a valid license key.
- DraftKit frontend is one licensed consumer, not a hard dependency.
