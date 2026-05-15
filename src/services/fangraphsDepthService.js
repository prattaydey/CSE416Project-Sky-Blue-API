const { readCsvTable } = require("./csvTableService");
const { indexChadwickRows } = require("./lahmanOverlayService");

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function pickFirst(row, candidates) {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined && row[candidate] !== null && row[candidate] !== "") {
      return row[candidate];
    }
  }
  return "";
}

function normalizePosition(position) {
  const normalized = String(position || "").trim().toUpperCase();
  return normalized === "LF" || normalized === "CF" || normalized === "RF" ? "OF" : normalized;
}

function canonicalTeamAbbreviation(team) {
  const normalized = String(team || "").trim().toUpperCase();
  if (normalized === "AZ" || normalized === "ARI") return "ARI";
  if (normalized === "WSN" || normalized === "WAS") return "WSH";
  if (normalized === "TB" || normalized === "TBR") return "TB";
  if (normalized === "CWS") return "CHW";
  if (normalized === "SF") return "SFG";
  if (normalized === "SD") return "SDP";
  return normalized;
}

function inferDepthMetric(row) {
  const pa = asFiniteNumber(pickFirst(row, ["PA", "pa", "PA_proj"]), Number.NaN);
  if (Number.isFinite(pa) && pa > 0) return pa;

  const ip = asFiniteNumber(pickFirst(row, ["IP", "IP_proj", "ip"]), Number.NaN);
  if (Number.isFinite(ip) && ip > 0) return ip;

  const war = asFiniteNumber(pickFirst(row, ["WAR", "WAR_proj", "war"]), Number.NaN);
  if (Number.isFinite(war)) return war;

  const g = asFiniteNumber(pickFirst(row, ["G", "GS", "g"]), Number.NaN);
  if (Number.isFinite(g)) return g;

  return 0;
}

function resolveMlbPlayerId(row, chadwickIndex) {
  const directMlbId = parseIntOrNull(
    pickFirst(row, ["key_mlbam", "mlbam_id", "mlbID", "playerid_mlb", "MLBID"]),
  );
  if (directMlbId) return directMlbId;

  const fgId = parseIntOrNull(
    pickFirst(row, ["playerid", "playerId", "key_fangraphs", "fangraphs_id"]),
  );
  if (!fgId) return null;

  return chadwickIndex.byFgId.get(fgId) || null;
}

function loadFangraphsDepthOverrides(options) {
  const depthRows = readCsvTable(options?.fangraphsDepthCsvPath);
  const chadwickRows = readCsvTable(options?.chadwickRegisterCsvPath);
  if (depthRows.length === 0 || chadwickRows.length === 0) {
    return { depthByMlbId: new Map(), rowsProcessed: 0 };
  }

  const chadwickIndex = indexChadwickRows(chadwickRows);
  const resolved = [];

  for (const row of depthRows) {
    const playerId = resolveMlbPlayerId(row, chadwickIndex);
    if (!playerId) continue;

    const team = canonicalTeamAbbreviation(
      pickFirst(row, ["Team", "team", "TeamAbbrev", "team_abbr"]),
    );
    const position = normalizePosition(
      pickFirst(row, ["Pos", "POS", "position", "Position", "RosterPos"]),
    );
    const metric = inferDepthMetric(row);

    resolved.push({ playerId, team, position, metric });
  }

  const sorted = resolved.sort((a, b) => b.metric - a.metric);
  const depthByMlbId = new Map();
  const rankByBucket = new Map();

  for (const row of sorted) {
    const bucket = `${row.team}|${row.position}`;
    const currentRank = rankByBucket.get(bucket) || 0;
    const nextRank = currentRank + 1;
    rankByBucket.set(bucket, nextRank);

    const existingRank = depthByMlbId.get(row.playerId);
    if (!existingRank || nextRank < existingRank) {
      depthByMlbId.set(row.playerId, nextRank);
    }
  }

  return {
    depthByMlbId,
    rowsProcessed: depthRows.length,
    depthOverrides: depthByMlbId.size,
  };
}

module.exports = {
  loadFangraphsDepthOverrides,
  inferDepthMetric,
  resolveMlbPlayerId,
};
