const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "user-languages.json");
let cache = null;

function readAll() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    cache = parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    cache = {};
  }
  return cache;
}

function getLanguage(userId) {
  return readAll()[String(userId || "")] === "ja" ? "ja" : "en";
}

function setLanguage(userId, language) {
  const id = String(userId || "");
  if (!id) return false;
  const all = readAll();
  all[id] = language === "ja" ? "ja" : "en";
  try {
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2) + "\n");
    return true;
  } catch (error) {
    console.error("Could not save user language:", error.message);
    return false;
  }
}

module.exports = { getLanguage, setLanguage };
