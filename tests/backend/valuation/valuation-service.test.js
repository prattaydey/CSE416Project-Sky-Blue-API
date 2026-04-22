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

  it("applies replacement-level cutoffs when roster spots are constrained", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      {
        budget: 260,
        teams: 1,
        rosterSpots: { hitters: 1, pitchers: 1 },
        minPlayerCost: 0,
      },
      { playersDrafted: [] },
    );

    const positiveValues = result.filter((p) => p.value > 0);
    expect(positiveValues).toHaveLength(2);
  });

  it("respects configured hitter/pitcher budget split", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      {
        budget: 260,
        teams: 1,
        rosterSpots: { hitters: 5, pitchers: 5 },
        budgetSplit: { hitters: 1, pitchers: 0 },
        minPlayerCost: 0,
      },
      { playersDrafted: [] },
    );

    const playersById = new Map(seedPlayers.map((p) => [p.playerId, p]));
    const hitterValueTotal = result.reduce((sum, valueRow) => {
      const player = playersById.get(valueRow.playerId);
      return !player?.isPitcher ? sum + valueRow.value : sum;
    }, 0);
    const pitcherValueTotal = result.reduce((sum, valueRow) => {
      const player = playersById.get(valueRow.playerId);
      return player?.isPitcher ? sum + valueRow.value : sum;
    }, 0);

    expect(hitterValueTotal).toBeGreaterThan(0);
    expect(pitcherValueTotal).toBe(0);
  });

  it("weights batting average impact by volume (AB/PA)", () => {
    const players = [
      {
        playerId: 1001,
        name: "High Volume Bat",
        isPitcher: false,
        stats: { BA: 0.32, AB: 650, HR: 20, RBI: 70, SB: 10 },
      },
      {
        playerId: 1002,
        name: "Low Volume Bat",
        isPitcher: false,
        stats: { BA: 0.34, AB: 100, HR: 20, RBI: 70, SB: 10 },
      },
      {
        playerId: 1003,
        name: "Baseline Bat",
        isPitcher: false,
        stats: { BA: 0.28, AB: 650, HR: 20, RBI: 70, SB: 10 },
      },
      {
        playerId: 2001,
        name: "Neutral Pitcher",
        isPitcher: true,
        stats: { ERA: 3.5, W: 10, SV: 0, K: 160, IP: 180 },
      },
    ];

    const result = calculatePlayerValues(
      players,
      {
        budget: 100,
        teams: 1,
        rosterSpots: { hitters: 3, pitchers: 1 },
        budgetSplit: { hitters: 1, pitchers: 0 },
        minPlayerCost: 0,
      },
      { playersDrafted: [] },
    );

    const highVolume = result.find((p) => p.playerId === 1001);
    const lowVolume = result.find((p) => p.playerId === 1002);
    expect(highVolume.value).toBeGreaterThan(lowVolume.value);
  });

  it("weights ERA impact by innings pitched", () => {
    const players = [
      {
        playerId: 3001,
        name: "High Volume SP",
        isPitcher: true,
        stats: { ERA: 2.6, W: 12, SV: 0, K: 220, IP: 210.0 },
      },
      {
        playerId: 3002,
        name: "Low Volume RP",
        isPitcher: true,
        stats: { ERA: 1.8, W: 12, SV: 0, K: 220, IP: 40.0 },
      },
      {
        playerId: 3003,
        name: "Baseline Pitcher",
        isPitcher: true,
        stats: { ERA: 4.2, W: 12, SV: 0, K: 220, IP: 200.0 },
      },
      {
        playerId: 4001,
        name: "Neutral Hitter",
        isPitcher: false,
        stats: { BA: 0.28, AB: 550, HR: 20, RBI: 70, SB: 10 },
      },
    ];

    const result = calculatePlayerValues(
      players,
      {
        budget: 100,
        teams: 1,
        rosterSpots: { hitters: 1, pitchers: 3 },
        budgetSplit: { hitters: 0, pitchers: 1 },
        minPlayerCost: 0,
      },
      { playersDrafted: [] },
    );

    const highVolume = result.find((p) => p.playerId === 3001);
    const lowVolume = result.find((p) => p.playerId === 3002);
    expect(highVolume.value).toBeGreaterThan(lowVolume.value);
  });

  it("supports points-based scoring mode", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      {
        budget: 260,
        teams: 2,
        scoringSystem: "points",
        rosterSpots: { hitters: 6, pitchers: 4 },
        pointsConfig: {
          hitters: { HR: 4, RBI: 1, SB: 2 },
          pitchers: { K: 1, W: 5, ERA: 2 },
        },
      },
      { playersDrafted: [] },
    );

    expect(result).toHaveLength(seedPlayers.length);
    expect(result.every((row) => Number.isFinite(row.value))).toBe(true);
  });

  it("uses teamStates budgetRemaining when provided", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      {
        budget: 260,
        teams: 2,
        rosterSpots: { hitters: 5, pitchers: 5 },
      },
      {
        playersDrafted: [],
        teamStates: [
          { teamId: "A", budgetRemaining: 0, rosterFilled: { hitters: 0, pitchers: 0 } },
          { teamId: "B", budgetRemaining: 0, rosterFilled: { hitters: 0, pitchers: 0 } },
        ],
      },
    );

    expect(result.every((row) => row.value === 0)).toBe(true);
  });

  it("applies teamStates rosterFilled to replacement-level slots", () => {
    const result = calculatePlayerValues(
      seedPlayers,
      {
        budget: 260,
        teams: 1,
        rosterSpots: { hitters: 2, pitchers: 1 },
        minPlayerCost: 0,
      },
      {
        playersDrafted: [],
        teamStates: [
          {
            teamId: "A",
            budgetRemaining: 260,
            rosterFilled: { hitters: 2, pitchers: 1 },
          },
        ],
      },
    );

    expect(result.every((row) => row.value === 0)).toBe(true);
  });

  it("penalizes injured/depth players compared to healthy starters", () => {
    const players = [
      {
        playerId: 9001,
        name: "Healthy Starter",
        isPitcher: false,
        age: 29,
        depthRank: 1,
        status: "active",
        stats: { BA: 0.3, AB: 600, HR: 25, RBI: 90, SB: 10 },
      },
      {
        playerId: 9002,
        name: "Injured Bench",
        isPitcher: false,
        age: 37,
        depthRank: 3,
        status: "injured",
        stats: { BA: 0.3, AB: 600, HR: 25, RBI: 90, SB: 10 },
      },
      {
        playerId: 9101,
        name: "Neutral Pitcher",
        isPitcher: true,
        stats: { ERA: 3.5, W: 10, SV: 0, K: 180, IP: 180 },
      },
    ];

    const result = calculatePlayerValues(
      players,
      {
        budget: 120,
        teams: 1,
        rosterSpots: { hitters: 1, pitchers: 1 },
        minPlayerCost: 0,
      },
      { playersDrafted: [] },
    );

    const healthy = result.find((row) => row.playerId === 9001);
    const injured = result.find((row) => row.playerId === 9002);
    expect(healthy.value).toBeGreaterThan(injured.value);
  });
});
