const Player = require("../models/player.model");
const seedPlayers = require("../data/seedPlayers");

function hasUsableStatsHistory(statsHistory) {
  return (
    Array.isArray(statsHistory) &&
    statsHistory.length > 0 &&
    statsHistory.every(
      (row) =>
        row &&
        Number.isInteger(Number(row.season)) &&
        row.stats &&
        typeof row.stats === "object",
    )
  );
}

function buildDefaultStatsHistory(stats) {
  const now = new Date();
  const latestSeason = now.getFullYear() - 1;
  const safeStats = stats && typeof stats === "object" ? stats : {};

  return [0, 1, 2].map((offset) => ({
    season: latestSeason - offset,
    stats: { ...safeStats },
  }));
}

async function seedPlayersCatalog() {
  await Player.deleteMany({ playerId: { $type: "string" } });

  const operations = seedPlayers.map((player) => ({
    updateOne: {
      filter: { playerId: player.playerId },
      update: {
        $set: {
          name: player.name,
          mlbTeamId: player.mlbTeamId,
          team: player.team,
          league: player.league,
          position: player.position,
          isPitcher: player.isPitcher,
          age: Number.isFinite(player.age) ? player.age : undefined,
          depthRank: Number.isInteger(player.depthRank) && player.depthRank > 0 ? player.depthRank : 1,
          status: player.status || "active",
          injuryStatus: player.injuryStatus || "",
          stats: player.stats,
          statsHistory: hasUsableStatsHistory(player.statsHistory)
            ? player.statsHistory.map((row) => ({
                season: Number(row.season),
                stats: { ...row.stats },
              }))
            : buildDefaultStatsHistory(player.stats),
          fetchedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    await Player.bulkWrite(operations);
  }
}

module.exports = { seedPlayersCatalog };
