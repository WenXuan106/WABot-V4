const fs = require("fs");
const path = require("path");

function loadCommands() {
  const commandsDir = path.join(__dirname, "..", "commands");
  const map = new Map();
  for (const file of fs.readdirSync(commandsDir)) {
    if (!file.endsWith(".js")) continue;
    const cmd = require(path.join(commandsDir, file));
    if (!cmd?.name || typeof cmd.execute !== "function") {
      console.warn(`Skipping invalid command file: ${file}`);
      continue;
    }
    map.set(cmd.name.toLowerCase(), cmd);
  }
  for (const cmd of new Set(map.values())) {
    for (const alias of cmd.aliases || []) {
      const key = String(alias).toLowerCase();
      if (!map.has(key)) map.set(key, cmd);
    }
  }
  return map;
}

module.exports = { loadCommands };
