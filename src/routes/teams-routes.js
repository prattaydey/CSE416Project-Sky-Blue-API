const express = require("express");
const { getTeams, getTeamById } = require("../controllers/teams-controller");

const router = express.Router();

router.get("/", getTeams);
router.get("/:teamId", getTeamById);

module.exports = router;
