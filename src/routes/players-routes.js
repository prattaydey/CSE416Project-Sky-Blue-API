const express = require("express");
const {
  getPlayers,
  getPlayerById,
  valuateMultiplePlayers,
  valuateAllPlayers,
} = require("../controllers/players-controller");

const router = express.Router();

router.get("/", getPlayers);
router.post("/value", valuateMultiplePlayers);
router.post("/value/all", valuateAllPlayers);
router.get("/:playerId", getPlayerById);

module.exports = router;
