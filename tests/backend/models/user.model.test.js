const User = require("../../../src/models/user.model");

describe("models: User", () => {
  it("accepts a valid user document", () => {
    const doc = new User({
      username: "test-user",
      passwordHash: "hashed-password",
      apiKey: "api-key-123",
    });

    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it("rejects missing username", () => {
    const doc = new User({
      passwordHash: "hashed-password",
      apiKey: "api-key-123",
    });

    const err = doc.validateSync();
    expect(err.errors.username).toBeDefined();
  });

  it("rejects missing apiKey", () => {
    const doc = new User({
      username: "test-user",
      passwordHash: "hashed-password",
    });

    const err = doc.validateSync();
    expect(err.errors.apiKey).toBeDefined();
  });
});
