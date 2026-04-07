const Team = require("../models/team.model");
const seedTeams = require("../data/seedTeams");

async function seedTeamsCatalog() {
  const operations = seedTeams.map((team) => ({
    updateOne: {
      filter: { mlbTeamId: team.mlbTeamId },
      update: {
        $set: {
          name: team.name,
          abbreviation: team.abbreviation,
          league: team.league,
          division: team.division,
          city: team.city,
          updatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    await Team.bulkWrite(operations);
  }
}

module.exports = { seedTeamsCatalog };
