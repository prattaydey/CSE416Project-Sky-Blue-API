const jwt = require("jsonwebtoken");
const User = require("../../../src/models/user.model");
const { requireAppClientKey, requireJwtAuth } = require("../../../src/middleware/auth");
const { createMockReq, createMockRes } = require("../helpers/httpMocks");
const originalFindOne = User.findOne;
const originalFindById = User.findById;

describe("services: auth middleware helpers", () => {
  afterEach(() => {
    User.findOne = originalFindOne;
    User.findById = originalFindById;
    vi.restoreAllMocks();
  });

  it("rejects missing Authorization header for app client key auth", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await requireAppClientKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts valid global app client key", async () => {
    const req = createMockReq({
      get: (name) => (String(name).toLowerCase() === "authorization" ? "Bearer test-app-client-key" : ""),
    });
    const res = createMockRes();
    const next = vi.fn();

    await requireAppClientKey(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.payload).toBeNull();
  });

  it("accepts valid per-user API key and attaches req.apiUser", async () => {
    const user = { _id: "u1", username: "tester" };
    User.findOne = vi.fn().mockResolvedValue(user);

    const req = createMockReq({
      get: (name) => (String(name).toLowerCase() === "authorization" ? "Bearer user-api-key-1" : ""),
    });
    const res = createMockRes();
    const next = vi.fn();

    await requireAppClientKey(req, res, next);

    expect(User.findOne).toHaveBeenCalledWith({ apiKey: "user-api-key-1" });
    expect(req.apiUser).toBe(user);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects invalid per-user API key", async () => {
    User.findOne = vi.fn().mockResolvedValue(null);

    const req = createMockReq({
      get: (name) => (String(name).toLowerCase() === "authorization" ? "Bearer invalid-key" : ""),
    });
    const res = createMockRes();
    const next = vi.fn();

    await requireAppClientKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Invalid API key" });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes lookup errors to next() in app key middleware", async () => {
    const dbError = new Error("db failure");
    User.findOne = vi.fn().mockRejectedValue(dbError);

    const req = createMockReq({
      get: (name) => (String(name).toLowerCase() === "authorization" ? "Bearer key" : ""),
    });
    const res = createMockRes();
    const next = vi.fn();

    await requireAppClientKey(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });

  it("rejects missing Authorization header for JWT auth", async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await requireJwtAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts valid JWT and attaches req.user", async () => {
    vi.spyOn(jwt, "verify").mockReturnValue({ userId: "507f1f77bcf86cd799439011" });
    const user = { _id: "507f1f77bcf86cd799439011", username: "tester" };
    User.findById = vi.fn().mockResolvedValue(user);

    const req = createMockReq({
      get: (name) => (String(name).toLowerCase() === "authorization" ? "Bearer valid-token" : ""),
    });
    const res = createMockRes();
    const next = vi.fn();

    await requireJwtAuth(req, res, next);

    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects token when jwt verify throws", async () => {
    vi.spyOn(jwt, "verify").mockImplementation(() => {
      throw new Error("bad token");
    });

    const req = createMockReq({
      get: (name) => (String(name).toLowerCase() === "authorization" ? "Bearer bad-token" : ""),
    });
    const res = createMockRes();
    const next = vi.fn();

    await requireJwtAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects token when user no longer exists", async () => {
    vi.spyOn(jwt, "verify").mockReturnValue({ userId: "507f1f77bcf86cd799439011" });
    User.findById = vi.fn().mockResolvedValue(null);

    const req = createMockReq({
      get: (name) => (String(name).toLowerCase() === "authorization" ? "Bearer valid-token" : ""),
    });
    const res = createMockRes();
    const next = vi.fn();

    await requireJwtAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });
});
