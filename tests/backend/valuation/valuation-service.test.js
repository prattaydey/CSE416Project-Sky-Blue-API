const seedPlayers = require("../../../src/data/seedPlayers");
const { calculatePlayerValues } = require("../../../src/services/valuationService");

describe("valuation functions", () => {
  it("returns one valuation per undrafted player", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      { budget: 260, teams: 12 },
      { playersDrafted: [{ playerId: 605141, price: 40 }] },
    );

    expect(result).toHaveLength(seedPlayers.length - 1);
    expect(result.some((p) => p.playerId === 605141)).toBe(false);
  });

  it("handles empty rosters", () => {
    const result = calculatePlayerValues([], { budget: 260, teams: 12 }, { playersDrafted: [] });
    expect(result).toEqual([]);
  });

  it("returns deterministic top value for known draft input", () => {
    const result = calculatePlayerValues(seedPlayers, { budget: 260, teams: 12 }, { playersDrafted: [] });
    const top = [...result].sort((a, b) => b.value - a.value)[0];

    expect(top.playerId).toBe(660271);
    expect(top.value).toBeGreaterThan(200);
  });

  it("supports duplicate drafted actions without crashing", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      { budget: 260, teams: 12 },
      {
        playersDrafted: [
          { playerId: 605141, price: 41 },
          { playerId: 605141, price: 41 },
        ],
      },
    );

    expect(result.some((p) => p.playerId === 605141)).toBe(false);
  });

  it("coerces string drafted IDs and excludes them", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      { budget: 260, teams: 12 },
      { playersDrafted: [{ playerId: "592450", price: 50 }] },
    );

    expect(result.some((p) => p.playerId === 592450)).toBe(false);
  });

  it("returns zero values when draft budget is overspent", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      { budget: 260, teams: 12 },
      { playersDrafted: [{ playerId: 592450, price: 10000 }] },
    );

    expect(result.every((p) => p.value === 0)).toBe(true);
  });

  it("handles missing player stats fields", () => {
    const partialPlayers = [
      ...seedPlayers.slice(0, 3),
      {
        playerId: 999001,
        name: "Missing Stats Hitter",
        isPitcher: false,
        stats: {},
      },
      {
        playerId: 999002,
        name: "Missing Stats Pitcher",
        isPitcher: true,
        stats: { ERA: 0 },
      },
    ];

    const result = calculatePlayerValues(partialPlayers, { budget: 260, teams: 12 }, { playersDrafted: [] });
    expect(result).toHaveLength(partialPlayers.length);
    expect(result.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it("handles unusual or extreme statistical inputs", () => {
    const extremePlayers = [
      ...seedPlayers.slice(0, 6),
      {
        playerId: 999101,
        name: "Extreme Hitter",
        isPitcher: false,
        stats: { BA: 0.9, HR: 200, RBI: 300, SB: 200 },
      },
      {
        playerId: 999102,
        name: "Extreme Pitcher",
        isPitcher: true,
        stats: { ERA: 0.1, W: 35, SV: 60, K: 450 },
      },
    ];

    const result = calculatePlayerValues(extremePlayers, { budget: 260, teams: 12 }, { playersDrafted: [] });
    expect(result.every((p) => Number.isFinite(p.value))).toBe(true);
    expect(result.find((p) => p.playerId === 999101).value).toBeGreaterThan(0);
    expect(result.find((p) => p.playerId === 999102).value).toBeGreaterThan(0);
  });
});
