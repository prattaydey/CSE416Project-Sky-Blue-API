const express = require("express");
const {
  getPlayers,
  getPlayerById,
  createPlayer,
  getPlayerValuation,
  valuateMultiplePlayers,
  valuateAllPlayers,
} = require("../controllers/players-controller");

const router = express.Router();

router.get("/", getPlayers);
router.post("/", createPlayer);
router.post("/value", valuateMultiplePlayers);
router.post("/value/all", valuateAllPlayers);
router.get("/:playerId/valuation", getPlayerValuation);
router.get("/:playerId", getPlayerById);

module.exports = router;
