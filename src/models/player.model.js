const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    team: { type: String, required: true },
    league: { type: String },
    position: [{ type: String, required: true }],
    isPitcher: { type: Boolean, default: false },
    stats: { type: mongoose.Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
  },
);

const Player = mongoose.model("Player", playerSchema);

module.exports = Player;
