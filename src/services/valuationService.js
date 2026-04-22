/**
 * Auction valuation for fantasy baseball with pluggable scoring engines.
 *
 * Design:
 *   1. Build a scoring signal (`roto` or `points`) per player
 *   2. Apply context modifiers (age, injury, depth role)
 *   3. Apply replacement-level cutoffs
 *   4. Convert value-above-replacement into dollar values
 */

const DEFAULT_SCORING_SYSTEM = "roto";
const SUPPORTED_SCORING_SYSTEMS = ["roto", "points"];

const ROTO_ALLOWED_CATEGORIES = {
  hitters: ["BA", "OBP", "HR", "R", "RBI", "SB", "H"],
  pitchers: ["ERA", "WHIP", "W", "SV", "K", "QS"],
};

const DEFAULT_ROTO_CATEGORIES = {
  hitters: ["BA", "HR", "RBI", "SB"],
  pitchers: ["ERA", "W", "SV", "K"],
};

const DEFAULT_POINTS_CONFIG = {
  hitters: {
    HR: 4,
    RBI: 1,
    R: 1,
    SB: 2,
    H: 1,
  },
  pitchers: {
    W: 5,
    SV: 5,
    K: 1,
    QS: 3,
    ERA: 2,
  },
};

const DEFAULT_BUDGET_SPLIT = { hitters: 0.67, pitchers: 0.33 };
const DEFAULT_ROSTER_SPOTS = { hitters: 14, pitchers: 9 };
const DEFAULT_MIN_PLAYER_COST = 1;
const DEFAULT_HITTER_VOLUME = 550;
const DEFAULT_PITCHER_VOLUME = 60;
const RECENCY_WEIGHTS = [0.55, 0.3, 0.15];

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values) {
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseInningsPitched(value) {
  const ip = asFiniteNumber(value, 0);
  if (ip <= 0) return 0;

  const whole = Math.trunc(ip);
  const decimalTenths = Math.round((ip - whole) * 10);

  if (decimalTenths === 1) return whole + 1 / 3;
  if (decimalTenths === 2) return whole + 2 / 3;
  return ip;
}

function weightedMean(pairs) {
  let weightedTotal = 0;
  let weightTotal = 0;

  for (const pair of pairs) {
    const value = asFiniteNumber(pair.value, Number.NaN);
    const weight = asFiniteNumber(pair.weight, Number.NaN);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    weightedTotal += value * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedTotal / weightTotal : 0;
}

function getStatRows(player) {
  const historyRows = Array.isArray(player?.statsHistory)
    ? player.statsHistory
        .filter((row) => row && typeof row === "object" && row.stats && typeof row.stats === "object")
        .sort((a, b) => asFiniteNumber(b.season, 0) - asFiniteNumber(a.season, 0))
    : [];

  if (historyRows.length > 0) {
    return historyRows.slice(0, 3).map((row) => ({
      season: asFiniteNumber(row.season, 0),
      stats: row.stats,
    }));
  }

  if (player?.stats && typeof player.stats === "object") {
    return [{ season: 0, stats: player.stats }];
  }

  return [];
}

function volumeFromRow(rowStats, keys, parser) {
  for (const key of keys) {
    const raw = rowStats?.[key];
    const parsed = parser ? parser(raw) : asFiniteNumber(raw, Number.NaN);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Number.NaN;
}

function blendedStat(player, statKey, options = {}) {
  const rows = getStatRows(player);
  if (rows.length === 0) return 0;

  const { volumeKeys = [], volumeParser = null } = options;

  let weightedTotal = 0;
  let weightTotal = 0;

  rows.forEach((row, idx) => {
    const value = asFiniteNumber(row.stats?.[statKey], Number.NaN);
    if (!Number.isFinite(value)) return;

    const recencyWeight = RECENCY_WEIGHTS[idx] ?? 0.05;
    let weight = recencyWeight;

    if (volumeKeys.length > 0) {
      const volume = volumeFromRow(row.stats, volumeKeys, volumeParser);
      if (Number.isFinite(volume)) {
        weight *= volume;
      }
    }

    weightedTotal += value * weight;
    weightTotal += weight;
  });

  if (weightTotal > 0) {
    return weightedTotal / weightTotal;
  }

  return asFiniteNumber(player.stats?.[statKey], 0);
}

function hitterVolume(player) {
  const rows = getStatRows(player);
  if (rows.length === 0) return DEFAULT_HITTER_VOLUME;

  let weightedTotal = 0;
  let weightTotal = 0;
  rows.forEach((row, idx) => {
    const volume = volumeFromRow(row.stats, ["AB", "PA"], null);
    if (!Number.isFinite(volume)) return;

    const recencyWeight = RECENCY_WEIGHTS[idx] ?? 0.05;
    weightedTotal += volume * recencyWeight;
    weightTotal += recencyWeight;
  });

  if (weightTotal > 0) return weightedTotal / weightTotal;
  return DEFAULT_HITTER_VOLUME;
}

function pitcherVolume(player) {
  const rows = getStatRows(player);
  if (rows.length === 0) return DEFAULT_PITCHER_VOLUME;

  let weightedTotal = 0;
  let weightTotal = 0;
  rows.forEach((row, idx) => {
    const volume = volumeFromRow(row.stats, ["IP"], parseInningsPitched);
    if (!Number.isFinite(volume)) return;

    const recencyWeight = RECENCY_WEIGHTS[idx] ?? 0.05;
    weightedTotal += volume * recencyWeight;
    weightTotal += recencyWeight;
  });

  if (weightTotal > 0) return weightedTotal / weightTotal;
  return DEFAULT_PITCHER_VOLUME;
}

function computeZScores(players, categories, categoryValueBuilder) {
  if (players.length === 0 || categories.length === 0) return [];

  const rows = players.map((player) => ({
    player,
    categoryValues: categoryValueBuilder(player),
  }));

  const metrics = {};
  for (const cat of categories) {
    const vals = rows.map((row) => asFiniteNumber(row.categoryValues[cat], 0));
    metrics[cat] = { mean: mean(vals), stddev: stddev(vals) };
  }

  return rows.map((row) => {
    let totalZ = 0;
    for (const cat of categories) {
      const raw = asFiniteNumber(row.categoryValues[cat], 0);
      const { mean: m, stddev: sd } = metrics[cat];
      const z = (raw - m) / sd;
      totalZ += z;
    }

    return {
      playerId: row.player.playerId,
      name: row.player.name,
      score: totalZ,
    };
  });
}

function resolveBudgetSplit(leagueSettings) {
  const rawSplit = leagueSettings?.budgetSplit || {};
  let hitters = asFiniteNumber(rawSplit.hitters, Number.NaN);
  let pitchers = asFiniteNumber(rawSplit.pitchers, Number.NaN);

  if (!(hitters > 0) && !(pitchers > 0)) {
    return { ...DEFAULT_BUDGET_SPLIT };
  }

  hitters = hitters > 0 ? hitters : 0;
  pitchers = pitchers > 0 ? pitchers : 0;

  const total = hitters + pitchers;
  if (total <= 0) return { ...DEFAULT_BUDGET_SPLIT };

  return {
    hitters: hitters / total,
    pitchers: pitchers / total,
  };
}

function resolveRosterSpots(leagueSettings) {
  const rawSpots = leagueSettings?.rosterSpots || {};
  const hitters =
    Number.isInteger(rawSpots.hitters) && rawSpots.hitters > 0
      ? rawSpots.hitters
      : DEFAULT_ROSTER_SPOTS.hitters;
  const pitchers =
    Number.isInteger(rawSpots.pitchers) && rawSpots.pitchers > 0
      ? rawSpots.pitchers
      : DEFAULT_ROSTER_SPOTS.pitchers;

  return { hitters, pitchers };
}

function resolveMinPlayerCost(leagueSettings) {
  const minPlayerCost = asFiniteNumber(leagueSettings?.minPlayerCost, DEFAULT_MIN_PLAYER_COST);
  return minPlayerCost >= 0 ? minPlayerCost : 0;
}

function resolveScoringSystem(leagueSettings) {
  const system = String(leagueSettings?.scoringSystem || DEFAULT_SCORING_SYSTEM).toLowerCase();
  return SUPPORTED_SCORING_SYSTEMS.includes(system) ? system : DEFAULT_SCORING_SYSTEM;
}

function resolveRotoCategories(leagueSettings, role) {
  const defaultCategories = DEFAULT_ROTO_CATEGORIES[role];
  const raw = leagueSettings?.categories?.[role];

  if (!Array.isArray(raw) || raw.length === 0) {
    return [...defaultCategories];
  }

  const allowed = new Set(ROTO_ALLOWED_CATEGORIES[role]);
  const normalized = raw
    .map((category) => String(category).toUpperCase())
    .filter((category) => allowed.has(category));

  return normalized.length > 0 ? normalized : [...defaultCategories];
}

function resolvePointsConfig(leagueSettings) {
  const raw = leagueSettings?.pointsConfig || {};
  const hitters = { ...DEFAULT_POINTS_CONFIG.hitters, ...(raw.hitters || {}) };
  const pitchers = { ...DEFAULT_POINTS_CONFIG.pitchers, ...(raw.pitchers || {}) };

  for (const key of Object.keys(hitters)) {
    hitters[key] = asFiniteNumber(hitters[key], 0);
  }
  for (const key of Object.keys(pitchers)) {
    pitchers[key] = asFiniteNumber(pitchers[key], 0);
  }

  return { hitters, pitchers };
}

function ageMultiplier(player) {
  const age = asFiniteNumber(player?.age, Number.NaN);
  if (!Number.isFinite(age) || age <= 0) return 1;

  if (age <= 24) return 0.97;
  if (age <= 27) return 1.02;
  if (age <= 31) return 1;
  if (age <= 34) return 0.96;
  if (age <= 37) return 0.9;
  return 0.82;
}

function injuryMultiplier(player) {
  const status = String(player?.status || "active").toLowerCase();
  if (status === "injured") return 0.82;
  if (status === "suspended") return 0.75;
  if (status === "minors") return 0.72;
  if (status === "restricted") return 0.62;
  if (status === "free_agent") return 0.9;
  return 1;
}

function depthMultiplier(player) {
  const rank = asFiniteNumber(player?.depthRank, Number.NaN);
  if (!Number.isFinite(rank) || rank < 1) return 1;
  if (rank === 1) return 1;
  return Math.max(0.5, 1 - (rank - 1) * 0.12);
}

function applyContextAdjustments(scoredPlayers, playerById) {
  return scoredPlayers.map((row) => {
    const player = playerById.get(row.playerId) || {};
    const multiplier = ageMultiplier(player) * injuryMultiplier(player) * depthMultiplier(player);
    const safeMultiplier = Math.max(multiplier, 0.2);
    const adjustedScore = row.score >= 0 ? row.score * safeMultiplier : row.score / safeMultiplier;

    return {
      ...row,
      score: adjustedScore,
    };
  });
}

function normalizeTeamStates(draftState) {
  if (!Array.isArray(draftState?.teamStates)) return [];

  return draftState.teamStates
    .map((team) => {
      const budgetRemaining = asFiniteNumber(team?.budgetRemaining, Number.NaN);
      const hittersFilled = asFiniteNumber(team?.rosterFilled?.hitters, Number.NaN);
      const pitchersFilled = asFiniteNumber(team?.rosterFilled?.pitchers, Number.NaN);
      const draftedPlayerIds = Array.isArray(team?.draftedPlayerIds)
        ? team.draftedPlayerIds.filter((id) => Number.isInteger(id))
        : [];

      return {
        teamId: team?.teamId,
        budgetRemaining,
        hittersFilled,
        pitchersFilled,
        draftedPlayerIds,
      };
    })
    .filter((team) => team && team.teamId !== undefined && team.teamId !== null);
}

function resolveSlotsFromState(teamStates, teams, rosterSpots, draftedHitters, draftedPitchers) {
  const rosterTotals = {
    hitters: Math.max(asFiniteNumber(teams, 0) * rosterSpots.hitters, 0),
    pitchers: Math.max(asFiniteNumber(teams, 0) * rosterSpots.pitchers, 0),
  };

  if (teamStates.length === 0) {
    return {
      hitters: Math.max(rosterTotals.hitters - draftedHitters, 0),
      pitchers: Math.max(rosterTotals.pitchers - draftedPitchers, 0),
    };
  }

  const hasCompleteFilledState = teamStates.every(
    (team) => Number.isInteger(team.hittersFilled) && team.hittersFilled >= 0 && Number.isInteger(team.pitchersFilled) && team.pitchersFilled >= 0,
  );

  if (!hasCompleteFilledState) {
    return {
      hitters: Math.max(rosterTotals.hitters - draftedHitters, 0),
      pitchers: Math.max(rosterTotals.pitchers - draftedPitchers, 0),
    };
  }

  const hittersFilledTotal = teamStates.reduce((sum, team) => sum + team.hittersFilled, 0);
  const pitchersFilledTotal = teamStates.reduce((sum, team) => sum + team.pitchersFilled, 0);

  return {
    hitters: Math.max(rosterTotals.hitters - hittersFilledTotal, 0),
    pitchers: Math.max(rosterTotals.pitchers - pitchersFilledTotal, 0),
  };
}

function resolveRemainingBudget(totalBudget, draftedPlayers, teamStates) {
  const hasTeamBudgetState =
    teamStates.length > 0 && teamStates.every((team) => Number.isFinite(team.budgetRemaining) && team.budgetRemaining >= 0);

  if (hasTeamBudgetState) {
    return teamStates.reduce((sum, team) => sum + team.budgetRemaining, 0);
  }

  const moneySpent = draftedPlayers.reduce((sum, d) => sum + d.price, 0);
  return Math.max(totalBudget - moneySpent, 0);
}

function rotoCategoryValueForHitter(player, category, hitterPoolRates) {
  const volume = hitterVolume(player);

  if (category === "BA") {
    const ba = blendedStat(player, "BA", { volumeKeys: ["AB", "PA"] });
    return (ba - hitterPoolRates.BA) * volume;
  }
  if (category === "OBP") {
    const obp = blendedStat(player, "OBP", { volumeKeys: ["AB", "PA"] });
    return (obp - hitterPoolRates.OBP) * volume;
  }

  return blendedStat(player, category);
}

function rotoCategoryValueForPitcher(player, category, pitcherPoolRates) {
  const volume = pitcherVolume(player);

  if (category === "ERA") {
    const era = blendedStat(player, "ERA", { volumeKeys: ["IP"], volumeParser: parseInningsPitched });
    return (pitcherPoolRates.ERA - era) * volume;
  }
  if (category === "WHIP") {
    const whip = blendedStat(player, "WHIP", { volumeKeys: ["IP"], volumeParser: parseInningsPitched });
    return (pitcherPoolRates.WHIP - whip) * volume;
  }

  return blendedStat(player, category);
}

function scoreByRoto(availableHitters, availablePitchers, leagueSettings) {
  const hitterCategories = resolveRotoCategories(leagueSettings, "hitters");
  const pitcherCategories = resolveRotoCategories(leagueSettings, "pitchers");

  const hitterPoolRates = {
    BA: weightedMean(
      availableHitters.map((player) => ({
        value: blendedStat(player, "BA", { volumeKeys: ["AB", "PA"] }),
        weight: hitterVolume(player),
      })),
    ),
    OBP: weightedMean(
      availableHitters.map((player) => ({
        value: blendedStat(player, "OBP", { volumeKeys: ["AB", "PA"] }),
        weight: hitterVolume(player),
      })),
    ),
  };

  const pitcherPoolRates = {
    ERA: weightedMean(
      availablePitchers.map((player) => ({
        value: blendedStat(player, "ERA", { volumeKeys: ["IP"], volumeParser: parseInningsPitched }),
        weight: pitcherVolume(player),
      })),
    ),
    WHIP: weightedMean(
      availablePitchers.map((player) => ({
        value: blendedStat(player, "WHIP", { volumeKeys: ["IP"], volumeParser: parseInningsPitched }),
        weight: pitcherVolume(player),
      })),
    ),
  };

  const hitterScores = computeZScores(availableHitters, hitterCategories, (player) => {
    const values = {};
    for (const category of hitterCategories) {
      values[category] = rotoCategoryValueForHitter(player, category, hitterPoolRates);
    }
    return values;
  });

  const pitcherScores = computeZScores(availablePitchers, pitcherCategories, (player) => {
    const values = {};
    for (const category of pitcherCategories) {
      values[category] = rotoCategoryValueForPitcher(player, category, pitcherPoolRates);
    }
    return values;
  });

  return { hitterScores, pitcherScores };
}

function pointsCategoryValue(player, category, isPitcher) {
  if (category === "BA" || category === "OBP") {
    return blendedStat(player, category, { volumeKeys: ["AB", "PA"] }) * hitterVolume(player);
  }
  if (category === "ERA" || category === "WHIP") {
    return blendedStat(player, category, { volumeKeys: ["IP"], volumeParser: parseInningsPitched }) * -pitcherVolume(player);
  }
  if (category === "IP" && isPitcher) {
    return pitcherVolume(player);
  }
  return blendedStat(player, category);
}

function scoreByPoints(availableHitters, availablePitchers, leagueSettings) {
  const pointsConfig = resolvePointsConfig(leagueSettings);

  const hitterScores = availableHitters.map((player) => {
    let score = 0;
    for (const [category, weight] of Object.entries(pointsConfig.hitters)) {
      score += pointsCategoryValue(player, category, false) * weight;
    }
    return {
      playerId: player.playerId,
      name: player.name,
      score,
    };
  });

  const pitcherScores = availablePitchers.map((player) => {
    let score = 0;
    for (const [category, weight] of Object.entries(pointsConfig.pitchers)) {
      score += pointsCategoryValue(player, category, true) * weight;
    }
    return {
      playerId: player.playerId,
      name: player.name,
      score,
    };
  });

  return { hitterScores, pitcherScores };
}

function applyReplacementLevel(scoredPlayers, slots) {
  if (scoredPlayers.length === 0) return [];

  const sorted = [...scoredPlayers].sort((a, b) => b.score - a.score);
  const rosterableCount = Math.max(0, Math.min(Math.floor(slots), sorted.length));

  if (rosterableCount === 0) {
    return scoredPlayers.map((player) => ({
      ...player,
      isRosterable: false,
      valueAboveReplacement: 0,
    }));
  }

  const rosterableIds = new Set(sorted.slice(0, rosterableCount).map((player) => player.playerId));
  const replacementScore = sorted[rosterableCount - 1].score;

  return scoredPlayers.map((player) => {
    const isRosterable = rosterableIds.has(player.playerId);
    return {
      ...player,
      isRosterable,
      valueAboveReplacement: isRosterable ? Math.max(player.score - replacementScore, 0) : 0,
    };
  });
}

function roundToTenths(value) {
  return Math.round(value * 10) / 10;
}

function createValueMap(players, baseValue, premiumByVar, evenPremiumValue) {
  const valueMap = new Map();

  for (const player of players) {
    let value = 0;
    if (player.isRosterable) {
      if (Number.isFinite(evenPremiumValue)) {
        value = baseValue + evenPremiumValue;
      } else {
        value = baseValue + player.valueAboveReplacement * premiumByVar;
      }
    }
    valueMap.set(player.playerId, roundToTenths(Math.max(value, 0)));
  }

  return valueMap;
}

function calculatePlayerValues(allPlayers, leagueSettings, draftState) {
  const { budget, teams } = leagueSettings;
  const totalBudget = Math.max(asFiniteNumber(budget, 0) * asFiniteNumber(teams, 0), 0);

  const draftedPlayers = (draftState?.playersDrafted || [])
    .map((d) => ({
      playerId: Number(d.playerId),
      price: Number(d.price),
    }))
    .filter((d) => Number.isFinite(d.playerId) && Number.isFinite(d.price) && d.price >= 0);

  const teamStates = normalizeTeamStates(draftState);
  const remainingBudget = resolveRemainingBudget(totalBudget, draftedPlayers, teamStates);

  const playerById = new Map(allPlayers.map((player) => [player.playerId, player]));
  let draftedHitters = 0;
  let draftedPitchers = 0;
  for (const drafted of draftedPlayers) {
    const player = playerById.get(drafted.playerId);
    if (!player) continue;
    if (player.isPitcher) draftedPitchers += 1;
    else draftedHitters += 1;
  }

  const draftedIds = new Set(draftedPlayers.map((d) => d.playerId));
  for (const teamState of teamStates) {
    for (const draftedPlayerId of teamState.draftedPlayerIds) {
      draftedIds.add(draftedPlayerId);
    }
  }

  const available = allPlayers.filter((player) => !draftedIds.has(player.playerId));
  if (available.length === 0) return [];

  const availableHitters = available.filter((player) => !player.isPitcher);
  const availablePitchers = available.filter((player) => player.isPitcher);

  const scoringSystem = resolveScoringSystem(leagueSettings);
  const scoringOutput =
    scoringSystem === "points"
      ? scoreByPoints(availableHitters, availablePitchers, leagueSettings)
      : scoreByRoto(availableHitters, availablePitchers, leagueSettings);

  const adjustedHitterScores = applyContextAdjustments(scoringOutput.hitterScores, playerById);
  const adjustedPitcherScores = applyContextAdjustments(scoringOutput.pitcherScores, playerById);

  const rosterSpots = resolveRosterSpots(leagueSettings);
  const remainingSlots = resolveSlotsFromState(
    teamStates,
    teams,
    rosterSpots,
    draftedHitters,
    draftedPitchers,
  );

  const hittersWithVar = applyReplacementLevel(adjustedHitterScores, remainingSlots.hitters);
  const pitchersWithVar = applyReplacementLevel(adjustedPitcherScores, remainingSlots.pitchers);

  const rosterableHitters = hittersWithVar.filter((player) => player.isRosterable);
  const rosterablePitchers = pitchersWithVar.filter((player) => player.isRosterable);
  const rosterableCount = rosterableHitters.length + rosterablePitchers.length;

  if (remainingBudget <= 0 || rosterableCount === 0) {
    return [...hittersWithVar, ...pitchersWithVar].map((player) => ({
      playerId: player.playerId,
      name: player.name,
      value: 0,
    }));
  }

  const minPlayerCost = resolveMinPlayerCost(leagueSettings);
  const requiredBaseBudget = minPlayerCost * rosterableCount;
  const baseValue = remainingBudget >= requiredBaseBudget ? minPlayerCost : 0;
  const baseBudgetUsed = baseValue * rosterableCount;
  const premiumBudget = Math.max(remainingBudget - baseBudgetUsed, 0);

  const budgetSplit = resolveBudgetSplit(leagueSettings);
  const hitterVarTotal = rosterableHitters.reduce((sum, player) => sum + player.valueAboveReplacement, 0);
  const pitcherVarTotal = rosterablePitchers.reduce((sum, player) => sum + player.valueAboveReplacement, 0);

  const varGrandTotal = hitterVarTotal + pitcherVarTotal;
  let hitterPremiumBudget = hitterVarTotal > 0 ? premiumBudget * budgetSplit.hitters : 0;
  let pitcherPremiumBudget = pitcherVarTotal > 0 ? premiumBudget * budgetSplit.pitchers : 0;

  const allocatedPremium = hitterPremiumBudget + pitcherPremiumBudget;
  const leftoverPremium = premiumBudget - allocatedPremium;
  if (leftoverPremium > 0 && varGrandTotal > 0) {
    if (hitterVarTotal > 0) {
      hitterPremiumBudget += leftoverPremium * (hitterVarTotal / varGrandTotal);
    }
    if (pitcherVarTotal > 0) {
      pitcherPremiumBudget += leftoverPremium * (pitcherVarTotal / varGrandTotal);
    }
  }

  let hitterValues;
  let pitcherValues;

  if (varGrandTotal <= 0) {
    const evenPremiumValue = premiumBudget / rosterableCount;
    hitterValues = createValueMap(hittersWithVar, baseValue, 0, evenPremiumValue);
    pitcherValues = createValueMap(pitchersWithVar, baseValue, 0, evenPremiumValue);
  } else {
    const hitterInflation = hitterVarTotal > 0 ? hitterPremiumBudget / hitterVarTotal : 0;
    const pitcherInflation = pitcherVarTotal > 0 ? pitcherPremiumBudget / pitcherVarTotal : 0;

    hitterValues = createValueMap(hittersWithVar, baseValue, hitterInflation);
    pitcherValues = createValueMap(pitchersWithVar, baseValue, pitcherInflation);
  }

  return [...hittersWithVar, ...pitchersWithVar].map((player) => ({
    playerId: player.playerId,
    name: player.name,
    value: hitterValues.get(player.playerId) ?? pitcherValues.get(player.playerId) ?? 0,
  }));
}

module.exports = {
  calculatePlayerValues,
  SUPPORTED_SCORING_SYSTEMS,
  ROTO_ALLOWED_CATEGORIES,
};
