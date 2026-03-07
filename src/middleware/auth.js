const { appClientKey } = require("../config/env");

function requireAppClientKey(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token || token !== appClientKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

module.exports = {
  requireAppClientKey,
};
