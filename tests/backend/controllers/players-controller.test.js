const seedPlayers = require("../../../src/data/seedPlayers");
const Player = require("../../../src/models/player.model");
const {
  getPlayers,
  getPlayerById,
  valuateSinglePlayer,
  valuateMultiplePlayers,
  valuateAllPlayers,
} = require("../../../src/controllers/players-controller");
const { createMockReq, createMockRes } = require("../helpers/httpMocks");
const originalFind = Player.find;
const originalFindOne = Player.findOne;

function mockFind(data) {
  const lean = vi.fn().mockResolvedValue(data);
  const sort = vi.fn().mockReturnValue({ lean });
  Player.find = vi.fn().mockReturnValue({ sort, lean });
  return { sort, lean };
}

function mockFindOne(data) {
  const lean = vi.fn().mockResolvedValue(data);
  Player.findOne = vi.fn().mockReturnValue({ lean });
  return { lean };
}

describe("controllers: players", () => {
  afterEach(() => {
    Player.find = originalFind;
    Player.findOne = originalFindOne;
    vi.restoreAllMocks();
  });

  it("returns 400 for invalid league filter", async () => {
    const req = createMockReq({ query: { league: "BAD" } });
    const res = createMockRes();
    const next = vi.fn();

    await getPlayers(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "Invalid league filter. Use AL, NL, or MLB." });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns empty array for empty player catalog response", async () => {
    mockFind([]);
    const req = createMockReq({ query: {} });
    const res = createMockRes();
    const next = vi.fn();

    await getPlayers(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual([]);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid player ID on getPlayerById", async () => {
    const req = createMockReq({ params: { playerId: "not-a-number" } });
    const res = createMockRes();
    const next = vi.fn();

    await getPlayerById(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "playerId must be a number (MLB integer ID)" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when player is missing by ID", async () => {
    mockFindOne(null);
    const req = createMockReq({ params: { playerId: "605141" } });
    const res = createMockRes();
    const next = vi.fn();

    await getPlayerById(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ error: "Player not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects malformed valuation requests", async () => {
    const req = createMockReq({
      body: { leagueSettings: { budget: 260, teams: "12" }, playerId: 605141 },
    });
    const res = createMockRes();
    const next = vi.fn();

    await valuateSinglePlayer(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toContain("leagueSettings.budget");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 200 and a single valuation for valid single-player request", async () => {
    mockFind(seedPlayers);
    const req = createMockReq({
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [] },
        playerId: 605141,
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    await valuateSinglePlayer(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.payload.playerId).toBe(605141);
    expect(typeof res.payload.value).toBe("number");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when single-player valuation target is drafted", async () => {
    mockFind(seedPlayers);
    const req = createMockReq({
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [{ playerId: 605141, price: 40 }] },
        playerId: 605141,
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    await valuateSinglePlayer(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ error: "Player not found or already drafted" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when multiple valuation request has invalid playerIds", async () => {
    const req = createMockReq({
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [] },
        playerIds: [605141, "621566"],
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    await valuateMultiplePlayers(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "playerIds must be an array of integer IDs" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns valuations for all available players", async () => {
    mockFind(seedPlayers);
    const req = createMockReq({
      body: {
        leagueSettings: { budget: 260, teams: 12 },
        draftState: { playersDrafted: [] },
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    await valuateAllPlayers(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.payload.values)).toBe(true);
    expect(res.payload.values).toHaveLength(seedPlayers.length);
    expect(next).not.toHaveBeenCalled();
  });
});
