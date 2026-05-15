# DraftKit API Backend

This service is the standalone, licensable DraftKit API product.

## Environment variables

Copy `.env.example` to `.env` and fill in:

- `PORT` (optional, default `3000`)
- `MONGODB_URI`
- `APP_CLIENT_KEY`
- `JWT_SECRET`
- `CORS_ORIGIN` (optional, default `http://localhost:5173`)
- `SYNC_MLB_ON_STARTUP` (optional, `true`/`false`, default `true`)
- `SYNC_MLB_ROSTER_TYPE` (optional, default `40Man`)
- `SYNC_MLB_SEASONS_BACK` (optional, default `3`)
- `SYNC_MLB_LOOKBACK_DAYS` (optional, default `30`)
- `SYNC_MLB_CONCURRENCY` (optional, default `8`)
- `SYNC_MLB_INTERVAL_MINUTES` (optional, default `0`, disabled when `0`)
- `SYNC_MLB_REPLACE_CATALOG` (optional, `true`/`false`, default `false`)
- `EXTERNAL_DATA_REFRESH_ON_SYNC` (optional, `true`/`false`, default `true`)
- `EXTERNAL_DATA_CACHE_DIR` (optional, default `.cache/external-data`)
- `LAHMAN_BATTING_CSV_PATH` (optional)
- `LAHMAN_PITCHING_CSV_PATH` (optional)
- `LAHMAN_PEOPLE_CSV_PATH` (optional)
- `CHADWICK_REGISTER_CSV_PATH` (optional)
- `FANGRAPHS_DEPTH_CSV_PATH` (optional)
- `LAHMAN_ZIP_PATH` (optional, local comma-delimited Lahman archive containing `Batting.csv`, `Pitching.csv`, and `People.csv`)
- `LAHMAN_BATTING_CSV_URL` (optional)
- `LAHMAN_PITCHING_CSV_URL` (optional)
- `LAHMAN_PEOPLE_CSV_URL` (optional)
- `LAHMAN_ZIP_URL` (optional, comma-delimited Lahman archive containing `Batting.csv`, `Pitching.csv`, and `People.csv`)
- `CHADWICK_REGISTER_CSV_URL` (optional)
- `CHADWICK_REGISTER_CSV_URLS` (optional, comma-separated split Chadwick register CSV URLs)
- `FANGRAPHS_DEPTH_CSV_URL` (optional)

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

#### `POST /api/players/sync/mlb`

Refreshes catalog data from MLB Stats API using official MLB integer IDs, including:

- Team catalog (`/teams`)
- Player pool from team roster (`active`, `40Man`, `depthChart`, or `fullSeason`)
- Last N seasons of stats (default 3)
- Recent transaction-based injury/status updates (default last 30 days)

Optional request body:

- `rosterType` (`active`, `40Man`, `depthChart`, `fullSeason`)
- `seasonsBack` (positive integer)
- `lookbackDays` (positive integer)
- `concurrency` (positive integer)
- `latestSeason` (year)
- `replaceCatalog` (boolean, if true deletes players not in latest sync)
- `refreshExternalData` (optional boolean, default `true`)
- `externalDataCacheDir` (optional cache folder for downloaded CSV overlays)
- `lahmanBattingCsvPath` (optional file path)
- `lahmanPitchingCsvPath` (optional file path)
- `lahmanPeopleCsvPath` (optional file path)
- `chadwickRegisterCsvPath` (optional file path)
- `fangraphsDepthCsvPath` (optional file path)
- `lahmanBattingCsvUrl` (optional URL, downloaded at sync time)
- `lahmanPitchingCsvUrl` (optional URL, downloaded at sync time)
- `lahmanPeopleCsvUrl` (optional URL, downloaded at sync time)
- `chadwickRegisterCsvUrl` (optional URL, downloaded at sync time)
- `fangraphsDepthCsvUrl` (optional URL, downloaded at sync time)

```bash
curl -X POST -H "Authorization: Bearer $APP_CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rosterType": "40Man",
    "seasonsBack": 3,
    "lookbackDays": 30,
    "replaceCatalog": false
  }' \
  http://localhost:3000/api/players/sync/mlb
```

Startup behavior:

- Default: boot seeds first, then immediately overlay with live MLB sync.
- If `SYNC_MLB_ON_STARTUP=false`: boot with seeded catalog only.
- If `SYNC_MLB_INTERVAL_MINUTES > 0`: run recurring background MLB sync on that interval.
- If Lahman/FanGraphs URLs are configured (or local CSV paths are configured): overlays are applied during sync.
- URL-configured overlay files are downloaded to `EXTERNAL_DATA_CACHE_DIR` before each sync.
- `LAHMAN_ZIP_PATH` or `LAHMAN_ZIP_URL` can point at the SABR comma-delimited Lahman zip; the API extracts `Batting.csv`, `Pitching.csv`, and `People.csv` automatically.
- If no `CHADWICK_REGISTER_CSV_URL` or `CHADWICK_REGISTER_CSV_URLS` is provided, the API downloads and combines Chadwick's public `people-0.csv` through `people-f.csv` register files automatically.

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
| Player info | MLB Stats API | On-demand sync |
| Player stats (historical baseline) | Lahman Database | Static historical dataset (best for stable multi-year baselines) |
| Player stats (live fallback) | MLB Stats API + seeded fallback | On-demand / fallback when Lahman rows are unavailable |
| Injury status | MLB Transactions | Dynamic |
| Team info | MLB Stats API / Lahman | On-demand sync + static cross-check |
| Depth charts | FanGraphs export CSV (+ Chadwick ID map) | Dynamic manual refresh |
| Transactions | MLB Transactions | Dynamic |
| ID cross-reference | Chadwick Register | Static |

### Lahman Usage (Recommended)

- Keep MLBAM integer IDs (`playerId`, `mlbTeamId`) as canonical IDs in API responses.
- Use Lahman for historical batting/pitching baselines (3+ seasons) and stable year-over-year analytics.
- Use Chadwick Register to map Lahman IDs to MLB IDs when needed.
- Keep MLB Stats API as the source for live roster movement, injuries, and current-team assignment.

### FanGraphs Usage (Recommended)

- Use FanGraphs as a depth/projection overlay source (for depth rank context).
- Load FanGraphs via exported CSV and map IDs through Chadwick register.
- Keep MLB Stats API as the authoritative live roster/injury feed.

## Product boundary

- This API is intentionally app-agnostic.
- Any third-party client can consume it with a valid license key.
- DraftKit frontend is one licensed consumer, not a hard dependency.
