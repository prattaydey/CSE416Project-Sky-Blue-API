const Team = require("../../../src/models/team.model");
const { getTeams, getTeamById } = require("../../../src/controllers/teams-controller");
const { createMockReq, createMockRes } = require("../helpers/httpMocks");
const originalFind = Team.find;
const originalFindOne = Team.findOne;

function mockFind(data) {
  const lean = vi.fn().mockResolvedValue(data);
  const sort = vi.fn().mockReturnValue({ lean });
  Team.find = vi.fn().mockReturnValue({ sort });
}

function mockFindOne(data) {
  const lean = vi.fn().mockResolvedValue(data);
  Team.findOne = vi.fn().mockReturnValue({ lean });
}

describe("controllers: teams", () => {
  afterEach(() => {
    Team.find = originalFind;
    Team.findOne = originalFindOne;
    vi.restoreAllMocks();
  });

  it("returns 400 for invalid league filter", async () => {
    const req = createMockReq({ query: { league: "bad" } });
    const res = createMockRes();
    const next = vi.fn();

    await getTeams(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "Invalid league filter. Use AL, NL, or MLB." });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns empty list when no teams exist", async () => {
    mockFind([]);
    const req = createMockReq({ query: {} });
    const res = createMockRes();
    const next = vi.fn();

    await getTeams(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual([]);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid team ID", async () => {
    const req = createMockReq({ params: { teamId: "x1" } });
    const res = createMockRes();
    const next = vi.fn();

    await getTeamById(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "teamId must be a number (MLB integer ID)" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when team does not exist", async () => {
    mockFindOne(null);
    const req = createMockReq({ params: { teamId: "147" } });
    const res = createMockRes();
    const next = vi.fn();

    await getTeamById(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ error: "Team not found" });
    expect(next).not.toHaveBeenCalled();
  });
});
