const Player = require("../../../src/models/player.model");
const Team = require("../../../src/models/team.model");
const seedPlayers = require("../../../src/data/seedPlayers");
const seedTeams = require("../../../src/data/seedTeams");
const { seedPlayersCatalog } = require("../../../src/services/seedPlayersCatalog");
const { seedTeamsCatalog } = require("../../../src/services/seedTeamsCatalog");
const originalDeleteMany = Player.deleteMany;
const originalPlayerBulkWrite = Player.bulkWrite;
const originalTeamBulkWrite = Team.bulkWrite;

describe("services: seed catalogs", () => {
  afterEach(() => {
    Player.deleteMany = originalDeleteMany;
    Player.bulkWrite = originalPlayerBulkWrite;
    Team.bulkWrite = originalTeamBulkWrite;
    vi.restoreAllMocks();
  });

  it("upserts player catalog and removes string player IDs", async () => {
    Player.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
    Player.bulkWrite = vi.fn().mockResolvedValue({ ok: 1 });

    await seedPlayersCatalog();

    expect(Player.deleteMany).toHaveBeenCalledWith({ playerId: { $type: "string" } });
    expect(Player.bulkWrite).toHaveBeenCalledTimes(1);

    const operations = Player.bulkWrite.mock.calls[0][0];
    expect(operations).toHaveLength(seedPlayers.length);
    expect(operations[0].updateOne.upsert).toBe(true);
    expect(operations[0].updateOne.filter.playerId).toBe(seedPlayers[0].playerId);
  });

  it("upserts team catalog entries", async () => {
    Team.bulkWrite = vi.fn().mockResolvedValue({ ok: 1 });

    await seedTeamsCatalog();

    expect(Team.bulkWrite).toHaveBeenCalledTimes(1);
    const operations = Team.bulkWrite.mock.calls[0][0];

    expect(operations).toHaveLength(seedTeams.length);
    expect(operations[0].updateOne.upsert).toBe(true);
    expect(operations[0].updateOne.filter.mlbTeamId).toBe(seedTeams[0].mlbTeamId);
  });
});
