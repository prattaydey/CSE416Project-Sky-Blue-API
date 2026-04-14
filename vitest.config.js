const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.js"],
    environmentMatchGlobs: [
      ["tests/frontend/**", "jsdom"],
      ["tests/backend/**", "node"],
    ],
    setupFiles: ["./tests/setup/backend.setup.js"],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.js"],
      exclude: ["src/server.js", "src/data/**"],
    },
  },
});
