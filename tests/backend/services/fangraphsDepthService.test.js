const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadFangraphsDepthOverrides } = require("../../../src/services/fangraphsDepthService");

function createTempFile(fileName, content) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "draftkit-fg-"));
  const fullPath = path.join(tempDir, fileName);
  fs.writeFileSync(fullPath, content, "utf8");
  return { tempDir, fullPath };
}

function cleanupTempDir(tempDir) {
  if (!tempDir || !fs.existsSync(tempDir)) return;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

describe("services: fangraphsDepthService", () => {
  it("maps FanGraphs player IDs to MLB IDs and computes depth ranks", () => {
    const depthCsv = [
      "playerid,Team,Pos,PA,IP",
      "10155,LAA,CF,650,0",
      "20222,LAA,LF,400,0",
      "10954,NYM,SP,0,180",
    ].join("\n");
    const chadwickCsv = [
      "key_mlbam,key_bbref,key_fangraphs,name_first,name_last,birth_year",
      "545361,troutmi01,10155,Mike,Trout,1991",
      "123456,testpl01,20222,Test,Player,1994",
      "594798,degroja01,10954,Jacob,deGrom,1988",
    ].join("\n");

    const tmpDepth = createTempFile("fg_depth.csv", depthCsv);
    const tmpChadwick = createTempFile("register.csv", chadwickCsv);

    try {
      const result = loadFangraphsDepthOverrides({
        fangraphsDepthCsvPath: tmpDepth.fullPath,
        chadwickRegisterCsvPath: tmpChadwick.fullPath,
      });

      expect(result.depthOverrides).toBe(3);
      expect(result.depthByMlbId.get(545361)).toBe(1);
      expect(result.depthByMlbId.get(123456)).toBe(2);
      expect(result.depthByMlbId.get(594798)).toBe(1);
    } finally {
      cleanupTempDir(tmpDepth.tempDir);
      cleanupTempDir(tmpChadwick.tempDir);
    }
  });
});
