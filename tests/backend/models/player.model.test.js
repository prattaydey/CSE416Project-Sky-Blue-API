const Player = require("../../../src/models/player.model");

describe("models: Player", () => {
  it("accepts a valid player document", () => {
    const doc = new Player({
      playerId: 605141,
      name: "Freddie Freeman",
      mlbTeamId: 119,
      team: "LAD",
      league: "NL",
      position: ["1B"],
      isPitcher: false,
      status: "active",
      stats: { BA: 0.31, HR: 29, RBI: 102, SB: 13 },
      fetchedAt: new Date(),
    });

    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it("rejects missing required fields", () => {
    const doc = new Player({
      playerId: 605141,
      team: "LAD",
      stats: { BA: 0.31 },
      fetchedAt: new Date(),
      position: ["1B"],
    });

    const err = doc.validateSync();
    expect(err.errors.name).toBeDefined();
  });

  it("rejects invalid league values", () => {
    const doc = new Player({
      playerId: 605141,
      name: "Freddie Freeman",
      mlbTeamId: 119,
      team: "LAD",
      league: "XX",
      position: ["1B"],
      stats: { BA: 0.31, HR: 29, RBI: 102, SB: 13 },
      fetchedAt: new Date(),
    });

    const err = doc.validateSync();
    expect(err.errors.league).toBeDefined();
  });
});
