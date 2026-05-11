const express = require("express");
const cors = require("cors");
const env = require("./config/env");
const { connectMongo } = require("./db/mongo");
const { requireAppClientKey } = require("./middleware/auth");
const playersRoutes = require("./routes/players-routes");
const playerRoutes = require("./routes/player-routes");
const teamsRoutes = require("./routes/teams-routes");
const userRoutes = require("./routes/user-routes");
const { seedPlayersCatalog } = require("./services/seedPlayersCatalog");
const { seedTeamsCatalog } = require("./services/seedTeamsCatalog");
const { syncCatalogFromMlbApi } = require("./services/mlbCatalogSyncService");

const app = express();
const allowedOrigins = env.corsOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsConfig = {
  origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsConfig));
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/players", requireAppClientKey, playersRoutes);
app.use("/api/player", requireAppClientKey, playerRoutes);
app.use("/api/teams", requireAppClientKey, teamsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

function buildSyncOptionsFromEnv() {
  return {
    rosterType: env.syncMlbRosterType,
    seasonsBack: env.syncMlbSeasonsBack,
    lookbackDays: env.syncMlbLookbackDays,
    concurrency: env.syncMlbConcurrency,
    replaceCatalog: env.syncMlbReplaceCatalog,
    refreshExternalData: env.externalDataRefreshOnSync,
    externalDataCacheDir: env.externalDataCacheDir,
    lahmanBattingCsvPath: env.lahmanBattingCsvPath,
    lahmanPitchingCsvPath: env.lahmanPitchingCsvPath,
    lahmanPeopleCsvPath: env.lahmanPeopleCsvPath,
    chadwickRegisterCsvPath: env.chadwickRegisterCsvPath,
    fangraphsDepthCsvPath: env.fangraphsDepthCsvPath,
    lahmanBattingCsvUrl: env.lahmanBattingCsvUrl,
    lahmanPitchingCsvUrl: env.lahmanPitchingCsvUrl,
    lahmanPeopleCsvUrl: env.lahmanPeopleCsvUrl,
    chadwickRegisterCsvUrl: env.chadwickRegisterCsvUrl,
    fangraphsDepthCsvUrl: env.fangraphsDepthCsvUrl,
  };
}

async function runCatalogSync(reason) {
  const summary = await syncCatalogFromMlbApi(buildSyncOptionsFromEnv());
  console.log(
    `MLB sync (${reason}) complete: ${summary.playersSynced} players, ${summary.teamsSynced} teams (${summary.rosterType})`,
  );
  if (Array.isArray(summary.externalDataRefresh?.failedSources) && summary.externalDataRefresh.failedSources.length) {
    console.warn(
      `External CSV refresh warnings (${reason}): ${summary.externalDataRefresh.failedSources.length} source(s) failed`,
    );
  }
  return summary;
}

async function start() {
  await connectMongo(env.mongodbUri);
  await seedTeamsCatalog();
  await seedPlayersCatalog();

  app.listen(env.port, () => {
    console.log(`DraftKit API listening on port ${env.port}`);
  });

  if (env.syncMlbOnStartup) {
    runCatalogSync("startup").catch((error) => {
      console.error("MLB sync failed, continuing with seeded catalog:", error.message);
    });
  }

  if (env.syncMlbIntervalMinutes > 0) {
    const intervalMs = env.syncMlbIntervalMinutes * 60 * 1000;
    const timer = setInterval(() => {
      runCatalogSync("scheduled").catch((error) => {
        console.error("Scheduled MLB sync failed:", error.message);
      });
    }, intervalMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }

    console.log(`MLB sync scheduler enabled: every ${env.syncMlbIntervalMinutes} minute(s)`);
  }

}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
