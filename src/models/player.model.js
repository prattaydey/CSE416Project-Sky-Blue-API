const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  playerId: { type: Number, required: true, unique: true, index: true },
  name: { type: String, required: true },
  mlbTeamId: { type: Number, index: true },
  team: { type: String, required: true },
  league: { type: String, enum: ["AL", "NL"], index: true },
  position: [{ type: String, required: true }],
  isPitcher: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["active", "injured", "minors", "suspended", "restricted", "free_agent"],
    default: "active",
  },
  injuryStatus: { type: String, default: "" },
  lahmanId: { type: String, default: "" },
  stats: { type: mongoose.Schema.Types.Mixed, required: true },
  fetchedAt: { type: Date, required: true },
});

const Player = mongoose.model("Player", playerSchema);

module.exports = Player;
