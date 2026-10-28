const fs = require('fs');
const path = require('path');
const gist = require('./gistsync');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'players.json');
const REMOTE_FILE = 'players.json';
const PUSH_DELAY_MS = 5000;
const RETRY_MS = 30000;

let data = null;
let initPromise = null;
let remoteEnabled = false;
let remoteDirty = false;
let remotePushing = false;
let remoteTimer = null;

function keyFor(id) {
  return String(id || 'unknown').split('@')[0].split(':')[0].replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'unknown';
}

function normalise(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error = new Error('players.json must contain a JSON object');
    error.isCorrupt = true;
    throw error;
  }
  if (parsed.users !== undefined && (!parsed.users || typeof parsed.users !== 'object' || Array.isArray(parsed.users))) {
    const error = new Error('players.json "users" must be an object');
    error.isCorrupt = true;
    throw error;
  }
  return { ...parsed, users: parsed.users || {} };
}

function loadLocal() {
  try {
    data = normalise(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (_) {
    data = { users: {} };
  }
  return data;
}

function saveLocal() {
  if (!data) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, DATA_FILE);
  } catch (err) {
    console.error('Player data: local save failed:', err.message);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function scheduleRemotePush() {
  if (!remoteEnabled) return;
  remoteDirty = true;
  if (remoteTimer || remotePushing) return;
  remoteTimer = setTimeout(pushRemote, PUSH_DELAY_MS);
}

async function pushRemote() {
  remoteTimer = null;
  if (!remoteEnabled || remotePushing || !remoteDirty) return;
  remotePushing = true;
  remoteDirty = false;
  try {
    await gist.pushFile(REMOTE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    remoteDirty = true;
    console.error(`Player data: couldn't save ${REMOTE_FILE} to GitHub Gist (${err.message}); retrying later.`);
    remoteTimer = setTimeout(pushRemote, RETRY_MS);
  } finally {
    remotePushing = false;
    if (remoteDirty && !remoteTimer) remoteTimer = setTimeout(pushRemote, PUSH_DELAY_MS);
  }
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!gist.isConfigured()) {
      loadLocal();
      console.log('Player data: GitHub Gist is not configured; using local data/players.json.');
      return;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const content = await gist.fetchFile(REMOTE_FILE);
        if (content == null || !String(content).trim()) {
          data = { users: {} };
        } else {
          try {
            data = normalise(JSON.parse(content));
          } catch (err) {
            err.isCorrupt = true;
            throw err;
          }
        }
        remoteEnabled = true;
        saveLocal();
        console.log(`Player data loaded from GitHub Gist (${Object.keys(data.users).length} players).`);
        return;
      } catch (err) {
        const status = err.response && err.response.status;
        const permanent = err.isCorrupt || status === 401 || status === 403 || status === 404;
        console.error(`Player data: couldn't read GitHub Gist (${status ? `HTTP ${status}` : err.message}).`);
        if (permanent || attempt === 3) break;
        await sleep(1000 * attempt);
      }
    }
    // Do not push local empty data after a failed remote read: it could overwrite good data.
    loadLocal();
    console.error('Player data: Gist sync is disabled for this run; local storage will be used to protect the remote copy.');
  })();
  return initPromise;
}

function defaultPlayer(id, name) {
  return {
    id: keyFor(id),
    name: String(name || 'Player').slice(0, 40),
    xp: 0,
    coins: 100,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    bestStreak: 0,
    lastPlayedAt: null,
  };
}

function getPlayer(id, name) {
  if (!data) loadLocal();
  const key = keyFor(id);
  const player = { ...defaultPlayer(id, name), ...(data.users[key] || {}) };
  if (name && (!player.name || player.name === 'Player')) player.name = String(name).slice(0, 40);
  return player;
}

function savePlayer(id, name, changes = {}) {
  if (!data) loadLocal();
  const key = keyFor(id);
  const previous = data.users[key] || {};
  const player = { ...defaultPlayer(id, name), ...previous, ...changes, id: key };
  if (name) player.name = String(name).slice(0, 40);
  data.users[key] = player;
  saveLocal();
  scheduleRemotePush();
  return player;
}

function recordGame(id, name, result, coinDelta = 0, xpDelta = 0) {
  const player = getPlayer(id, name);
  const isWin = result === 'win';
  const isLoss = result === 'loss';
  const isDraw = result === 'draw';
  const streak = isWin ? player.streak + 1 : 0;
  return savePlayer(id, name, {
    gamesPlayed: player.gamesPlayed + 1,
    wins: player.wins + (isWin ? 1 : 0),
    losses: player.losses + (isLoss ? 1 : 0),
    draws: player.draws + (isDraw ? 1 : 0),
    streak,
    bestStreak: Math.max(player.bestStreak || 0, streak),
    coins: Math.max(0, player.coins + coinDelta),
    xp: Math.max(0, player.xp + xpDelta),
    lastPlayedAt: new Date().toISOString(),
  });
}

function levelFor(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

function xpForNextLevel(level) {
  return level * level * 100;
}

module.exports = { init, getPlayer, savePlayer, recordGame, levelFor, xpForNextLevel, keyFor };
