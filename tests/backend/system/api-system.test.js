const seedPlayers = require("../../../src/data/seedPlayers");
const Player = require("../../../src/models/player.model");
const User = require("../../../src/models/user.model");
const mlbCatalogSyncService = require("../../../src/services/mlbCatalogSyncService");
const { createApp } = require("../../../src/server");

const originalFind = Player.find;
const originalFindOne = Player.findOne;
const originalCreate = Player.create;
const originalUserFindOne = User.findOne;

async function request(app, {
  method = "GET",
  path,
  body,
  auth = "Bearer test-app-client-key",
  origin,
} = {}) {
  const server = app.listen(0);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const headers = {};
    if (auth) headers.Authorization = auth;
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    return {
      status: response.status,
      headers: response.headers,
      payload,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function mockPlayerFind(data) {
  const lean = vi.fn().mockResolvedValue(data);
  const sort = vi.fn().mockReturnValue({ lean });
  Player.find = vi.fn().mockReturnValue({ sort, lean });
}

function mockPlayerFindOne(data) {
  const lean = vi.fn().mockResolvedValue(data);
  Player.findOne = vi.fn().mockReturnValue({ lean });
}

describe("system: DraftKit API", () => {
  afterEach(() => {
    Player.find = originalFind;
    Player.findOne = originalFindOne;
    Player.create = originalCreate;
    User.findOne = originalUserFindOne;
    vi.restoreAllMocks();
  });

  it("enforces app-key auth, CORS, player listing, and bulk valuation through the real app", async () => {
    const app = createApp();

    const unauthorized = await request(app, {
      path: "/api/players",
      auth: null,
      origin: "http://localhost:5173",
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.payload).toEqual({ error: "Unauthorized" });
    expect(unauthorized.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");

    mockPlayerFind(seedPlayers.slice(0, 4));
    const listed = await request(app, {
      path: "/api/players",
      origin: "http://localhost:5173",
    });

    expect(listed.status).toBe(200);
    expect(listed.payload).toHaveLength(4);
    expect(listed.payload[0]).toEqual(expect.objectContaining({
      id: expect.any(Number),
      name: expect.any(String),
      position: expect.any(Array),
    }));

    mockPlayerFind(seedPlayers);
    const valued = await request(app, {
      method: "POST",
      path: "/api/players/value",
      body: {
        playerIds: [605141, 621566],
        leagueSettings: {
          budget: 260,
          teams: 12,
          scoringSystem: "roto",
          categories: {
            hitters: ["BA", "HR", "RBI", "SB"],
            pitchers: ["ERA", "W", "SV", "K"],
          },
          rosterSpots: { hitters: 8, pitchers: 5 },
        },
        draftState: {
          playersDrafted: [{ playerId: 592450, price: 42 }],
        },
      },
    });

    expect(valued.status).toBe(200);
    expect(valued.payload.values.map((row) => row.playerId).sort()).toEqual([605141, 621566]);
    expect(valued.payload.values.every((row) => Number.isFinite(row.value))).toBe(true);
  });

  it("supports the player create/read lifecycle through the real app", async () => {
    const app = createApp();
    const fetchedAt = new Date("2026-05-14T12:00:00.000Z");
    let storedPlayer = null;

    Player.findOne = vi.fn((query) => {
      const lean = vi.fn().mockResolvedValue(
        storedPlayer && query?.playerId === storedPlayer.playerId ? storedPlayer : null,
      );
      return { lean };
    });

    Player.create = vi.fn(async (payload) => {
      storedPlayer = {
        ...payload,
        fetchedAt,
        toObject() {
          return {
            ...this,
            toObject: undefined,
          };
        },
      };
      return storedPlayer;
    });

    const created = await request(app, {
      method: "POST",
      path: "/api/players",
      body: {
        playerId: 999001,
        name: "System Test Player",
        team: "lad",
        league: "NL",
        position: ["of"],
        stats: { BA: 0.281, HR: 18, RBI: 74, SB: 11 },
        age: 27,
        depthRank: 2,
      },
    });

    expect(created.status).toBe(201);
    expect(created.payload).toEqual(expect.objectContaining({
      playerId: 999001,
      team: "LAD",
      position: ["OF"],
      age: 27,
      depthRank: 2,
    }));

    const read = await request(app, {
      path: "/api/players/999001",
    });

    expect(read.status).toBe(200);
    expect(read.payload).toEqual(expect.objectContaining({
      playerId: 999001,
      name: "System Test Player",
      team: "LAD",
      position: ["OF"],
    }));
  });

  it("passes MLB sync and external-data options through the system endpoint", async () => {
    const syncSpy = vi.spyOn(mlbCatalogSyncService, "syncCatalogFromMlbApi").mockResolvedValue({
      rosterType: "40Man",
      seasonsSynced: [2026, 2025, 2024],
      teamsSynced: 30,
      playersSynced: 1200,
      transactionsAnalyzed: 40,
      replacedCatalog: false,
      externalDataRefresh: {
        attempted: true,
        refreshedSources: ["lahmanBattingCsvPath", "chadwickRegisterCsvPath"],
        failedSources: [],
        cacheDir: ".cache/external-data",
      },
    });

    const app = createApp();
    const response = await request(app, {
      method: "POST",
      path: "/api/players/sync/mlb",
      body: {
        rosterType: "40Man",
        seasonsBack: 3,
        lookbackDays: 30,
        refreshExternalData: true,
        lahmanZipPath: "data/lahman/lahman.zip",
        lahmanZipUrl: "https://example.com/lahman.zip",
        chadwickRegisterCsvUrls: "https://example.com/people-0.csv,https://example.com/people-1.csv",
      },
    });

    expect(response.status).toBe(200);
    expect(response.payload).toEqual(expect.objectContaining({
      ok: true,
      playersSynced: 1200,
      teamsSynced: 30,
    }));
    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({
      rosterType: "40Man",
      refreshExternalData: true,
      lahmanZipPath: "data/lahman/lahman.zip",
      lahmanZipUrl: "https://example.com/lahman.zip",
      chadwickRegisterCsvUrls: "https://example.com/people-0.csv,https://example.com/people-1.csv",
    }));
  });

  it("returns validation errors from the real sync endpoint without calling MLB services", async () => {
    const syncSpy = vi.spyOn(mlbCatalogSyncService, "syncCatalogFromMlbApi");
    const app = createApp();

    const response = await request(app, {
      method: "POST",
      path: "/api/players/sync/mlb",
      body: {
        rosterType: "not-real",
      },
    });

    expect(response.status).toBe(400);
    expect(response.payload.error).toContain("rosterType");
    expect(syncSpy).not.toHaveBeenCalled();
  });
});
