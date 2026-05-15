const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const axios = require("axios");

const DEFAULT_CACHE_DIR = ".cache/external-data";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CHADWICK_REGISTER_URLS = "0123456789abcdef"
  .split("")
  .map((suffix) => `https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-${suffix}.csv`);

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

function normalizeUrlList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeUrl).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(normalizeUrl)
    .filter(Boolean);
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

async function downloadBuffer(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: timeoutMs,
  });
  return Buffer.from(response.data);
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const maxCommentLength = 0xffff;
  const minOffset = Math.max(0, buffer.length - (maxCommentLength + 22));

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  return -1;
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new Error("Downloaded Lahman archive is not a valid zip file");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let cursor = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Downloaded Lahman archive has an invalid central directory");
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);

    entries.set(fileName.replace(/\\/g, "/"), {
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntry(buffer, entry) {
  const localOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error("Downloaded Lahman archive has an invalid local file header");
  }

  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressed);
  }

  throw new Error(`Unsupported Lahman zip compression method: ${entry.compressionMethod}`);
}

function findZipEntry(entries, expectedName) {
  const normalizedExpected = expectedName.toLowerCase();
  const expectedBaseName = path.posix.basename(normalizedExpected);
  for (const [name, entry] of entries) {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName === normalizedExpected ||
      normalizedName.endsWith(`/${normalizedExpected}`) ||
      path.posix.basename(normalizedName) === expectedBaseName
    ) {
      return entry;
    }
  }
  return null;
}

function loadLahmanZipBuffer(options) {
  const localPath = normalizePath(options.lahmanZipPath);
  if (hasReadableFile(localPath)) {
    return {
      source: path.resolve(localPath),
      bufferPromise: Promise.resolve(fs.readFileSync(path.resolve(localPath))),
      sourceField: "lahmanZipPath",
    };
  }

  const url = normalizeUrl(options.lahmanZipUrl);
  if (!url) return null;
  return {
    source: url,
    bufferPromise: downloadBuffer(url, options.timeoutMs),
    sourceField: "lahmanZipUrl",
  };
}

async function refreshLahmanZip(options) {
  const zipSource = loadLahmanZipBuffer(options);
  if (!zipSource) return { refreshedSources: [], failedSources: [] };

  const destinationMap = {
    "core/Batting.csv": {
      pathKey: "lahmanBattingCsvPath",
      destinationPath: options.destinationPaths.lahmanBattingCsvPath,
    },
    "core/Pitching.csv": {
      pathKey: "lahmanPitchingCsvPath",
      destinationPath: options.destinationPaths.lahmanPitchingCsvPath,
    },
    "core/People.csv": {
      pathKey: "lahmanPeopleCsvPath",
      destinationPath: options.destinationPaths.lahmanPeopleCsvPath,
    },
  };

  try {
    const zipBuffer = await zipSource.bufferPromise;
    const entries = readZipEntries(zipBuffer);
    const refreshedSources = [];

    for (const [zipName, config] of Object.entries(destinationMap)) {
      const entry = findZipEntry(entries, zipName);
      if (!entry) {
        throw new Error(`Lahman archive does not contain ${zipName}`);
      }

      const payload = extractZipEntry(zipBuffer, entry).toString("utf8").replace(/^\uFEFF/, "");
      assertCsvLikePayload(payload, `${zipSource.source}#${zipName}`);
      ensureDirectory(path.dirname(config.destinationPath));
      writeTextFileAtomic(config.destinationPath, payload);
      refreshedSources.push(config.pathKey);
    }

    return { refreshedSources, failedSources: [] };
  } catch (error) {
    return {
      refreshedSources: [],
      failedSources: [
        {
          source: zipSource.sourceField,
          url: zipSource.source,
          error: error?.message || "Unknown Lahman zip download error",
        },
      ],
    };
  }
}

async function refreshChadwickRegister(options) {
  const configuredPath = normalizePath(options.chadwickRegisterCsvPath);
  const explicitUrl = normalizeUrl(options.chadwickRegisterCsvUrl);
  const urlList = normalizeUrlList(options.chadwickRegisterCsvUrls);

  if (explicitUrl || urlList.length === 0 && configuredPath) {
    return null;
  }

  const urls = urlList.length > 0 ? urlList : DEFAULT_CHADWICK_REGISTER_URLS;
  const destinationPath = options.destinationPath;

  try {
    const payloads = [];
    let header = "";

    for (const url of urls) {
      const response = await axios.get(url, {
        responseType: "text",
        timeout: options.timeoutMs,
      });
      const payload = typeof response.data === "string" ? response.data : String(response.data || "");
      assertCsvLikePayload(payload, url);
      const lines = payload.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
      if (lines.length === 0) continue;
      if (!header) {
        header = lines[0];
        payloads.push(header);
      }
      payloads.push(...lines.slice(1));
    }

    if (!header || payloads.length <= 1) {
      throw new Error("Downloaded Chadwick register files did not contain rows");
    }

    ensureDirectory(path.dirname(destinationPath));
    writeTextFileAtomic(destinationPath, `${payloads.join("\n")}\n`);
    return {
      path: destinationPath,
      refreshedSources: ["chadwickRegisterCsvPath"],
      failedSources: [],
    };
  } catch (error) {
    return {
      path: hasReadableFile(configuredPath) ? configuredPath : "",
      refreshedSources: [],
      failedSources: [
        {
          source: "chadwickRegisterCsvPath",
          url: urls.join(","),
          error: error?.message || "Unknown Chadwick register download error",
        },
      ],
    };
  }
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

  const defaultDestinationPaths = Object.fromEntries(
    EXTERNAL_CSV_SOURCES.map((source) => [source.pathKey, path.join(cacheDir, source.fileName)]),
  );

  const lahmanZipRefresh = await refreshLahmanZip({
    lahmanZipPath: options.lahmanZipPath,
    lahmanZipUrl: options.lahmanZipUrl,
    timeoutMs,
    destinationPaths: defaultDestinationPaths,
  });
  refreshedSources.push(...lahmanZipRefresh.refreshedSources);
  failedSources.push(...lahmanZipRefresh.failedSources);

  const chadwickRegisterRefresh = await refreshChadwickRegister({
    chadwickRegisterCsvPath: options.chadwickRegisterCsvPath,
    chadwickRegisterCsvUrl: options.chadwickRegisterCsvUrl,
    chadwickRegisterCsvUrls: options.chadwickRegisterCsvUrls,
    destinationPath: defaultDestinationPaths.chadwickRegisterCsvPath,
    timeoutMs,
  });

  for (const source of EXTERNAL_CSV_SOURCES) {
    const configuredPath = normalizePath(options[source.pathKey]);
    const configuredUrl = normalizeUrl(options[source.urlKey]);

    let selectedPath = configuredPath;
    if (chadwickRegisterRefresh && source.pathKey === "chadwickRegisterCsvPath") {
      selectedPath = chadwickRegisterRefresh.path;
      refreshedSources.push(...chadwickRegisterRefresh.refreshedSources);
      failedSources.push(...chadwickRegisterRefresh.failedSources);
      paths[source.pathKey] = selectedPath;
      continue;
    }

    if (hasReadableFile(defaultDestinationPaths[source.pathKey])) {
      selectedPath = defaultDestinationPaths[source.pathKey];
    }

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
