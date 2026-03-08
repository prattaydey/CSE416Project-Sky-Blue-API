const Player = require("../models/player.model");

function mapPlayerRow(player) {
  const primaryPosition = Array.isArray(player.position) ? player.position[0] : "";
  const isPitcher = Boolean(player.isPitcher) || primaryPosition === "SP" || primaryPosition === "RP";

  return {
    id: player.playerId,
    name: player.name,
    position: primaryPosition,
    team: player.team,
    league: player.league || "",
    avg: isPitcher ? player.stats?.ERA : player.stats?.BA,
    hr: isPitcher ? player.stats?.W : player.stats?.HR,
    rbi: isPitcher ? player.stats?.SV : player.stats?.RBI,
    sb: isPitcher ? player.stats?.K : player.stats?.SB,
    isPitcher,
  };
}

function mapPlayerDetails(player) {
  return {
    playerId: player.playerId,
    name: player.name,
    team: player.team,
    league: player.league || "",
    position: player.position,
    stats: player.stats,
    fetchedAt: new Date(player.fetchedAt).toISOString(),
  };
}

async function getPlayers(_req, res, next) {
  try {
    const players = await Player.find({ league: { $exists: true, $ne: "" } })
      .sort({ name: 1 })
      .lean();
    return res.json(players.map(mapPlayerRow));
  } catch (error) {
    return next(error);
  }
}

async function getPlayerById(req, res, next) {
  try {
    const { playerId } = req.params;
    const cachedPlayer = await Player.findOne({ playerId }).lean();

    if (cachedPlayer) {
      return res.json(mapPlayerDetails(cachedPlayer));
    }

    return res.status(404).json({ error: "Player not found" });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getPlayers,
  getPlayerById,
};
