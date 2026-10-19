const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  Browsers,
  jidNormalizedUser,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const QRCode = require("qrcode");
const { EventEmitter } = require("events");
const config = require("../config");
const { loadCommands } = require("./commands");
const fs = require("fs");

const state = {
  status: "idle",
  pairingCode: null,
  qr: null,
  lastError: null,
};

const bus = new EventEmitter();
const commands = loadCommands();

let sock = null;
let pendingPhoneNumber = null;
let pairingRequestedForThisSocket = false;
let consecutiveFailures = 0;

const processedMessageIds = new Set();
const PROCESSED_ID_CACHE_SIZE = 1000;
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.add(id);
  if (processedMessageIds.size > PROCESSED_ID_CACHE_SIZE) {
    processedMessageIds.delete(processedMessageIds.values().next().value);
  }
  return false;
}

const GROUP_METADATA_TTL_MS = 5 * 60 * 1000;
const groupMetadataCache = new Map();

async function getGroupMetadata(activeSock, jid, { force = false } = {}) {
  const cached = groupMetadataCache.get(jid);
  if (!force && cached && Date.now() - cached.fetchedAt < GROUP_METADATA_TTL_MS) {
    return cached.data;
  }
  const data = await activeSock.groupMetadata(jid);
  groupMetadataCache.set(jid, { data, fetchedAt: Date.now() });
  return data;
}

const MESSAGE_STORE_LIMIT = 200;
const messageStore = new Map();

function rememberMessage(key, message) {
  if
