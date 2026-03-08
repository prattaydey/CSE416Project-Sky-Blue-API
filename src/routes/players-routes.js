const express = require("express");
const {
  getPlayers,
  getPlayerById,
} = require("../controllers/players-controller");

const router = express.Router();

router.get("/", getPlayers);
router.get("/:playerId", getPlayerById);

module.exports = router;
