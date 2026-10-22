const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'group-state.json');
function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return {}; }
}
function write(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}
function isSlipperOn(chatId) { return read()[String(chatId)]?.slipperOff === true; }
function setSlipperOff(chatId, off) {
  const data = read();
  const key = String(chatId);
  data[key] = { ...(data[key] || {}), slipperOff: Boolean(off) };
  write(data);
}
function getAsianParent(chatId) { return read()[String(chatId)]?.asianParent || { enabled: false, words: [] }; }
function setAsianParent(chatId, value) {
  const data = read();
  const key = String(chatId);
  data[key] = { ...(data[key] || {}), asianParent: value };
  write(data);
}
module.exports = { isSlipperOn, setSlipperOff, getAsianParent, setAsianParent };
