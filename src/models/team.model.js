const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema({
  mlbTeamId: { type: Number, required: true, unique: true, index: true },
  name: { type: String, required: true },
  abbreviation: { type: String, required: true, unique: true },
  league: { type: String, enum: ["AL", "NL"], required: true },
  division: { type: String, enum: ["East", "Central", "West"], required: true },
  city: { type: String, required: true },
  depthChart: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now },
});

const Team = mongoose.model("Team", teamSchema);

module.exports = Team;
