const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const { appClientKey, jwtSecret } = require("../config/env");

// Verfies that the request is coming from the global DraftKit App platform key (checks .env)
// OR an individual user's API key (checks Mongo database)
async function requireAppClientKey(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (token === appClientKey) {
    return next();
  }

  try {
    const user = await User.findOne({ apiKey: token });
    if (!user) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.apiUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireJwtAuth(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.userId);

    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = {
  requireAppClientKey,
  requireJwtAuth,
};