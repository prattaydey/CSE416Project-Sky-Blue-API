const axios = require("axios");

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";

async function fetchAllTeams() {
  const { data } = await axios.get(`${MLB_API_BASE}/teams`, {
    params: { sportId: 1 },
  });
  return data.teams.map((t) => ({
    mlbTeamId: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    league: t.league?.name?.includes("American") ? "AL" : "NL",
    division: t.division?.name?.replace(/American |National /g, "").trim() || "",
    city: t.locationName || "",
  }));
}

async function fetchActiveRoster(mlbTeamId) {
  const { data } = await axios.get(`${MLB_API_BASE}/teams/${mlbTeamId}/roster`, {
    params: { rosterType: "active" },
  });
  return (data.roster || []).map((entry) => ({
    playerId: entry.person.id,
    name: entry.person.fullName,
    jerseyNumber: entry.jerseyNumber,
    position: entry.position.abbreviation,
    status: entry.status?.description || "Active",
  }));
}

async function fetchPlayer(mlbPlayerId) {
  const { data } = await axios.get(`${MLB_API_BASE}/people/${mlbPlayerId}`, {
    params: { hydrate: "currentTeam,stats(type=season)" },
  });
  const person = data.people?.[0];
  if (!person) return null;

  return {
    playerId: person.id,
    name: person.fullName,
    mlbTeamId: person.currentTeam?.id,
    team: person.currentTeam?.abbreviation || "",
    position: person.primaryPosition?.abbreviation || "",
    batSide: person.batSide?.code,
    pitchHand: person.pitchHand?.code,
    birthDate: person.birthDate,
    active: person.active,
  };
}

async function fetchPlayerSeasonStats(mlbPlayerId, season) {
  const { data } = await axios.get(`${MLB_API_BASE}/people/${mlbPlayerId}/stats`, {
    params: { stats: "season", season, group: "hitting,pitching" },
  });
  const result = {};
  for (const group of data.stats || []) {
    const split = group.splits?.[0]?.stat;
    if (split) {
      result[group.group?.displayName || "unknown"] = split;
    }
  }
  return result;
}

async function fetchTransactions(date) {
  const dateStr = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  const { data } = await axios.get(`${MLB_API_BASE}/transactions`, {
    params: { date: dateStr },
  });
  return (data.transactions || []).map((tx) => ({
    id: tx.id,
    date: tx.date,
    effectiveDate: tx.effectiveDate,
    description: tx.description,
    playerId: tx.person?.id,
    playerName: tx.person?.fullName,
    fromTeamId: tx.fromTeam?.id,
    toTeamId: tx.toTeam?.id,
    type: tx.typeDesc,
  }));
}

module.exports = {
  fetchAllTeams,
  fetchActiveRoster,
  fetchPlayer,
  fetchPlayerSeasonStats,
  fetchTransactions,
};
