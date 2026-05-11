const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const {
  refreshExternalCsvSources,
} = require("../../../src/services/externalDataRefreshService");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "draftkit-external-"));
}

function createTempFile(dir, name, content) {
  const fullPath = path.join(dir, name);
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

describe("services: externalDataRefreshService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads URL-backed CSV files into cache and returns resolved paths", async () => {
    const tempDir = createTempDir();
    vi.spyOn(axios, "get").mockResolvedValue({
      data: "col1,col2\n1,2\n",
    });

    const result = await refreshExternalCsvSources({
      cacheDir: tempDir,
      lahmanBattingCsvUrl: "https://example.com/Batting.csv",
    });

    expect(result.refreshedSources).toContain("lahmanBattingCsvPath");
    expect(result.failedSources).toEqual([]);
    expect(result.paths.lahmanBattingCsvPath).toBe(path.join(path.resolve(tempDir), "lahman-batting.csv"));
    expect(fs.existsSync(result.paths.lahmanBattingCsvPath)).toBe(true);
  });

  it("falls back to configured local path if URL download fails", async () => {
    const tempDir = createTempDir();
    const localCsvPath = createTempFile(tempDir, "Batting.csv", "A,B\n1,2\n");
    vi.spyOn(axios, "get").mockRejectedValue(new Error("network down"));

    const result = await refreshExternalCsvSources({
      cacheDir: tempDir,
      lahmanBattingCsvPath: localCsvPath,
      lahmanBattingCsvUrl: "https://example.com/Batting.csv",
    });

    expect(result.paths.lahmanBattingCsvPath).toBe(localCsvPath);
    expect(result.failedSources).toHaveLength(1);
    expect(result.failedSources[0].source).toBe("lahmanBattingCsvPath");
  });

  it("does not download when only local paths are provided", async () => {
    const tempDir = createTempDir();
    const localCsvPath = createTempFile(tempDir, "People.csv", "playerID,nameFirst\nx,y\n");
    const axiosSpy = vi.spyOn(axios, "get");

    const result = await refreshExternalCsvSources({
      lahmanPeopleCsvPath: localCsvPath,
    });

    expect(result.paths.lahmanPeopleCsvPath).toBe(localCsvPath);
    expect(result.refreshedSources).toEqual([]);
    expect(result.failedSources).toEqual([]);
    expect(axiosSpy).not.toHaveBeenCalled();
  });
});
