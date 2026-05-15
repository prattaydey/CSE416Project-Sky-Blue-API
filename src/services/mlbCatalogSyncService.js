const Player = require("../models/player.model");
const Team = require("../models/team.model");
const {
  fetchAllTeams,
  fetchTeamRoster,
  fetchPlayer,
  fetchPlayerSeasonStats,
  fetchTransactionsRange,
} = require("./mlbStatsApi");
const { loadLahmanPlayerOverlays } = require("./lahmanOverlayService");
const { loadFangraphsDepthOverrides } = require("./fangraphsDepthService");
const { refreshExternalCsvSources } = require("./externalDataRefreshService");

const DEFAULT_ROSTER_TYPE = "40Man";
const DEFAULT_SEASONS_BACK = 3;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_CONCURRENCY = 8;
const ALLOWED_ROSTER_TYPES = new Set(["active", "40Man", "depthChart", "fullSeason", "fullRoster"]);

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizePosition(position) {
  const normalized = String(position || "").trim().toUpperCase();
  return normalized === "LF" || normalized === "CF" || normalized === "RF" ? "OF" : normalized;
}

function isPitchingPosition(position) {
  const normalized = normalizePosition(position);
  return normalized === "P" || normalized === "SP" || normalized === "RP" || normalized === "CL";
}

function computeAge(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;

  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }

  if (!Number.isFinite(age) || age < 15 || age > 55) return null;
  return age;
}

function parseMlbRate(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function normalizeHittingStats(rawStats) {
  const stats = rawStats || {};
  return {
    BA: parseMlbRate(stats.avg),
    OBP: parseMlbRate(stats.obp || stats.onBasePercentage),
    HR: asFiniteNumber(stats.homeRuns, 0),
    R: asFiniteNumber(stats.runs, 0),
    RBI: asFiniteNumber(stats.rbi, 0),
    SB: asFiniteNumber(stats.stolenBases, 0),
    H: asFiniteNumber(stats.hits, 0),
    AB: asFiniteNumber(stats.atBats, 0),
    PA: asFiniteNumber(stats.plateAppearances, 0),
  };
}

function normalizePitchingStats(rawStats) {
  const stats = rawStats || {};
  return {
    ERA: parseMlbRate(stats.era),
    WHIP: parseMlbRate(stats.whip),
    W: asFiniteNumber(stats.wins, 0),
    SV: asFiniteNumber(stats.saves, 0),
    K: asFiniteNumber(stats.strikeOuts, 0),
    QS: asFiniteNumber(stats.qualityStarts, 0),
    IP: parseMlbRate(stats.inningsPitched),
  };
}

function normalizeSeasonStats(seasonStats, isPitcher) {
  const hitting = normalizeHittingStats(seasonStats?.hitting || {});
  const pitching = normalizePitchingStats(seasonStats?.pitching || {});
  return isPitcher ? pitching : hitting;
}

function normalizeRosterStatus(statusText) {
  const text = String(statusText || "").toLowerCase();
  if (!text) return "active";
  if (text.includes("injured") || /\b(il|i\.l\.)\b/.test(text)) return "injured";
  if (text.includes("suspended")) return "suspended";
  if (text.includes("restricted")) return "restricted";
  if (text.includes("optioned") || text.includes("minors") || text.includes("assigned")) return "minors";
  if (text.includes("free agent")) return "free_agent";
  return "active";
}

function extractInjuryDetail(text) {
  const source = String(text || "").trim();
  if (!source) return "";

  const paren = source.match(/\(([^)]+)\)/);
  if (paren && paren[1]) return paren[1].trim();

  const withMatch = source.match(/\bwith\b\s+(.+)$/i);
  if (withMatch && withMatch[1]) return withMatch[1].trim();

  if (/injured/i.test(source)) return source;
  return "";
}

function classifyTransaction(tx) {
  const rawType = String(tx?.type || "");
  const rawDescription = String(tx?.description || "");
  const text = `${rawType} ${rawDescription}`.toLowerCase();
  if (!text.trim()) return null;

  const mentionsIl = text.includes("injured list") || /\bil\b/.test(text);
  if (mentionsIl && /(activated|reinstated|returned)/.test(text)) {
    return { status: "active", injuryStatus: "" };
  }

  if (mentionsIl || text.includes("injury")) {
    return {
      status: "injured",
      injuryStatus: extractInjuryDetail(rawDescription || rawType),
    };
  }

  if (text.includes("suspended")) return { status: "suspended", injuryStatus: "" };
  if (text.includes("restricted")) return { status: "restricted", injuryStatus: "" };
  if (text.includes("optioned") || text.includes("assigned to") || text.includes("recalled")) {
    return { status: "minors", injuryStatus: "" };
  }

  return null;
}

function buildLatestTransactionStatus(transactions) {
  const sorted = [...(transactions || [])].sort((a, b) => {
    const aTime = new Date(a.effectiveDate || a.date || 0).getTime();
    const bTime = new Date(b.effectiveDate || b.date || 0).getTime();
    return aTime - bTime;
  });

  const latestByPlayer = new Map();
  for (const tx of sorted) {
    const playerId = Number(tx?.playerId);
    if (!Number.isInteger(playerId)) continue;
    const classified = classifyTransaction(tx);
    if (!classified) continue;
    latestByPlayer.set(playerId, classified);
  }
  return latestByPlayer;
}

function buildDepthArtifacts(depthEntries) {
  const perPositionCounts = new Map();
  const rankByPlayer = new Map();
  const depthChart = {};

  for (const entry of depthEntries || []) {
    const playerId = Number(entry?.playerId);
    if (!Number.isInteger(playerId)) continue;

    const position = normalizePosition(entry?.position);
    if (!position) continue;

    const currentCount = perPositionCounts.get(position) || 0;
    const rank = currentCount + 1;
    perPositionCounts.set(position, rank);

    if (!rankByPlayer.has(playerId) || rank < rankByPlayer.get(playerId)) {
      rankByPlayer.set(playerId, rank);
    }

    if (!Array.isArray(depthChart[position])) depthChart[position] = [];
    depthChart[position].push({
      playerId,
      name: entry.name || "",
      rank,
    });
  }

  return { rankByPlayer, depthChart };
}

async function mapWithConcurrency(items, concurrency, worker) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const limit = Math.max(1, Math.min(asPositiveInt(concurrency, DEFAULT_CONCURRENCY), items.length));
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

function resolveSeasons(latestSeason, seasonsBack) {
  const latest = asPositiveInt(latestSeason, new Date().getUTCFullYear() - 1);
  const count = Math.max(1, Math.min(asPositiveInt(seasonsBack, DEFAULT_SEASONS_BACK), 5));
  return Array.from({ length: count }, (_value, idx) => latest - idx);
}

function resolveStatus(rosterStatusText, txStatus) {
  const rosterStatus = normalizeRosterStatus(rosterStatusText);
  if (rosterStatus !== "active") {
    return {
      status: rosterStatus,
      injuryStatus: rosterStatus === "injured" ? extractInjuryDetail(rosterStatusText) : "",
    };
  }

  if (txStatus) {
    return {
      status: txStatus.status,
      injuryStatus: txStatus.injuryStatus || "",
    };
  }

  return { status: "active", injuryStatus: "" };
}

function normalizeSyncOptions(options = {}) {
  const rosterType = String(options.rosterType || DEFAULT_ROSTER_TYPE);
  const rosterTypeWithAlias = rosterType === "fullRoster" ? "fullSeason" : rosterType;
  const normalizedRosterType = ALLOWED_ROSTER_TYPES.has(rosterTypeWithAlias)
    ? rosterTypeWithAlias
    : DEFAULT_ROSTER_TYPE;

  return {
    rosterType: normalizedRosterType,
    seasonsBack: asPositiveInt(options.seasonsBack, DEFAULT_SEASONS_BACK),
    lookbackDays: Math.max(1, Math.min(asPositiveInt(options.lookbackDays, DEFAULT_LOOKBACK_DAYS), 180)),
    concurrency: Math.max(1, Math.min(asPositiveInt(options.concurrency, DEFAULT_CONCURRENCY), 25)),
    latestSeason: options.latestSeason,
    replaceCatalog: Boolean(options.replaceCatalog),
    refreshExternalData:
      options.refreshExternalData === undefined ? true : Boolean(options.refreshExternalData),
    externalDataCacheDir:
      typeof options.externalDataCacheDir === "string" ? options.externalDataCacheDir : "",
    lahmanBattingCsvPath: typeof options.lahmanBattingCsvPath === "string" ? options.lahmanBattingCsvPath : "",
    lahmanPitchingCsvPath:
      typeof options.lahmanPitchingCsvPath === "string" ? options.lahmanPitchingCsvPath : "",
    lahmanPeopleCsvPath: typeof options.lahmanPeopleCsvPath === "string" ? options.lahmanPeopleCsvPath : "",
    chadwickRegisterCsvPath:
      typeof options.chadwickRegisterCsvPath === "string" ? options.chadwickRegisterCsvPath : "",
    fangraphsDepthCsvPath:
      typeof options.fangraphsDepthCsvPath === "string" ? options.fangraphsDepthCsvPath : "",
    lahmanZipPath: typeof options.lahmanZipPath === "string" ? options.lahmanZipPath : "",
    lahmanBattingCsvUrl: typeof options.lahmanBattingCsvUrl === "string" ? options.lahmanBattingCsvUrl : "",
    lahmanPitchingCsvUrl:
      typeof options.lahmanPitchingCsvUrl === "string" ? options.lahmanPitchingCsvUrl : "",
    lahmanPeopleCsvUrl: typeof options.lahmanPeopleCsvUrl === "string" ? options.lahmanPeopleCsvUrl : "",
    lahmanZipUrl: typeof options.lahmanZipUrl === "string" ? options.lahmanZipUrl : "",
    chadwickRegisterCsvUrl:
      typeof options.chadwickRegisterCsvUrl === "string" ? options.chadwickRegisterCsvUrl : "",
    chadwickRegisterCsvUrls:
      typeof options.chadwickRegisterCsvUrls === "string" ? options.chadwickRegisterCsvUrls : "",
    fangraphsDepthCsvUrl:
      typeof options.fangraphsDepthCsvUrl === "string" ? options.fangraphsDepthCsvUrl : "",
  };
}

function buildSeasonStatsMap(rows) {
  const bySeason = new Map();
  for (const row of rows || []) {
    const season = asFiniteNumber(row?.season, Number.NaN);
    if (!Number.isInteger(season)) continue;
    if (!row?.stats || typeof row.stats !== "object") continue;
    bySeason.set(season, row.stats);
  }
  return bySeason;
}

function mergeStatsHistory(preferredRows, fallbackRows, seasons) {
  const preferredMap = buildSeasonStatsMap(preferredRows);
  const fallbackMap = buildSeasonStatsMap(fallbackRows);

  return seasons.map((season) => {
    if (preferredMap.has(season)) {
      return { season, stats: preferredMap.get(season) };
    }
    if (fallbackMap.has(season)) {
      return { season, stats: fallbackMap.get(season) };
    }
    return { season, stats: {} };
  });
}

async function syncCatalogFromMlbApi(options = {}) {
  const config = normalizeSyncOptions(options);
  const now = new Date();
  const seasons = resolveSeasons(config.latestSeason, config.seasonsBack);
  let csvPaths = {
    lahmanBattingCsvPath: config.lahmanBattingCsvPath,
    lahmanPitchingCsvPath: config.lahmanPitchingCsvPath,
    lahmanPeopleCsvPath: config.lahmanPeopleCsvPath,
    chadwickRegisterCsvPath: config.chadwickRegisterCsvPath,
    fangraphsDepthCsvPath: config.fangraphsDepthCsvPath,
  };
  let externalDataRefresh = {
    attempted: false,
    refreshedSources: [],
    failedSources: [],
    cacheDir: null,
  };

  if (config.refreshExternalData) {
    externalDataRefresh.attempted = true;
    try {
      const refreshResult = await refreshExternalCsvSources({
        cacheDir: config.externalDataCacheDir,
        lahmanBattingCsvPath: config.lahmanBattingCsvPath,
        lahmanPitchingCsvPath: config.lahmanPitchingCsvPath,
        lahmanPeopleCsvPath: config.lahmanPeopleCsvPath,
        chadwickRegisterCsvPath: config.chadwickRegisterCsvPath,
        fangraphsDepthCsvPath: config.fangraphsDepthCsvPath,
        lahmanZipPath: config.lahmanZipPath,
        lahmanBattingCsvUrl: config.lahmanBattingCsvUrl,
        lahmanPitchingCsvUrl: config.lahmanPitchingCsvUrl,
        lahmanPeopleCsvUrl: config.lahmanPeopleCsvUrl,
        lahmanZipUrl: config.lahmanZipUrl,
        chadwickRegisterCsvUrl: config.chadwickRegisterCsvUrl,
        chadwickRegisterCsvUrls: config.chadwickRegisterCsvUrls,
        fangraphsDepthCsvUrl: config.fangraphsDepthCsvUrl,
      });

      csvPaths = {
        ...csvPaths,
        ...refreshResult.paths,
      };
      externalDataRefresh = {
        attempted: true,
        refreshedSources: refreshResult.refreshedSources,
        failedSources: refreshResult.failedSources,
        cacheDir: refreshResult.cacheDir,
      };
    } catch (error) {
      externalDataRefresh.failedSources.push({
        source: "external-refresh",
        url: "",
        error: error?.message || "Unknown refresh error",
      });
    }
  }

  const lahmanOverlay = loadLahmanPlayerOverlays({
    seasons,
    lahmanBattingCsvPath: csvPaths.lahmanBattingCsvPath,
    lahmanPitchingCsvPath: csvPaths.lahmanPitchingCsvPath,
    lahmanPeopleCsvPath: csvPaths.lahmanPeopleCsvPath,
    chadwickRegisterCsvPath: csvPaths.chadwickRegisterCsvPath,
  });
  const fangraphsDepth = loadFangraphsDepthOverrides({
    fangraphsDepthCsvPath: csvPaths.fangraphsDepthCsvPath,
    chadwickRegisterCsvPath: csvPaths.chadwickRegisterCsvPath,
  });

  const teams = await fetchAllTeams();
  const teamById = new Map(teams.map((team) => [team.mlbTeamId, team]));
  const teamDepthCharts = new Map();
  const teamDepthRanks = new Map();

  const rosterRows = [];
  for (const team of teams) {
    let roster = [];
    try {
      roster = await fetchTeamRoster(team.mlbTeamId, config.rosterType);
    } catch (_error) {
      roster = [];
    }

    for (const row of roster) {
      const playerId = Number(row.playerId);
      if (!Number.isInteger(playerId)) continue;
      rosterRows.push({
        playerId,
        name: row.name || "",
        position: normalizePosition(row.position),
        rosterStatusText: row.status || "",
        mlbTeamId: team.mlbTeamId,
        teamAbbreviation: team.abbreviation,
        league: team.league,
      });
    }

    try {
      const depthEntries = await fetchTeamRoster(team.mlbTeamId, "depthChart");
      const depthArtifacts = buildDepthArtifacts(depthEntries);
      teamDepthRanks.set(team.mlbTeamId, depthArtifacts.rankByPlayer);
      teamDepthCharts.set(team.mlbTeamId, depthArtifacts.depthChart);
    } catch (_error) {
      teamDepthRanks.set(team.mlbTeamId, new Map());
    }
  }

  const uniqueRosterByPlayer = new Map();
  for (const row of rosterRows) {
    if (!uniqueRosterByPlayer.has(row.playerId)) {
      uniqueRosterByPlayer.set(row.playerId, row);
    }
  }
  const rosterPlayers = [...uniqueRosterByPlayer.values()];

  const endDate = new Date(now);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - config.lookbackDays);

  let transactions = [];
  try {
    transactions = await fetchTransactionsRange(startDate, endDate);
  } catch (_error) {
    transactions = [];
  }
  const latestTxStatusByPlayer = buildLatestTransactionStatus(transactions);

  const playerRows = await mapWithConcurrency(
    rosterPlayers,
    config.concurrency,
    async (rosterPlayer) => {
      try {
        const playerInfo = await fetchPlayer(rosterPlayer.playerId);
        if (!playerInfo) return null;

        const position = normalizePosition(playerInfo.position || rosterPlayer.position);
        const isPitcher = isPitchingPosition(position);
        const statsHistory = [];

        for (const season of seasons) {
          let seasonStatsRaw = {};
          try {
            seasonStatsRaw = await fetchPlayerSeasonStats(rosterPlayer.playerId, season);
          } catch (_error) {
            seasonStatsRaw = {};
          }

          statsHistory.push({
            season,
            stats: normalizeSeasonStats(seasonStatsRaw, isPitcher),
          });
        }

        const playerTeamId =
          Number.isInteger(playerInfo.mlbTeamId) && playerInfo.mlbTeamId > 0
            ? playerInfo.mlbTeamId
            : rosterPlayer.mlbTeamId;
        const teamInfo = teamById.get(playerTeamId);
        const depthRanks = teamDepthRanks.get(playerTeamId) || new Map();
        const mlbDepthRank = depthRanks.get(rosterPlayer.playerId) || 1;
        const fangraphsDepthRank = fangraphsDepth.depthByMlbId.get(rosterPlayer.playerId);
        const depthRank =
          Number.isInteger(fangraphsDepthRank) && fangraphsDepthRank > 0
            ? fangraphsDepthRank
            : mlbDepthRank;

        const resolvedStatus = resolveStatus(
          rosterPlayer.rosterStatusText,
          latestTxStatusByPlayer.get(rosterPlayer.playerId),
        );

        const lahmanPlayer = lahmanOverlay.overlaysByMlbId.get(rosterPlayer.playerId) || null;
        const mergedStatsHistory = mergeStatsHistory(
          lahmanPlayer?.statsHistory || [],
          statsHistory,
          seasons,
        );
        const latestStatsRow = mergedStatsHistory[0] || { stats: {} };

        const lahmanBirthYear = asFiniteNumber(lahmanPlayer?.birthYear, Number.NaN);
        const lahmanAge =
          Number.isFinite(lahmanBirthYear) && lahmanBirthYear > 1850
            ? now.getUTCFullYear() - lahmanBirthYear
            : null;
        const ageFromMlb = computeAge(playerInfo.birthDate, now);
        const age =
          Number.isInteger(lahmanAge) && lahmanAge >= 15 && lahmanAge <= 55 ? lahmanAge : ageFromMlb;

        return {
          playerId: rosterPlayer.playerId,
          name: playerInfo.name || rosterPlayer.name,
          mlbTeamId: playerTeamId,
          team: teamInfo?.abbreviation || playerInfo.team || rosterPlayer.teamAbbreviation || "",
          league: teamInfo?.league || rosterPlayer.league || undefined,
          position: position ? [position] : [normalizePosition(rosterPlayer.position || "UTIL")],
          isPitcher,
          age,
          depthRank,
          status: resolvedStatus.status,
          injuryStatus: resolvedStatus.injuryStatus,
          lahmanId: lahmanPlayer?.lahmanId || "",
          stats: latestStatsRow.stats,
          statsHistory: mergedStatsHistory,
          fetchedAt: now,
        };
      } catch (_error) {
        return null;
      }
    },
  );

  const resolvedPlayers = playerRows.filter(Boolean);
  const playerOps = resolvedPlayers.map((player) => ({
    updateOne: {
      filter: { playerId: player.playerId },
      update: { $set: player },
      upsert: true,
    },
  }));

  if (playerOps.length > 0) {
    await Player.bulkWrite(playerOps);
  }

  if (config.replaceCatalog && resolvedPlayers.length > 0) {
    const keepIds = resolvedPlayers.map((p) => p.playerId);
    await Player.deleteMany({ playerId: { $nin: keepIds } });
  }

  const teamOps = teams.map((team) => {
    const update = {
      name: team.name,
      abbreviation: team.abbreviation,
      league: team.league,
      division: team.division,
      city: team.city,
      updatedAt: now,
    };
    const depthChart = teamDepthCharts.get(team.mlbTeamId);
    if (depthChart && Object.keys(depthChart).length > 0) {
      update.depthChart = depthChart;
    }

    return {
      updateOne: {
        filter: { mlbTeamId: team.mlbTeamId },
        update: { $set: update },
        upsert: true,
      },
    };
  });

  if (teamOps.length > 0) {
    await Team.bulkWrite(teamOps);
  }

  return {
    rosterType: config.rosterType,
    seasonsSynced: seasons,
    teamsSynced: teamOps.length,
    playersSynced: resolvedPlayers.length,
    transactionsAnalyzed: transactions.length,
    lahmanRowsProcessed: lahmanOverlay.rowsProcessed,
    lahmanPlayersApplied: lahmanOverlay.playerOverlays || 0,
    fangraphsRowsProcessed: fangraphsDepth.rowsProcessed,
    fangraphsDepthApplied: fangraphsDepth.depthOverrides || 0,
    externalDataRefresh,
    replacedCatalog: config.replaceCatalog,
    fetchedAt: now.toISOString(),
  };
}

module.exports = {
  syncCatalogFromMlbApi,
  normalizeHittingStats,
  normalizePitchingStats,
  normalizeSeasonStats,
  classifyTransaction,
  buildLatestTransactionStatus,
  normalizeRosterStatus,
  extractInjuryDetail,
  resolveSeasons,
};
