const axios = require('axios');

const API = 'https://api.github.com';
const TOKEN = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
const GIST_ID = String(
  process.env.SCORES_GIST_ID ||
  process.env.GIST_ID ||
  process.env.GITHUB_GIST_ID ||
  ''
).trim();

const client = axios.create({
  baseURL: API,
  timeout: 15000,
  headers: {
    Accept: 'application/vnd.github+json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    'X-GitHub-Api-Version': '2022-11-28',
  },
});

let resolvedFilename = String(process.env.PLAYERS_GIST_FILENAME || '').trim() || null;

function isConfigured() {
  return Boolean(TOKEN && GIST_ID);
}

function parseUsersFile(content) {
  try {
    const value = JSON.parse(content);
    return value && typeof value === 'object' && !Array.isArray(value) &&
      value.users && typeof value.users === 'object' && !Array.isArray(value.users);
  } catch (_) {
    return false;
  }
}

async function getGist() {
  if (!isConfigured()) {
    throw new Error('Set GITHUB_TOKEN and SCORES_GIST_ID (or GIST_ID) environment variables');
  }
  const response = await client.get(`/gists/${encodeURIComponent(GIST_ID)}`);
  return response.data;
}

function chooseFilename(files, requested) {
  if (requested && files[requested]) return requested;
  if (resolvedFilename && files[resolvedFilename]) return resolvedFilename;

  const names = Object.keys(files || {});
  const jsonNames = names.filter((name) => name.toLowerCase().endsWith('.json'));

  for (const name of jsonNames) {
    const content = files[name] && files[name].content;
    if (typeof content === 'string' && parseUsersFile(content)) return name;
  }

  if (jsonNames.length === 1) return jsonNames[0];
  if (requested) return requested;
  return 'players.json';
}

async function fetchFile(filename = 'players.json') {
  const gist = await getGist();
  const files = gist.files || {};
  const chosen = chooseFilename(files, filename);
  if (!files[chosen]) {
    const existingJson = Object.keys(files).filter((name) => name.toLowerCase().endsWith('.json'));
    if (existingJson.length) {
      throw new Error(`No JSON file with a "users" object was found in the Gist. Set PLAYERS_GIST_FILENAME to the correct filename (available: ${existingJson.join(', ')}).`);
    }
    resolvedFilename = chosen;
    return null;
  }

  const content = files[chosen].content;
  if (typeof content !== 'string') {
    throw new Error(`Gist file "${chosen}" is too large or unavailable through the GitHub API`);
  }
  if (!parseUsersFile(content)) {
    throw new Error(`Gist file "${chosen}" does not contain the expected {"users": {}} structure`);
  }
  resolvedFilename = chosen;
  return content;
}

async function pushFile(filename = 'players.json', content) {
  if (typeof content !== 'string' || !parseUsersFile(content)) {
    throw new Error('Refusing to save player data: content must be valid JSON with a "users" object');
  }

  const gist = await getGist();
  const files = gist.files || {};
  const chosen = chooseFilename(files, filename);
  await client.patch(`/gists/${encodeURIComponent(GIST_ID)}`, {
    files: { [chosen]: { content } },
  });
  resolvedFilename = chosen;
  return chosen;
}

module.exports = { isConfigured, fetchFile, pushFile };
