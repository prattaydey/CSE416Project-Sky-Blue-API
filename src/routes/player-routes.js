const express = require("express");
const { valuateSinglePlayer } = require("../controllers/players-controller");

const router = express.Router();

router.post("/value", valuateSinglePlayer);

module.exports = router;
