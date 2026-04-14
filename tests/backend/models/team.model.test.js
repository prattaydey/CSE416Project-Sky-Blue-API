const Team = require("../../../src/models/team.model");

describe("models: Team", () => {
  it("accepts a valid team document", () => {
    const doc = new Team({
      mlbTeamId: 147,
      name: "New York Yankees",
      abbreviation: "NYY",
      league: "AL",
      division: "East",
      city: "New York",
    });

    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it("rejects invalid league values", () => {
    const doc = new Team({
      mlbTeamId: 147,
      name: "New York Yankees",
      abbreviation: "NYY",
      league: "MLB",
      division: "East",
      city: "New York",
    });

    const err = doc.validateSync();
    expect(err.errors.league).toBeDefined();
  });

  it("rejects invalid division values", () => {
    const doc = new Team({
      mlbTeamId: 147,
      name: "New York Yankees",
      abbreviation: "NYY",
      league: "AL",
      division: "North",
      city: "New York",
    });

    const err = doc.validateSync();
    expect(err.errors.division).toBeDefined();
  });
});
