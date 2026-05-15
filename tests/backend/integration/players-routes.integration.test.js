const express = require("express");
const seedPlayers = require("../../../src/data/seedPlayers");
const Player = require("../../../src/models/player.model");
const User = require("../../../src/models/user.model");
const mlbCatalogSyncService = require("../../../src/services/mlbCatalogSyncService");
const { requireAppClientKey } = require("../../../src/middleware/auth");
const playersRoutes = require("../../../src/routes/players-routes");
const playerRoutes = require("../../../src/routes/player-routes");

const originalFind = Player.find;
const originalFindOne = Player.findOne;
const originalCreate = Player.create;
const originalUserFindOne = User.findOne;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/players", requireAppClientKey, playersRoutes);
  app.use("/api/player", requireAppClientKey, playerRoutes);
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

async function makeRequest(app, { method = "GET", path, body, auth = "Bearer test-app-client-key" }) {
  const server = app.listen(0);
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const headers = {};
    if (auth) headers.Authorization = auth;
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

    return { status: response.status, payload };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function mockFind(data) {
  const lean = vi.fn().mockResolvedValue(data);
  const sort = vi.fn().mockReturnValue({ lean });
  Player.find = vi.fn().mockReturnValue({ sort, lean });
}

function mockFindOne(data) {
  const lean = vi.fn().mockResolvedValue(data);
  Player.findOne = vi.fn().mockReturnValue({ lean });
}

describe("integration: players routes compatibility", () => {
  afterEach(() => {
    Player.find = originalFind;
    Player.findOne = originalFindOne;
    Player.create = originalCreate;
    User.findOne = originalUserFindOne;
    vi.restoreAllMocks();
  });

  it("returns 401 when missing app client key", async () => {
    const app = createApp();
    const response = await makeRequest(app, {
      path: "/api/players",
      auth: null,
    });

    expect(response.status).toBe(401);
    expect(response.payload).toEqual({ error: "Unauthorized" });
  });

  it("accepts valid per-user API key auth", async () => {
    User.findOne = vi.fn().mockResolvedValue({ _id: "u1", username: "demo" });
    mockFind(seedPlayers.slice(0, 2));

    const app = createApp();
    const response = await makeRequest(app, {
      path: "/api/players",
      auth: "Bearer user-api-key-123",
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.payload)).toBe(true);
    expect(response.payload).toHaveLength(2);
    expect(User.findOne).toHaveBeenCalledWith({ apiKey: "user-api-key-123" });
  });

  it("rejects invalid per-user API key auth", async () => {
    User.findOne = vi.fn().mockResolvedValue(null);

    const app = createApp();
    const response = await makeRequest(app, {
      path: "/api/players",
      auth: "Bearer bad-user-key",
    });

    expect(response.status).toBe(401);
    expect(response.payload).toEqual({ error: "Invalid API key" });
  });

  it("supports legacy GET player valuation contract", async () => {
    mockFind(seedPlayers);

    const drafted = encodeURIComponent(JSON.stringify([{ playerId: 592450, price: 50 }]));
    const rosterSlots = encodeURIComponent(
      JSON.stringify([
        { position: "C", count: 2 },
        { position: "1B", count: 2 },
        { position: "SP", count: 5 },
        { position: "RP", count: 3 },
      ]),
    );

    const app = createApp();
    const response = await makeRequest(app, {
      path: `/api/players/605141/valuation?budget=260&teams=12&drafted=${drafted}&rosterSlots=${rosterSlots}`,
    });

    expect(response.status).toBe(200);
    expect(response.payload.playerId).toBe(605141);
    expect(typeof response.payload.value).toBe("number");
  });

  it("returns 404 for legacy valuation when player already drafted", async () => {
    mockFind(seedPlayers);
    const drafted = encodeURIComponent(JSON.stringify([{ playerId: 605141, price: 40 }]));

    const app = createApp();
    const response = await makeRequest(app, {
      path: `/api/players/605141/valuation?budget=260&teams=12&drafted=${drafted}`,
    });

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({ error: "Player not found or already drafted" });
  });

  it("returns 400 for malformed legacy valuation query", async () => {
    const app = createApp();
    const response = await makeRequest(app, {
      path: "/api/players/605141/valuation?budget=260&teams=bad",
    });

    expect(response.status).toBe(400);
    expect(response.payload.error).toContain("teams query param");
  });

  it("returns 400 for invalid JSON in legacy drafted query", async () => {
    const app = createApp();
    const response = await makeRequest(app, {
      path: "/api/players/605141/valuation?budget=260&teams=12&drafted=%7Bnot-json",
    });

    expect(response.status).toBe(400);
    expect(response.payload.error).toContain("drafted");
  });

  it("returns 400 for invalid JSON in legacy rosterSlots query", async () => {
    const app = createApp();
    const response = await makeRequest(app, {
      path: "/api/players/605141/valuation?budget=260&teams=12&rosterSlots=%7Bnot-json",
    });

    expect(response.status).toBe(400);
    expect(response.payload.error).toContain("rosterSlots");
  });

  it("supports POST /api/player/value for valid requests", async () => {
    mockFind(seedPlayers);

    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/player/value",
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [] },
        playerId: 605141,
      },
    });

    expect(response.status).toBe(200);
    expect(response.payload.playerId).toBe(605141);
    expect(typeof response.payload.value).toBe("number");
  });

  it("returns 400 for invalid POST /api/player/value payloads", async () => {
    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/player/value",
      body: {
        leagueSettings: { budget: 260, teams: "12" },
        draftState: { playersDrafted: [] },
        playerId: 605141,
      },
    });

    expect(response.status).toBe(400);
    expect(response.payload.error).toContain("leagueSettings.budget");
  });

  it("returns 404 for POST /api/player/value when player is drafted", async () => {
    mockFind(seedPlayers);

    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/player/value",
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [{ playerId: 605141, price: 40 }] },
        playerId: 605141,
      },
    });

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({ error: "Player not found or already drafted" });
  });

  it("supports POST /api/players/value and /api/players/value/all route contracts", async () => {
    mockFind(seedPlayers);
    const app = createApp();

    const multiple = await makeRequest(app, {
      method: "POST",
      path: "/api/players/value",
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [] },
        playerIds: [605141, 621566],
      },
    });
    expect(multiple.status).toBe(200);
    expect(Array.isArray(multiple.payload.values)).toBe(true);
    expect(multiple.payload.values).toHaveLength(2);

    const all = await makeRequest(app, {
      method: "POST",
      path: "/api/players/value/all",
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [] },
      },
    });
    expect(all.status).toBe(200);
    expect(Array.isArray(all.payload.values)).toBe(true);
    expect(all.payload.values).toHaveLength(seedPlayers.length);
  });

  it("supports POST /api/players/sync/mlb route contract", async () => {
    vi.spyOn(mlbCatalogSyncService, "syncCatalogFromMlbApi").mockResolvedValue({
      rosterType: "40Man",
      seasonsSynced: [2025, 2024, 2023],
      teamsSynced: 30,
      playersSynced: 1200,
      transactionsAnalyzed: 450,
      replacedCatalog: false,
      fetchedAt: "2026-05-07T18:00:00.000Z",
    });

    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/players/sync/mlb",
      body: {
        rosterType: "40Man",
        seasonsBack: 3,
        lookbackDays: 30,
      },
    });

    expect(response.status).toBe(200);
    expect(response.payload.ok).toBe(true);
    expect(response.payload.playersSynced).toBe(1200);
  });

  it("returns 400 for invalid sync payload on POST /api/players/sync/mlb", async () => {
    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/players/sync/mlb",
      body: {
        rosterType: "unknown",
      },
    });

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({
      error: "rosterType must be one of: active, 40Man, depthChart, fullSeason",
    });
  });

  it("returns equivalent values for legacy GET valuation and new POST valuation", async () => {
    mockFind(seedPlayers);
    const drafted = encodeURIComponent(JSON.stringify([{ playerId: 592450, price: 55 }]));
    const rosterSlots = encodeURIComponent(
      JSON.stringify([
        { position: "C", count: 2 },
        { position: "1B", count: 2 },
        { position: "2B", count: 2 },
        { position: "SS", count: 2 },
        { position: "SP", count: 5 },
        { position: "RP", count: 4 },
      ]),
    );
    const app = createApp();

    const legacy = await makeRequest(app, {
      path: `/api/players/605141/valuation?budget=260&teams=12&drafted=${drafted}&rosterSlots=${rosterSlots}`,
    });
    expect(legacy.status).toBe(200);

    const current = await makeRequest(app, {
      method: "POST",
      path: "/api/player/value",
      body: {
        leagueSettings: {
          budget: 260,
          teams: 12,
          rosterSpots: { hitters: 8, pitchers: 9 },
        },
        draftState: { playersDrafted: [{ playerId: 592450, price: 55 }] },
        playerId: 605141,
      },
    });
    expect(current.status).toBe(200);

    expect(current.payload.playerId).toBe(legacy.payload.playerId);
    expect(current.payload.value).toBeCloseTo(legacy.payload.value, 6);
  });

  it("creates a custom player via POST /api/players", async () => {
    mockFindOne(null);

    const createdAt = new Date("2026-05-03T12:00:00.000Z");
    Player.create = vi.fn().mockResolvedValue({
      playerId: 990001,
      name: "Test Custom",
      mlbTeamId: 111,
      team: "BOS",
      league: "AL",
      position: ["OF"],
      status: "active",
      injuryStatus: "",
      age: 28,
      depthRank: 1,
      stats: { BA: 0.285, HR: 20, RBI: 70, SB: 8 },
      statsHistory: [],
      fetchedAt: createdAt,
    });

    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/players",
      body: {
        playerId: 990001,
        name: "Test Custom",
        mlbTeamId: 111,
        team: "BOS",
        league: "AL",
        position: ["OF"],
        stats: { BA: 0.285, HR: 20, RBI: 70, SB: 8 },
        status: "active",
        age: 28,
      },
    });

    expect(response.status).toBe(201);
    expect(response.payload.playerId).toBe(990001);
    expect(response.payload.name).toBe("Test Custom");
    expect(response.payload.position).toEqual(["OF"]);
    expect(typeof response.payload.fetchedAt).toBe("string");
    expect(Player.create).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when creating a duplicate custom player", async () => {
    mockFindOne({ playerId: 990001 });

    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/players",
      body: {
        playerId: 990001,
        name: "Test Custom",
        team: "BOS",
        league: "AL",
        position: ["OF"],
        stats: { BA: 0.285, HR: 20, RBI: 70, SB: 8 },
      },
    });

    expect(response.status).toBe(409);
    expect(response.payload).toEqual({ error: "Player already exists" });
  });

  it("supports create+read lifecycle for custom players", async () => {
    let storedPlayer = null;
    const fetchedAt = new Date("2026-05-03T13:00:00.000Z");

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

    const app = createApp();
    const createResponse = await makeRequest(app, {
      method: "POST",
      path: "/api/players",
      body: {
        playerId: 991234,
        name: "Lifecycle Player",
        team: "nyy",
        league: "AL",
        position: ["sp"],
        stats: { ERA: 3.1, W: 12, SV: 0, K: 190, IP: 175 },
      },
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.payload.playerId).toBe(991234);
    expect(createResponse.payload.team).toBe("NYY");
    expect(createResponse.payload.position).toEqual(["SP"]);

    const getResponse = await makeRequest(app, {
      path: "/api/players/991234",
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.payload.playerId).toBe(991234);
    expect(getResponse.payload.team).toBe("NYY");
    expect(getResponse.payload.position).toEqual(["SP"]);
  });

  it("normalizes LF, CF, and RF custom player positions to OF", async () => {
    let storedPlayer = null;
    const fetchedAt = new Date("2026-05-14T14:00:00.000Z");

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

    const app = createApp();
    const response = await makeRequest(app, {
      method: "POST",
      path: "/api/players",
      body: {
        playerId: 991235,
        name: "Outfield Player",
        team: "LAD",
        league: "NL",
        position: ["lf", "CF", "RF", "OF"],
        stats: { BA: 0.281, HR: 18, RBI: 74, SB: 11 },
      },
    });

    expect(response.status).toBe(201);
    expect(response.payload.position).toEqual(["OF"]);
    expect(Player.create).toHaveBeenCalledWith(expect.objectContaining({
      position: ["OF"],
    }));
  });
});
