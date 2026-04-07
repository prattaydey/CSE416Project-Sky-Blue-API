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

async function start() {
  await connectMongo(env.mongodbUri);
  await seedTeamsCatalog();
  await seedPlayersCatalog();
  app.listen(env.port, () => {
    console.log(`DraftKit API listening on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
