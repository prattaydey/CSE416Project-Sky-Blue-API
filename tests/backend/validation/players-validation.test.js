const { validateValuationBody } = require("../../../src/controllers/players-controller");

describe("validation logic: valuation requests", () => {
  it("rejects missing request body", () => {
    const error = validateValuationBody(null);
    expect(error).toContain("Request body is required");
  });

  it("rejects incomplete league settings", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260 },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("leagueSettings.budget");
  });

  it("rejects non-finite league settings", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: Number.NaN, teams: 12 },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("leagueSettings.budget");
  });

  it("rejects non-integer team count", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12.5 },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("teams must be an integer");
  });

  it("rejects invalid budget split settings", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12, budgetSplit: { hitters: 0, pitchers: 0 } },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("budgetSplit");
  });

  it("rejects invalid roster spots settings", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12, rosterSpots: { hitters: 14, pitchers: 0 } },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("rosterSpots.pitchers");
  });

  it("rejects negative minPlayerCost", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12, minPlayerCost: -1 },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("minPlayerCost");
  });

  it("rejects malformed drafted player entries", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12 },
      draftState: { playersDrafted: [{ playerId: "bad-id", price: 5 }] },
    });

    expect(error).toContain("numeric playerId and price");
  });

  it("rejects negative drafted prices", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12 },
      draftState: { playersDrafted: [{ playerId: 605141, price: -1 }] },
    });

    expect(error).toContain("must be non-negative");
  });

  it("rejects unsupported scoring system", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12, scoringSystem: "elo" },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("scoringSystem");
  });

  it("rejects unsupported category names", () => {
    const error = validateValuationBody({
      leagueSettings: {
        budget: 260,
        teams: 12,
        scoringSystem: "roto",
        categories: {
          hitters: ["BA", "OPS"],
          pitchers: ["ERA", "K"],
        },
      },
      draftState: { playersDrafted: [] },
    });

    expect(error).toContain("unsupported category");
  });

  it("rejects malformed team state entries", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12 },
      draftState: {
        playersDrafted: [],
        teamStates: [{ teamId: "t1", budgetRemaining: -5 }],
      },
    });

    expect(error).toContain("budgetRemaining");
  });

  it("accepts extended league and team state settings", () => {
    const error = validateValuationBody({
      leagueSettings: {
        budget: 260,
        teams: 12,
        scoringSystem: "points",
        budgetSplit: { hitters: 0.6, pitchers: 0.4 },
        rosterSpots: { hitters: 14, pitchers: 9 },
        pointsConfig: {
          hitters: { HR: 4, RBI: 1 },
          pitchers: { K: 1, W: 5, ERA: 2 },
        },
      },
      draftState: {
        playersDrafted: [{ playerId: 605141, price: 41 }],
        teamStates: [
          {
            teamId: "A",
            budgetRemaining: 180,
            rosterFilled: { hitters: 6, pitchers: 4 },
            draftedPlayerIds: [605141],
          },
        ],
      },
    });

    expect(error).toBeNull();
  });

  it("accepts well-formed valuation payload", () => {
    const error = validateValuationBody({
      leagueSettings: {
        budget: 260,
        teams: 12,
        budgetSplit: { hitters: 0.67, pitchers: 0.33 },
        rosterSpots: { hitters: 14, pitchers: 9 },
        minPlayerCost: 1,
      },
      draftState: {
        playersDrafted: [
          { playerId: 605141, price: 41 },
          { playerId: 592450, price: 55 },
        ],
      },
    });

    expect(error).toBeNull();
  });
});
