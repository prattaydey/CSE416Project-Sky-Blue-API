const dotenv = require("dotenv");

dotenv.config();

const requiredVars = ["MONGODB_URI", "APP_CLIENT_KEY", "JWT_SECRET"];

for (const name of requiredVars) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  mongodbUri: process.env.MONGODB_URI,
  appClientKey: process.env.APP_CLIENT_KEY,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174",
  syncMlbOnStartup: String(process.env.SYNC_MLB_ON_STARTUP || "true").toLowerCase() === "true",
  syncMlbRosterType: process.env.SYNC_MLB_ROSTER_TYPE || "40Man",
  syncMlbSeasonsBack: Number(process.env.SYNC_MLB_SEASONS_BACK || 3),
  syncMlbLookbackDays: Number(process.env.SYNC_MLB_LOOKBACK_DAYS || 30),
  syncMlbConcurrency: Number(process.env.SYNC_MLB_CONCURRENCY || 8),
  syncMlbIntervalMinutes: Number(process.env.SYNC_MLB_INTERVAL_MINUTES || 0),
  syncMlbReplaceCatalog:
    String(process.env.SYNC_MLB_REPLACE_CATALOG || "false").toLowerCase() === "true",
  externalDataRefreshOnSync:
    String(process.env.EXTERNAL_DATA_REFRESH_ON_SYNC || "true").toLowerCase() === "true",
  externalDataCacheDir: process.env.EXTERNAL_DATA_CACHE_DIR || "",
  lahmanBattingCsvPath: process.env.LAHMAN_BATTING_CSV_PATH || "",
  lahmanPitchingCsvPath: process.env.LAHMAN_PITCHING_CSV_PATH || "",
  lahmanPeopleCsvPath: process.env.LAHMAN_PEOPLE_CSV_PATH || "",
  chadwickRegisterCsvPath: process.env.CHADWICK_REGISTER_CSV_PATH || "",
  fangraphsDepthCsvPath: process.env.FANGRAPHS_DEPTH_CSV_PATH || "",
  lahmanZipPath: process.env.LAHMAN_ZIP_PATH || "",
  lahmanBattingCsvUrl: process.env.LAHMAN_BATTING_CSV_URL || "",
  lahmanPitchingCsvUrl: process.env.LAHMAN_PITCHING_CSV_URL || "",
  lahmanPeopleCsvUrl: process.env.LAHMAN_PEOPLE_CSV_URL || "",
  lahmanZipUrl: process.env.LAHMAN_ZIP_URL || "",
  chadwickRegisterCsvUrl: process.env.CHADWICK_REGISTER_CSV_URL || "",
  chadwickRegisterCsvUrls: process.env.CHADWICK_REGISTER_CSV_URLS || "",
  fangraphsDepthCsvUrl: process.env.FANGRAPHS_DEPTH_CSV_URL || "",
};
