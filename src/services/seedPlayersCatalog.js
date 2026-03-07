const Player = require("../models/player.model");
const seedPlayers = require("../data/seedPlayers");

async function seedPlayersCatalog() {
  const operations = seedPlayers.map((player) => ({
    updateOne: {
      filter: { playerId: player.playerId },
      update: {
        $set: {
          name: player.name,
          team: player.team,
          league: player.league,
          position: player.position,
          isPitcher: player.isPitcher,
          stats: player.stats,
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

module.exports = {
  seedPlayersCatalog,
};
