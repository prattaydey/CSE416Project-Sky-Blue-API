const Player = require("../models/player.model");
const {
  calculatePlayerValues,
  SUPPORTED_SCORING_SYSTEMS,
  ROTO_ALLOWED_CATEGORIES,
} = require("../services/valuationService");
const mlbCatalogSyncService = require("../services/mlbCatalogSyncService");

function mapPlayerRow(player) {
  const positions = Array.isArray(player.position)
    ? player.position.filter(Boolean)
    : player.position
      ? [player.position]
      : [];
  const primaryPosition = positions[0] || "";
  const isPitcher = Boolean(player.isPitcher) || primaryPosition === "SP" || primaryPosition === "RP";

  return {
    id: player.playerId,
    name: player.name,
    position: positions,
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
    age: Number.isFinite(player.age) ? player.age : null,
    depthRank: Number.isFinite(player.depthRank) ? player.depthRank : null,
    stats: player.stats,
    statsHistory: Array.isArray(player.statsHistory) ? player.statsHistory : [],
    fetchedAt: new Date(player.fetchedAt).toISOString(),
  };
}

const PLAYER_STATUS_VALUES = new Set([
  "active",
  "injured",
  "minors",
  "suspended",
  "restricted",
  "free_agent",
]);

function normalizePositions(positionInput) {
  if (Array.isArray(positionInput)) {
    return positionInput
      .map((position) => String(position || "").trim().toUpperCase())
      .filter(Boolean);
  }

  const single = String(positionInput || "").trim().toUpperCase();
  return single ? [single] : [];
}

function isPitchingPosition(position) {
  const pos = String(position || "").toUpperCase();
  return pos === "P" || pos === "SP" || pos === "RP" || pos === "CL" || pos.includes("P");
}

function parseJsonQueryParam(raw, label) {
  if (raw === undefined || raw === null || raw === "") {
    return { value: undefined, error: null };
  }

  if (typeof raw !== "string") {
    return { value: undefined, error: `${label} must be a JSON-encoded string` };
  }

  try {
    return { value: JSON.parse(raw), error: null };
  } catch (_error) {
    return { value: undefined, error: `${label} must be valid JSON` };
  }
}

function rosterSpotsFromLegacySlots(rosterSlots) {
  if (!Array.isArray(rosterSlots)) {
    return null;
  }

  let hitters = 0;
  let pitchers = 0;

  for (const slot of rosterSlots) {
    const count = Number(slot?.count);
    if (!Number.isFinite(count) || count <= 0) continue;
    const normalizedCount = Math.floor(count);
    if (normalizedCount <= 0) continue;

    if (isPitchingPosition(slot?.position)) pitchers += normalizedCount;
    else hitters += normalizedCount;
  }

  if (hitters <= 0 || pitchers <= 0) {
    return null;
  }

  return { hitters, pitchers };
}

function buildLegacyValuationInput(query) {
  const budget = Number(query.budget);
  const teams = Number(query.teams);

  if (!Number.isFinite(budget) || budget <= 0) {
    return { error: "budget query param must be a positive number" };
  }
  if (!Number.isInteger(teams) || teams <= 0) {
    return { error: "teams query param must be a positive integer" };
  }

  const draftedParsed = parseJsonQueryParam(query.drafted, "drafted");
  if (draftedParsed.error) {
    return { error: draftedParsed.error };
  }

  if (draftedParsed.value !== undefined && !Array.isArray(draftedParsed.value)) {
    return { error: "drafted must decode to an array" };
  }

  const playersDrafted = (draftedParsed.value || [])
    .map((entry) => ({
      playerId: Number(entry?.playerId),
      price: Number(entry?.price),
    }))
    .filter((entry) => Number.isInteger(entry.playerId) && Number.isFinite(entry.price) && entry.price >= 0);

  const rosterSlotsParsed = parseJsonQueryParam(query.rosterSlots, "rosterSlots");
  if (rosterSlotsParsed.error) {
    return { error: rosterSlotsParsed.error };
  }
  if (rosterSlotsParsed.value !== undefined && !Array.isArray(rosterSlotsParsed.value)) {
    return { error: "rosterSlots must decode to an array" };
  }

  const rosterSpots = rosterSpotsFromLegacySlots(rosterSlotsParsed.value || []);
  const leagueSettings = { budget, teams };
  if (rosterSpots) {
    leagueSettings.rosterSpots = rosterSpots;
  }

  return {
    leagueSettings,
    draftState: { playersDrafted },
  };
}

function validateCreatePlayerBody(body) {
  if (!body || typeof body !== "object") {
    return "Request body is required";
  }

  if (!Number.isInteger(body.playerId) || body.playerId <= 0) {
    return "playerId must be a positive integer";
  }

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return "name is required";
  }

  if (typeof body.team !== "string" || body.team.trim() === "") {
    return "team is required";
  }

  if (body.league !== undefined) {
    const league = String(body.league).toUpperCase();
    if (league !== "AL" && league !== "NL") {
      return "league must be AL or NL";
    }
  }

  const positions = normalizePositions(body.position);
  if (positions.length === 0) {
    return "position must be a non-empty string or array";
  }

  if (!body.stats || typeof body.stats !== "object" || Array.isArray(body.stats)) {
    return "stats must be an object";
  }

  if (body.status !== undefined && !PLAYER_STATUS_VALUES.has(String(body.status))) {
    return "status is invalid";
  }

  if (body.age !== undefined && (!Number.isInteger(body.age) || body.age < 15 || body.age > 55)) {
    return "age must be an integer between 15 and 55";
  }

  if (body.depthRank !== undefined && (!Number.isInteger(body.depthRank) || body.depthRank <= 0)) {
    return "depthRank must be a positive integer";
  }

  if (body.statsHistory !== undefined) {
    if (!Array.isArray(body.statsHistory)) {
      return "statsHistory must be an array";
    }

    for (const row of body.statsHistory) {
      if (!row || !Number.isInteger(row.season) || !row.stats || typeof row.stats !== "object") {
        return "statsHistory entries must include integer season and object stats";
      }
    }
  }

  return null;
}

const ALLOWED_SYNC_ROSTER_TYPES = new Set(["active", "40Man", "depthChart", "fullSeason", "fullRoster"]);

function validateMlbSyncBody(body) {
  if (body === undefined || body === null) {
    return null;
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be an object";
  }

  if (body.rosterType !== undefined && !ALLOWED_SYNC_ROSTER_TYPES.has(String(body.rosterType))) {
    return "rosterType must be one of: active, 40Man, depthChart, fullSeason";
  }

  for (const numericField of ["seasonsBack", "lookbackDays", "concurrency"]) {
    if (body[numericField] !== undefined) {
      const value = Number(body[numericField]);
      if (!Number.isInteger(value) || value <= 0) {
        return `${numericField} must be a positive integer`;
      }
    }
  }

  if (body.latestSeason !== undefined) {
    const latestSeason = Number(body.latestSeason);
    if (!Number.isInteger(latestSeason) || latestSeason < 1900 || latestSeason > 2100) {
      return "latestSeason must be a valid year";
    }
  }

  if (body.replaceCatalog !== undefined && typeof body.replaceCatalog !== "boolean") {
    return "replaceCatalog must be a boolean";
  }

  if (body.refreshExternalData !== undefined && typeof body.refreshExternalData !== "boolean") {
    return "refreshExternalData must be a boolean";
  }

  if (body.externalDataCacheDir !== undefined && typeof body.externalDataCacheDir !== "string") {
    return "externalDataCacheDir must be a string path";
  }

  for (const pathField of [
    "lahmanBattingCsvPath",
    "lahmanPitchingCsvPath",
    "lahmanPeopleCsvPath",
    "chadwickRegisterCsvPath",
    "fangraphsDepthCsvPath",
  ]) {
    if (body[pathField] !== undefined && typeof body[pathField] !== "string") {
      return `${pathField} must be a string path`;
    }
  }

  for (const urlField of [
    "lahmanBattingCsvUrl",
    "lahmanPitchingCsvUrl",
    "lahmanPeopleCsvUrl",
    "chadwickRegisterCsvUrl",
    "fangraphsDepthCsvUrl",
  ]) {
    if (body[urlField] !== undefined && typeof body[urlField] !== "string") {
      return `${urlField} must be a string URL`;
    }
  }

  return null;
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

async function createCustomPlayer(req, res, next) {
  try {
    const validationError = validateCreatePlayerBody(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const {
      playerId,
      name,
      mlbTeamId,
      team,
      league,
      isPitcher,
      age,
      depthRank,
      status,
      injuryStatus,
      lahmanId,
      stats,
      statsHistory,
    } = req.body;

    const existing = await Player.findOne({ playerId }).lean();
    if (existing) {
      return res.status(409).json({ error: "Player already exists" });
    }

    const normalizedPositions = normalizePositions(req.body.position);
    const playerDoc = await Player.create({
      playerId,
      name: name.trim(),
      mlbTeamId: Number.isInteger(mlbTeamId) ? mlbTeamId : undefined,
      team: team.trim().toUpperCase(),
      league: league ? String(league).toUpperCase() : undefined,
      position: normalizedPositions,
      isPitcher:
        isPitcher !== undefined
          ? Boolean(isPitcher)
          : normalizedPositions.some((position) => isPitchingPosition(position)),
      age: Number.isInteger(age) ? age : undefined,
      depthRank: Number.isInteger(depthRank) ? depthRank : 1,
      status: status ? String(status) : "active",
      injuryStatus: typeof injuryStatus === "string" ? injuryStatus : "",
      lahmanId: typeof lahmanId === "string" ? lahmanId : "",
      stats,
      statsHistory: Array.isArray(statsHistory) ? statsHistory : [],
      fetchedAt: new Date(),
    });

    const createdPlayer = typeof playerDoc.toObject === "function" ? playerDoc.toObject() : playerDoc;
    return res.status(201).json(mapPlayerDetails(createdPlayer));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Player already exists" });
    }
    return next(error);
  }
}

async function getPlayerValuationLegacy(req, res, next) {
  try {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId)) {
      return res.status(400).json({ error: "playerId must be a number (MLB integer ID)" });
    }

    const legacyInput = buildLegacyValuationInput(req.query);
    if (legacyInput.error) {
      return res.status(400).json({ error: legacyInput.error });
    }

    const allPlayers = await Player.find({ league: { $in: ["AL", "NL"] } }).lean();
    const values = calculatePlayerValues(allPlayers, legacyInput.leagueSettings, legacyInput.draftState);
    const playerValue = values.find((valueRow) => valueRow.playerId === playerId);

    if (!playerValue) {
      return res.status(404).json({ error: "Player not found or already drafted" });
    }

    return res.json(playerValue);
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

  if (leagueSettings.scoringSystem !== undefined) {
    const scoringSystem = String(leagueSettings.scoringSystem).toLowerCase();
    if (!SUPPORTED_SCORING_SYSTEMS.includes(scoringSystem)) {
      return `leagueSettings.scoringSystem must be one of: ${SUPPORTED_SCORING_SYSTEMS.join(", ")}`;
    }
  }

  if (leagueSettings.categories !== undefined) {
    if (!leagueSettings.categories || typeof leagueSettings.categories !== "object") {
      return "leagueSettings.categories must be an object with hitters/pitchers arrays";
    }

    for (const role of ["hitters", "pitchers"]) {
      if (leagueSettings.categories[role] === undefined) continue;
      if (!Array.isArray(leagueSettings.categories[role])) {
        return `leagueSettings.categories.${role} must be an array`;
      }
      if (leagueSettings.categories[role].length === 0) {
        return `leagueSettings.categories.${role} must not be empty`;
      }

      const allowed = new Set(ROTO_ALLOWED_CATEGORIES[role]);
      const invalid = leagueSettings.categories[role]
        .map((category) => String(category).toUpperCase())
        .filter((category) => !allowed.has(category));

      if (invalid.length > 0) {
        return `leagueSettings.categories.${role} has unsupported category: ${invalid[0]}`;
      }
    }
  }

  if (leagueSettings.pointsConfig !== undefined) {
    if (!leagueSettings.pointsConfig || typeof leagueSettings.pointsConfig !== "object") {
      return "leagueSettings.pointsConfig must be an object with hitters/pitchers category weights";
    }

    for (const role of ["hitters", "pitchers"]) {
      if (leagueSettings.pointsConfig[role] === undefined) continue;
      if (!leagueSettings.pointsConfig[role] || typeof leagueSettings.pointsConfig[role] !== "object") {
        return `leagueSettings.pointsConfig.${role} must be an object of numeric weights`;
      }

      for (const [category, weight] of Object.entries(leagueSettings.pointsConfig[role])) {
        if (!Number.isFinite(weight)) {
          return `leagueSettings.pointsConfig.${role}.${category} must be numeric`;
        }
      }
    }
  }

  if (leagueSettings.budgetSplit !== undefined) {
    if (!leagueSettings.budgetSplit || typeof leagueSettings.budgetSplit !== "object") {
      return "leagueSettings.budgetSplit must be an object with hitters and pitchers numbers";
    }
    const hitters = leagueSettings.budgetSplit.hitters;
    const pitchers = leagueSettings.budgetSplit.pitchers;
    const hittersValid = hitters === undefined || (Number.isFinite(hitters) && hitters >= 0);
    const pitchersValid = pitchers === undefined || (Number.isFinite(pitchers) && pitchers >= 0);
    if (!hittersValid || !pitchersValid) {
      return "leagueSettings.budgetSplit.hitters and pitchers must be non-negative numbers";
    }
    if (!(Number(hitters) > 0) && !(Number(pitchers) > 0)) {
      return "leagueSettings.budgetSplit must provide a positive hitters or pitchers weight";
    }
  }

  if (leagueSettings.rosterSpots !== undefined) {
    if (!leagueSettings.rosterSpots || typeof leagueSettings.rosterSpots !== "object") {
      return "leagueSettings.rosterSpots must be an object with integer hitters and pitchers";
    }
    const hittersSpots = leagueSettings.rosterSpots.hitters;
    const pitchersSpots = leagueSettings.rosterSpots.pitchers;
    if (!Number.isInteger(hittersSpots) || hittersSpots <= 0) {
      return "leagueSettings.rosterSpots.hitters must be a positive integer";
    }
    if (!Number.isInteger(pitchersSpots) || pitchersSpots <= 0) {
      return "leagueSettings.rosterSpots.pitchers must be a positive integer";
    }
  }

  if (leagueSettings.minPlayerCost !== undefined) {
    if (!Number.isFinite(leagueSettings.minPlayerCost) || leagueSettings.minPlayerCost < 0) {
      return "leagueSettings.minPlayerCost must be a non-negative number";
    }
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

  if (draftState && draftState.teamStates !== undefined) {
    if (!Array.isArray(draftState.teamStates)) {
      return "draftState.teamStates must be an array";
    }

    for (const teamState of draftState.teamStates) {
      if (!teamState || typeof teamState !== "object") {
        return "Each team state must be an object";
      }
      if (teamState.teamId === undefined || teamState.teamId === null || teamState.teamId === "") {
        return "Each team state must include a teamId";
      }

      if (teamState.budgetRemaining !== undefined) {
        if (!Number.isFinite(teamState.budgetRemaining) || teamState.budgetRemaining < 0) {
          return "Each teamState.budgetRemaining must be a non-negative number";
        }
      }

      if (teamState.rosterFilled !== undefined) {
        if (!teamState.rosterFilled || typeof teamState.rosterFilled !== "object") {
          return "Each teamState.rosterFilled must be an object with hitters and pitchers";
        }
        if (!Number.isInteger(teamState.rosterFilled.hitters) || teamState.rosterFilled.hitters < 0) {
          return "Each teamState.rosterFilled.hitters must be a non-negative integer";
        }
        if (!Number.isInteger(teamState.rosterFilled.pitchers) || teamState.rosterFilled.pitchers < 0) {
          return "Each teamState.rosterFilled.pitchers must be a non-negative integer";
        }
      }

      if (teamState.draftedPlayerIds !== undefined) {
        if (!Array.isArray(teamState.draftedPlayerIds)) {
          return "Each teamState.draftedPlayerIds must be an array of integer IDs";
        }
        const hasInvalidDraftedId = teamState.draftedPlayerIds.some((id) => !Number.isInteger(id));
        if (hasInvalidDraftedId) {
          return "Each teamState.draftedPlayerIds must be an array of integer IDs";
        }
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

async function syncMlbCatalog(req, res, next) {
  try {
    const validationError = validateMlbSyncBody(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const result = await mlbCatalogSyncService.syncCatalogFromMlbApi(payload);

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getPlayers,
  getPlayerById,
  createCustomPlayer,
  getPlayerValuationLegacy,
  valuateSinglePlayer,
  valuateMultiplePlayers,
  valuateAllPlayers,
  syncMlbCatalog,
  validateValuationBody,
  validateMlbSyncBody,
};
