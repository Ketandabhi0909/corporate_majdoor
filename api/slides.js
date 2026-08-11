const fs = require("fs");
const path = require("path");

const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"]);

function findDataDir() {
  const candidates = [
    path.join(process.cwd(), "data"),
    path.join(__dirname, "..", "data"),
    path.join(__dirname, "data"),
  ];
  return candidates.find((dir) => fs.existsSync(dir));
}

module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const dir = findDataDir();
  if (!dir) {
    res.status(200).json([]);
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((file) => {
      const full = path.join(dir, file);
      return fs.statSync(full).isFile() && ALLOWED.has(path.extname(file).toLowerCase());
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((file) => "data/" + encodeURIComponent(file));

  res.status(200).json(files);
};
