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

  it("accepts well-formed valuation payload", () => {
    const error = validateValuationBody({
      leagueSettings: { budget: 260, teams: 12 },
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
