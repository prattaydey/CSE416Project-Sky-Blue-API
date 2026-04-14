/**
 * Z-score based auction valuation for fantasy baseball.
 *
 * Approach:
 *   1. Separate hitters and pitchers
 *   2. Compute z-scores per stat category within each pool
 *   3. Sum z-scores into a composite rating
 *   4. Scale composite ratings proportionally to the remaining auction budget
 */

const HITTER_CATEGORIES = ["BA", "HR", "RBI", "SB"];
const PITCHER_CATEGORIES = ["ERA", "W", "SV", "K"];
const INVERSE_STATS = new Set(["ERA"]);
const MIN_BASE_VALUE = 1;

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values) {
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

function computeZScores(players, categories) {
  const metrics = {};
  for (const cat of categories) {
    const vals = players.map((p) => p.stats?.[cat] ?? 0);
    metrics[cat] = { mean: mean(vals), stddev: stddev(vals) };
  }

  return players.map((player) => {
    let totalZ = 0;
    for (const cat of categories) {
      const raw = player.stats?.[cat] ?? 0;
      const { mean: m, stddev: sd } = metrics[cat];
      let z = (raw - m) / sd;
      if (INVERSE_STATS.has(cat)) z = -z;
      totalZ += z;
    }
    return {
      playerId: player.playerId,
      name: player.name,
      zScore: totalZ,
    };
  });
}

function scaleToBudget(scoredPlayers, remainingBudget) {
  if (scoredPlayers.length === 0) return [];
  if (!Number.isFinite(remainingBudget) || remainingBudget <= 0) {
    return scoredPlayers.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      value: 0,
    }));
  }

  const minZ = Math.min(...scoredPlayers.map((p) => p.zScore));
  const shifted = scoredPlayers.map((p) => ({
    ...p,
    adjusted: p.zScore - minZ + 0.1,
  }));

  const totalAdjusted = shifted.reduce((sum, p) => sum + p.adjusted, 0);
  if (!Number.isFinite(totalAdjusted) || totalAdjusted <= 0) {
    const evenValue = Math.round((remainingBudget / shifted.length) * 10) / 10;
    return shifted.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      value: evenValue,
    }));
  }

  // Preserve a $1 minimum only when the remaining budget can support it.
  const baseValue = remainingBudget >= MIN_BASE_VALUE * shifted.length ? MIN_BASE_VALUE : 0;
  const baseAllocation = baseValue * shifted.length;
  const distributableBudget = Math.max(remainingBudget - baseAllocation, 0);

  return shifted.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    value: Math.round((baseValue + (p.adjusted / totalAdjusted) * distributableBudget) * 10) / 10,
  }));
}

function calculatePlayerValues(allPlayers, leagueSettings, draftState) {
  const { budget, teams } = leagueSettings;
  const totalBudget = Math.max(budget * teams, 0);

  const draftedPlayers = (draftState?.playersDrafted || [])
    .map((d) => ({
      playerId: Number(d.playerId),
      price: Number(d.price),
    }))
    .filter((d) => Number.isFinite(d.playerId) && Number.isFinite(d.price) && d.price >= 0);

  const moneySpent = draftedPlayers.reduce((sum, d) => sum + d.price, 0);
  const remainingBudget = Math.max(totalBudget - moneySpent, 0);

  const draftedIds = new Set(draftedPlayers.map((d) => d.playerId));
  const available = allPlayers.filter((p) => !draftedIds.has(p.playerId));

  const hitters = available.filter((p) => !p.isPitcher);
  const pitchers = available.filter((p) => p.isPitcher);

  const hitterScores = computeZScores(hitters, HITTER_CATEGORIES);
  const pitcherScores = computeZScores(pitchers, PITCHER_CATEGORIES);

  const allScored = [...hitterScores, ...pitcherScores];
  return scaleToBudget(allScored, remainingBudget);
}

module.exports = { calculatePlayerValues };
