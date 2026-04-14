const axios = require("axios");
const {
  fetchAllTeams,
  fetchActiveRoster,
  fetchPlayer,
  fetchPlayerSeasonStats,
  fetchTransactions,
} = require("../../../src/services/mlbStatsApi");

describe("services: mlbStatsApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps team data from MLB API shape", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        teams: [
          {
            id: 147,
            name: "New York Yankees",
            abbreviation: "NYY",
            league: { name: "American League" },
            division: { name: "American East" },
            locationName: "New York",
          },
        ],
      },
    });

    const teams = await fetchAllTeams();

    expect(teams).toEqual([
      {
        mlbTeamId: 147,
        name: "New York Yankees",
        abbreviation: "NYY",
        league: "AL",
        division: "East",
        city: "New York",
      },
    ]);
  });

  it("returns empty array for empty active roster response", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { roster: [] } });
    const roster = await fetchActiveRoster(147);
    expect(roster).toEqual([]);
  });

  it("returns null when player API response has no people", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { people: [] } });
    const player = await fetchPlayer(605141);
    expect(player).toBeNull();
  });

  it("maps season stats into group-keyed object", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: {
        stats: [
          {
            group: { displayName: "hitting" },
            splits: [{ stat: { avg: ".300", homeRuns: "30" } }],
          },
          {
            group: { displayName: "pitching" },
            splits: [{ stat: { era: "3.00", strikeOuts: "180" } }],
          },
        ],
      },
    });

    const stats = await fetchPlayerSeasonStats(605141, 2025);
    expect(stats).toEqual({
      hitting: { avg: ".300", homeRuns: "30" },
      pitching: { era: "3.00", strikeOuts: "180" },
    });
  });

  it("returns empty transactions when MLB API responds empty", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { transactions: [] } });
    const transactions = await fetchTransactions("2026-01-10");
    expect(transactions).toEqual([]);
  });
});
