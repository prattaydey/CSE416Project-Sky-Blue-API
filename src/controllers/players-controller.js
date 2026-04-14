const Player = require("../models/player.model");
const { calculatePlayerValues } = require("../services/valuationService");

function mapPlayerRow(player) {
  const primaryPosition = Array.isArray(player.position) ? player.position[0] : "";
  const isPitcher = Boolean(player.isPitcher) || primaryPosition === "SP" || primaryPosition === "RP";

  return {
    id: player.playerId,
    name: player.name,
    position: primaryPosition,
    team: player.team,
    mlbTeamId: player.mlbTeamId,
    league: player.league || "",
    status: player.status || "active",
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
    mlbTeamId: player.mlbTeamId,
    team: player.team,
    league: player.league || "",
    position: player.position,
    status: player.status || "active",
    injuryStatus: player.injuryStatus || "",
    stats: player.stats,
    fetchedAt: new Date(player.fetchedAt).toISOString(),
  };
}

async function getPlayers(req, res, next) {
  try {
    const { league } = req.query;

    const filter = {};
    if (league && league !== "MLB") {
      const upper = league.toUpperCase();
      if (upper !== "AL" && upper !== "NL") {
        return res.status(400).json({ error: "Invalid league filter. Use AL, NL, or MLB." });
      }
      filter.league = upper;
    } else {
      filter.league = { $in: ["AL", "NL"] };
    }

    const players = await Player.find(filter).sort({ name: 1 }).lean();
    return res.json(players.map(mapPlayerRow));
  } catch (error) {
    return next(error);
  }
}

async function getPlayerById(req, res, next) {
  try {
    const rawId = req.params.playerId;
    const playerId = Number(rawId);

    if (Number.isNaN(playerId)) {
      return res.status(400).json({ error: "playerId must be a number (MLB integer ID)" });
    }

    const cachedPlayer = await Player.findOne({ playerId }).lean();
    if (cachedPlayer) {
      return res.json(mapPlayerDetails(cachedPlayer));
    }

    return res.status(404).json({ error: "Player not found" });
  } catch (error) {
    return next(error);
  }
}

function validateValuationBody(body) {
  if (!body || typeof body !== "object") {
    return "Request body is required";
  }

  const { leagueSettings, draftState } = body;
  if (
    !leagueSettings ||
    !Number.isFinite(leagueSettings.budget) ||
    !Number.isFinite(leagueSettings.teams)
  ) {
    return "leagueSettings.budget (number) and leagueSettings.teams (number) are required";
  }
  if (leagueSettings.budget <= 0 || leagueSettings.teams <= 0) {
    return "leagueSettings.budget and leagueSettings.teams must be positive";
  }
  if (!Number.isInteger(leagueSettings.teams)) {
    return "leagueSettings.teams must be an integer";
  }
  if (draftState && draftState.playersDrafted && !Array.isArray(draftState.playersDrafted)) {
    return "draftState.playersDrafted must be an array";
  }
  if (Array.isArray(draftState?.playersDrafted)) {
    for (const drafted of draftState.playersDrafted) {
      if (
        !drafted ||
        typeof drafted !== "object" ||
        !Number.isFinite(drafted.playerId) ||
        !Number.isFinite(drafted.price)
      ) {
        return "Each drafted player must include numeric playerId and price";
      }
      if (!Number.isInteger(drafted.playerId)) {
        return "Each drafted playerId must be an integer";
      }
      if (drafted.price < 0) {
        return "Each drafted price must be non-negative";
      }
    }
  }
  return null;
}

async function valuateSinglePlayer(req, res, next) {
  try {
    const validationError = validateValuationBody(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { leagueSettings, draftState, playerId } = req.body;
    if (!Number.isFinite(playerId) || !Number.isInteger(playerId)) {
      return res.status(400).json({ error: "playerId (number) is required" });
    }

    const allPlayers = await Player.find({ league: { $in: ["AL", "NL"] } }).lean();
    const values = calculatePlayerValues(allPlayers, leagueSettings, draftState || { playersDrafted: [] });

    const playerValue = values.find((v) => v.playerId === playerId);
    if (!playerValue) {
      return res.status(404).json({ error: "Player not found or already drafted" });
    }

    return res.json(playerValue);
  } catch (error) {
    return next(error);
  }
}

async function valuateMultiplePlayers(req, res, next) {
  try {
    const validationError = validateValuationBody(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { leagueSettings, draftState, playerIds } = req.body;
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ error: "playerIds (non-empty array of numbers) is required" });
    }
    const hasInvalidPlayerId = playerIds.some((id) => !Number.isFinite(id) || !Number.isInteger(id));
    if (hasInvalidPlayerId) {
      return res.status(400).json({ error: "playerIds must be an array of integer IDs" });
    }

    const allPlayers = await Player.find({ league: { $in: ["AL", "NL"] } }).lean();
    const values = calculatePlayerValues(allPlayers, leagueSettings, draftState || { playersDrafted: [] });

    const requestedSet = new Set(playerIds);
    const filtered = values.filter((v) => requestedSet.has(v.playerId));

    return res.json({ values: filtered });
  } catch (error) {
    return next(error);
  }
}

async function valuateAllPlayers(req, res, next) {
  try {
    const validationError = validateValuationBody(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { leagueSettings, draftState } = req.body;

    const allPlayers = await Player.find({ league: { $in: ["AL", "NL"] } }).lean();
    const values = calculatePlayerValues(allPlayers, leagueSettings, draftState || { playersDrafted: [] });

    return res.json({ values });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getPlayers,
  getPlayerById,
  valuateSinglePlayer,
  valuateMultiplePlayers,
  valuateAllPlayers,
  validateValuationBody,
};
