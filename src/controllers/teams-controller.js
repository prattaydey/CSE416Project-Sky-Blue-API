const Team = require("../models/team.model");

async function getTeams(req, res, next) {
  try {
    const { league } = req.query;

    const filter = {};
    if (league && league !== "MLB") {
      const upper = league.toUpperCase();
      if (upper !== "AL" && upper !== "NL") {
        return res.status(400).json({ error: "Invalid league filter. Use AL, NL, or MLB." });
      }
      filter.league = upper;
    }

    const teams = await Team.find(filter).sort({ name: 1 }).lean();
    return res.json(
      teams.map((t) => ({
        mlbTeamId: t.mlbTeamId,
        name: t.name,
        abbreviation: t.abbreviation,
        league: t.league,
        division: t.division,
        city: t.city,
      })),
    );
  } catch (error) {
    return next(error);
  }
}

async function getTeamById(req, res, next) {
  try {
    const mlbTeamId = Number(req.params.teamId);
    if (Number.isNaN(mlbTeamId)) {
      return res.status(400).json({ error: "teamId must be a number (MLB integer ID)" });
    }

    const team = await Team.findOne({ mlbTeamId }).lean();
    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    return res.json({
      mlbTeamId: team.mlbTeamId,
      name: team.name,
      abbreviation: team.abbreviation,
      league: team.league,
      division: team.division,
      city: team.city,
      depthChart: team.depthChart || {},
      updatedAt: new Date(team.updatedAt).toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getTeams, getTeamById };
