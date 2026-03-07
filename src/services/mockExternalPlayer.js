const { externalApiKey } = require("../config/env");

function numberFromId(playerId) {
  // Convert a player ID into a stable numeric value for deterministic mock data.
  return playerId
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

async function fetchMockExternalPlayer(playerId) {
  if (!externalApiKey) {
    throw new Error("Missing EXTERNAL_API_KEY");
  }

  // Seed drives repeatable mock values so the same playerId always returns the same player.
  const seed = numberFromId(String(playerId));
  const firstNames = ["Alex", "Jordan", "Taylor", "Sam", "Chris"];
  const lastNames = ["Carter", "Miller", "Lopez", "Nguyen", "Davis"];
  const teams = ["NYY", "BOS", "LAD", "HOU", "ATL"];
  const positions = [["OF"], ["1B"], ["2B"], ["SS"], ["3B"], ["SP"], ["RP"]];

  const firstName = firstNames[seed % firstNames.length];
  const lastName = lastNames[(seed + 2) % lastNames.length];

  return {
    playerId: String(playerId),
    name: `${firstName} ${lastName}`,
    team: teams[seed % teams.length],
    position: positions[seed % positions.length],
    stats: {
      HR: 10 + (seed % 35),
      RBI: 30 + (seed % 90),
      SB: seed % 25,
      BA: Number((0.2 + (seed % 110) / 1000).toFixed(3)),
    },
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchMockExternalPlayer,
};
