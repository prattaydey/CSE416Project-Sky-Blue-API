const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DEFAULT_CACHE_DIR = ".cache/external-data";
const DEFAULT_TIMEOUT_MS = 30000;

const EXTERNAL_CSV_SOURCES = [
  {
    pathKey: "lahmanBattingCsvPath",
    urlKey: "lahmanBattingCsvUrl",
    fileName: "lahman-batting.csv",
  },
  {
    pathKey: "lahmanPitchingCsvPath",
    urlKey: "lahmanPitchingCsvUrl",
    fileName: "lahman-pitching.csv",
  },
  {
    pathKey: "lahmanPeopleCsvPath",
    urlKey: "lahmanPeopleCsvUrl",
    fileName: "lahman-people.csv",
  },
  {
    pathKey: "chadwickRegisterCsvPath",
    urlKey: "chadwickRegisterCsvUrl",
    fileName: "chadwick-register.csv",
  },
  {
    pathKey: "fangraphsDepthCsvPath",
    urlKey: "fangraphsDepthCsvUrl",
    fileName: "fangraphs-depth.csv",
  },
];

function normalizePath(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed;
}

function hasReadableFile(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(targetPath);
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFileAtomic(filePath, content) {
  const tmpFilePath = `${filePath}.tmp`;
  fs.writeFileSync(tmpFilePath, content, "utf8");
  fs.renameSync(tmpFilePath, filePath);
}

function assertCsvLikePayload(payload, sourceUrl) {
  if (typeof payload !== "string" || payload.trim() === "") {
    throw new Error(`Downloaded content from ${sourceUrl} is empty`);
  }

  const firstLine = payload.split(/\r?\n/, 1)[0] || "";
  if (!firstLine.includes(",")) {
    throw new Error(`Downloaded content from ${sourceUrl} does not look like CSV`);
  }
}

async function downloadCsvToPath(url, destinationPath, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await axios.get(url, {
    responseType: "text",
    timeout: timeoutMs,
  });

  const payload = typeof response.data === "string" ? response.data : String(response.data || "");
  assertCsvLikePayload(payload, url);

  ensureDirectory(path.dirname(destinationPath));
  writeTextFileAtomic(destinationPath, payload);
  return destinationPath;
}

async function refreshExternalCsvSources(options = {}) {
  const cacheRoot = normalizePath(options.cacheDir) || DEFAULT_CACHE_DIR;
  const cacheDir = path.resolve(cacheRoot);
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;

  const paths = {};
  const refreshedSources = [];
  const failedSources = [];

  for (const source of EXTERNAL_CSV_SOURCES) {
    const configuredPath = normalizePath(options[source.pathKey]);
    const configuredUrl = normalizeUrl(options[source.urlKey]);

    let selectedPath = configuredPath;
    if (configuredUrl) {
      const destinationPath = path.join(cacheDir, source.fileName);
      try {
        await downloadCsvToPath(configuredUrl, destinationPath, timeoutMs);
        selectedPath = destinationPath;
        refreshedSources.push(source.pathKey);
      } catch (error) {
        failedSources.push({
          source: source.pathKey,
          url: configuredUrl,
          error: error?.message || "Unknown download error",
        });
        if (!hasReadableFile(configuredPath)) {
          selectedPath = "";
        }
      }
    }

    paths[source.pathKey] = selectedPath;
  }

  return {
    cacheDir,
    paths,
    refreshedSources,
    failedSources,
  };
}

module.exports = {
  refreshExternalCsvSources,
  downloadCsvToPath,
  EXTERNAL_CSV_SOURCES,
};
