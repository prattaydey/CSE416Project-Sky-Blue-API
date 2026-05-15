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

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const fileName = Buffer.from(name);
    const data = Buffer.from(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, fileName, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, fileName);

    offset += localHeader.length + fileName.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectoryOffset = offset;
  const entryCount = Object.keys(entries).length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entryCount, 8);
  eocd.writeUInt16LE(entryCount, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
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
      chadwickRegisterCsvPath: createTempFile(tempDir, "chadwick.csv", "key_mlbam,key_bbref\n1,a\n"),
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
      chadwickRegisterCsvPath: createTempFile(tempDir, "chadwick.csv", "key_mlbam,key_bbref\n1,a\n"),
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
      chadwickRegisterCsvPath: createTempFile(tempDir, "chadwick.csv", "key_mlbam,key_bbref\n1,a\n"),
    });

    expect(result.paths.lahmanPeopleCsvPath).toBe(localCsvPath);
    expect(result.refreshedSources).toEqual([]);
    expect(result.failedSources).toEqual([]);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  it("extracts Lahman core CSVs from a configured zip archive", async () => {
    const tempDir = createTempDir();
    vi.spyOn(axios, "get").mockResolvedValue({
      data: createStoredZip({
        "lahman/core/Batting.csv": "playerID,yearID,H\nbettm001,2024,170\n",
        "lahman/core/Pitching.csv": "playerID,yearID,W\ncoleg001,2024,15\n",
        "lahman/core/People.csv": "playerID,birthYear\nbettm001,1992\n",
      }),
    });

    const result = await refreshExternalCsvSources({
      cacheDir: tempDir,
      lahmanZipUrl: "https://example.com/lahman.zip",
      chadwickRegisterCsvPath: createTempFile(tempDir, "chadwick.csv", "key_mlbam,key_bbref\n1,a\n"),
    });

    expect(result.failedSources).toEqual([]);
    expect(result.refreshedSources).toEqual(expect.arrayContaining([
      "lahmanBattingCsvPath",
      "lahmanPitchingCsvPath",
      "lahmanPeopleCsvPath",
    ]));
    expect(fs.readFileSync(result.paths.lahmanBattingCsvPath, "utf8")).toContain("bettm001");
    expect(fs.readFileSync(result.paths.lahmanPitchingCsvPath, "utf8")).toContain("coleg001");
    expect(fs.readFileSync(result.paths.lahmanPeopleCsvPath, "utf8")).toContain("birthYear");
  });

  it("extracts Lahman core CSVs from a local zip path", async () => {
    const tempDir = createTempDir();
    const zipPath = path.join(tempDir, "lahman.zip");
    fs.writeFileSync(zipPath, createStoredZip({
      "core/Batting.csv": "playerID,yearID,H\nbettm001,2024,170\n",
      "core/Pitching.csv": "playerID,yearID,W\ncoleg001,2024,15\n",
      "core/People.csv": "playerID,birthYear\nbettm001,1992\n",
    }));
    const axiosSpy = vi.spyOn(axios, "get");

    const result = await refreshExternalCsvSources({
      cacheDir: path.join(tempDir, "cache"),
      lahmanZipPath: zipPath,
      chadwickRegisterCsvPath: createTempFile(tempDir, "chadwick.csv", "key_mlbam,key_bbref\n1,a\n"),
    });

    expect(result.failedSources).toEqual([]);
    expect(result.refreshedSources).toEqual(expect.arrayContaining([
      "lahmanBattingCsvPath",
      "lahmanPitchingCsvPath",
      "lahmanPeopleCsvPath",
    ]));
    expect(fs.readFileSync(result.paths.lahmanBattingCsvPath, "utf8")).toContain("bettm001");
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  it("combines split Chadwick register CSV URLs into one cache file", async () => {
    const tempDir = createTempDir();
    const responses = [
      { data: "key_mlbam,key_bbref,key_fangraphs\n1,alpha,11\n" },
      { data: "key_mlbam,key_bbref,key_fangraphs\n2,beta,22\n" },
    ];
    vi.spyOn(axios, "get").mockImplementation(async () => responses.shift());

    const result = await refreshExternalCsvSources({
      cacheDir: tempDir,
      chadwickRegisterCsvUrls: "https://example.com/people-0.csv,https://example.com/people-1.csv",
    });

    expect(result.failedSources).toEqual([]);
    expect(result.refreshedSources).toContain("chadwickRegisterCsvPath");
    expect(fs.readFileSync(result.paths.chadwickRegisterCsvPath, "utf8")).toBe(
      "key_mlbam,key_bbref,key_fangraphs\n1,alpha,11\n2,beta,22\n",
    );
  });
});
