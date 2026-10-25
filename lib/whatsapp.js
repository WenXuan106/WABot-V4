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
const { isSlipperOn, getAsianParent } = require("./group-state");

const state = {
  status: "idle",
  pairingCode: null,
  qr: null, 
  lastError: null,
};

const bus = new EventEmitter();
const commands = loadCommands();

const fs = require("fs");

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
  if (!key?.id || !message) return;
  messageStore.set(key.id, message);
  if (messageStore.size > MESSAGE_STORE_LIMIT) {
    messageStore.delete(messageStore.keys().next().value);
  }
}

function createSimpleCache() {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    set: (k, v) => map.set(k, v),
    del: (k) => map.delete(k),
    flushAll: () => map.clear(),
  };
}
const msgRetryCounterCache = createSimpleCache();

let cachedAuthState = null;
let cachedSaveCreds = null;

async function loadAuth() {
  if (!cachedAuthState) {
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, "..", config.AUTH_FOLDER)
    );
    cachedAuthState = state;
    cachedSaveCreds = saveCreds;
  }
  return { authState: cachedAuthState, saveCreds: cachedSaveCreds };
}

function resetAuth() {
  cachedAuthState = null;
  cachedSaveCreds = null;
  try {
    fs.rmSync(path.join(__dirname, "..", config.AUTH_FOLDER), { recursive: true, force: true });
  } catch (_) {}
}

function setState(patch) {
  Object.assign(state, patch);
  bus.emit("update", state);
}

async function requestPairingCodeWithRetry(activeSock, phoneNumber, attempts = 4) {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    await new Promise((r) => setTimeout(r, i === 1 ? 2000 : 2500));
    try {
      return await activeSock.requestPairingCode(digits);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function startSocket({ phoneNumber, forceReset = false } = {}) {
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(new Error("Restarting socket"));
    } catch (_) {}
    sock = null;
  }

  if (forceReset) {
    resetAuth();
    pendingPhoneNumber = null;
    pairingRequestedForThisSocket = false;
  }

  if (phoneNumber) {
    pendingPhoneNumber = phoneNumber;
    pairingRequestedForThisSocket = false;
  } else if (!forceReset) {
    pendingPhoneNumber = null;
  }

  const { authState, saveCreds } = await loadAuth();
  let version;
  try {
    ({ version } = await fetchLatestWaWebVersion());
  } catch (err) {
    console.warn("fetchLatestWaWebVersion failed, falling back:", err.message);
    ({ version } = await fetchLatestBaileysVersion());
  }

  const newSock = makeWASocket({
    version,
    auth: authState,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    msgRetryCounterCache,
    defaultQueryTimeoutMs: 120000,
    shouldSyncHistoryMessage: () => false,
    cachedGroupMetadata: (jid) => getGroupMetadata(newSock, jid),
    getMessage: async (key) => messageStore.get(key.id),
  });
  sock = newSock;

  if (pendingPhoneNumber && !newSock.authState.creds.registered && !pairingRequestedForThisSocket) {
    pairingRequestedForThisSocket = true;
    requestPairingCodeWithRetry(newSock, pendingPhoneNumber)
      .then((code) => {
        setState({ status: "awaiting_code", pairingCode: code, lastError: null });
      })
      .catch((err) => {
        setState({ status: "disconnected", lastError: err.message });
      });
  }

  const originalSendMessage = newSock.sendMessage.bind(newSock);
  newSock.sendMessage = async (...sendArgs) => {
    const sent = await originalSendMessage(...sendArgs);
    if (sent?.key && sent?.message) rememberMessage(sent.key, sent.message);
    return sent;
  };

  newSock.ev.on("creds.update", saveCreds);

  newSock.ev.on("groups.update", async ([update]) => {
    if (!update?.id) return;
    try {
      await getGroupMetadata(newSock, update.id, { force: true });
    } catch (_) {}
  });
  newSock.ev.on("group-participants.update", async ({ id }) => {
    try {
      await getGroupMetadata(newSock, id, { force: true });
    } catch (_) {}
  });

  newSock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pendingPhoneNumber) {
      QRCode.toDataURL(qr)
        .then((dataUrl) => setState({ status: "awaiting_qr", qr: dataUrl, lastError: null }))
        .catch((err) => setState({ status: "disconnected", lastError: err.message }));
    }

    if (connection === "open") {
      pendingPhoneNumber = null;
      consecutiveFailures = 0;
      setState({ status: "connected", pairingCode: null, qr: null, lastError: null });
      console.log("WhatsApp connected.");
    }

    if (connection === "close") {
      const boomError = new Boom(lastDisconnect?.error);
      const statusCode = boomError?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const isExpectedRestart = statusCode === DisconnectReason.restartRequired;

      if (loggedOut) {
        resetAuth();
        setState({ status: "disconnected", pairingCode: null });
        console.log("Logged out. Re-pair from the website to reconnect.");
        return;
      }

      if (!isExpectedRestart) {
        setState({ status: "disconnected" });
      }

      console.log(
        isExpectedRestart
          ? "Restart required, reconnecting…"
          : `Connection closed (code: ${statusCode ?? "unknown"}, reason: ${boomError?.message || "unknown"}), reconnecting…`
      );

      if (isExpectedRestart) {
        consecutiveFailures = 0;
        startSocket().catch((err) => setState({ status: "disconnected", lastError: err.message }));
      } else {
        consecutiveFailures += 1;
        const delayMs = Math.min(30000, 1000 * 2 ** (consecutiveFailures - 1));
        console.log(`Waiting ${delayMs}ms before reconnect attempt #${consecutiveFailures}…`);
        setTimeout(() => {
          startSocket().catch((err) => setState({ status: "disconnected", lastError: err.message }));
        }, delayMs);
      }
    }
  });

  newSock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      const msg = messages[0];
      const debugJid = msg?.key?.remoteJid;
      console.log(
        `messages.upsert: type=${type} jid=${debugJid} fromMe=${msg?.key?.fromMe} hasMessage=${!!msg?.message}`
      );

      if (type !== "notify") return;
      if (!msg?.message) return;
      if (alreadyProcessed(msg.key?.id)) {
        console.log(`messages.upsert: skipping duplicate delivery of ${msg.key?.id}`);
        return;
      }

      rememberMessage(msg.key, msg.message);

      const jid = msg.key.remoteJid;

      const messageContent =
        msg.message.deviceSentMessage?.message || msg.message.ephemeralMessage?.message || msg.message;
      const text =
        messageContent.conversation ||
        messageContent.extendedTextMessage?.text ||
        messageContent.imageMessage?.caption ||
        messageContent.documentMessage?.caption ||
        messageContent.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        "";

      console.log(`messages.upsert: text=${JSON.stringify(text)} prefix=${config.PREFIX}`);

      if (await handlePrefixlessTrigger(newSock, msg, jid, text)) return;

      if (jid.endsWith("@g.us") && text && !text.startsWith(config.PREFIX)) {
        const parentConfig = getAsianParent(jid);
        if (parentConfig.enabled) {
          const builtIn = ["fuck", "shit", "bitch", "asshole", "bastard", "motherfucker", "wtf", "stfu"];
          const words = [...builtIn, ...(Array.isArray(parentConfig.words) ? parentConfig.words : [])];
          const escaped = (word) => String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const bad = words.some((word) => {
            const value = String(word || "").trim();
            if (!value) return false;
            const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped(value).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{N}_])`, "iu");
            return pattern.test(text);
          });
          if (bad) {
            try {
              const metadata = await getGroupMetadata(newSock, jid, { force: true });
              const senderJid = msg.key.participant || msg.key.participantAlt || msg.key.senderPn || msg.key.remoteJidAlt;
              const normalizeJid = (value) => {
                if (!value) return "";
                try { return jidNormalizedUser(String(value)).split(":")[0].toLowerCase(); }
                catch (_) { return String(value).split(":")[0].toLowerCase(); }
              };
              const aliases = (participant) => [
                participant?.id, participant?.phoneNumber, participant?.lid,
                participant?.jid, participant?.jidAlt,
              ].filter(Boolean).map(normalizeJid).filter(Boolean);
              const senderIds = [msg.key.participant, msg.key.participantAlt, msg.key.senderPn, msg.key.remoteJidAlt, senderJid]
                .filter(Boolean).map(normalizeJid).filter(Boolean);
              const botIds = [newSock.user?.id, newSock.user?.lid, newSock.user?.phoneNumber]
                .filter(Boolean).map(normalizeJid).filter(Boolean);
              const sender = metadata.participants.find((participant) => aliases(participant).some((id) => senderIds.includes(id)));
              const bot = metadata.participants.find((participant) => aliases(participant).some((id) => botIds.includes(id)));
              const isAdmin = (participant) => participant?.admin === "admin" || participant?.admin === "superadmin";
              const senderIsAdmin = isAdmin(sender);
              const botIsAdmin = isAdmin(bot);

              if (!senderIsAdmin) {
                let deleted = false;
                if (botIsAdmin) {
                  try {
                    await newSock.sendMessage(jid, { delete: msg.key });
                    deleted = true;
                  } catch (deleteError) {
                    console.error("AsianParent could not delete the message:", deleteError.message);
                  }
                }
                const mentionId = senderJid || msg.key.participant || msg.key.remoteJid;
                const notice = deleted
                  ? `👪 @${String(mentionId).split("@")[0]} message deleted. Watch your language, ah. AsianParent is watching.`
                  : `👪 @${String(mentionId).split("@")[0]} watch your language, ah. I couldn't delete that message — make sure I'm a group admin.`;
                await newSock.sendMessage(jid, { text: notice, mentions: [mentionId].filter(Boolean) });
              }
            } catch (filterError) {
              console.error("AsianParent filter failed:", filterError.message);
            }
          }
        }
      }

      if (!text.startsWith(config.PREFIX)) return;

      const [cmdName, ...args] = text.slice(config.PREFIX.length).trim().split(/\s+/);
      const command = commands.get(cmdName.toLowerCase());
      if (!command) return;
      if (jid.endsWith("@g.us") && isSlipperOn(jid) && command.name !== "slipper") return;

      const messageTimestampMs = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
      const quotedMessage = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText =
        quotedMessage?.conversation ||
        quotedMessage?.extendedTextMessage?.text ||
        quotedMessage?.imageMessage?.caption ||
        null;

      const senderId = msg.key.fromMe
        ? jidNormalizedUser(newSock.user?.id || "") || msg.key.participant || msg.key.remoteJid
        : msg.key.participant || msg.key.remoteJid;
      const senderName = msg.pushName || senderId.split("@")[0];

      const configuredOwnerNumber = String(config.OWNER_NUMBER || "").replace(/\D/g, "");
      const senderIdentityValues = [
        msg.key.participant,
        msg.key.participantAlt,
        msg.key.senderPn,
        msg.key.remoteJidAlt,
        senderId,
      ].filter(Boolean);
      const normalizeIdentity = (value) => {
        if (!value) return "";
        try { return jidNormalizedUser(String(value)).split(":")[0].toLowerCase(); }
        catch (_) { return String(value).split(":")[0].toLowerCase(); }
      };
      const senderIdentitySet = new Set(senderIdentityValues.map(normalizeIdentity));
      let resolvedSenderPhone = senderIdentityValues
        .map((value) => String(value).split("@")[0].split(":")[0].replace(/\D/g, ""))
        .find((digits) => digits && digits === configuredOwnerNumber) || "";
      if (!resolvedSenderPhone && configuredOwnerNumber && jid.endsWith("@g.us")) {
        try {
          const metadata = await getGroupMetadata(newSock, jid);
          const senderParticipant = metadata.participants.find((participant) =>
            [participant.id, participant.phoneNumber, participant.lid]
              .filter(Boolean)
              .some((value) => senderIdentitySet.has(normalizeIdentity(value)))
          );
          if (senderParticipant) {
            const phoneValue = senderParticipant.phoneNumber || senderParticipant.id;
            const phoneDigits = String(phoneValue || "").split("@")[0].split(":")[0].replace(/\D/g, "");
            if (phoneDigits) resolvedSenderPhone = phoneDigits;
          }
        } catch (ownerResolveError) {
          console.warn("Could not resolve owner sender identity from group metadata:", ownerResolveError.message);
        }
      }

      const platformCtx = {
        platform: "whatsapp",
        chatId: jid,
        senderId,
        senderName,
        commandName: cmdName.toLowerCase(),
        isGroup: jid.endsWith("@g.us"),
        text,
        messageTimestampMs,
        quotedText,

        async sendText(msgText, opts = {}) {
          const mentions = (opts.mentions || []).map((n) => `${n.replace(/[^0-9]/g, "")}@s.whatsapp.net`);
          return newSock.sendMessage(jid, { text: msgText, mentions }, { quoted: msg });
        },
        async sendImage(source, caption) {
          const image = Buffer.isBuffer(source) ? source : { url: source };
          return newSock.sendMessage(jid, { image, caption }, { quoted: msg });
        },
        
        async getDocumentText(maxBytes = 8 * 1024 * 1024) {
          const docOf = (m) => m?.documentMessage || m?.documentWithCaptionMessage?.message?.documentMessage || null;
          const info = messageContent.extendedTextMessage?.contextInfo;
          const quoted = info?.quotedMessage;

          let doc = docOf(messageContent);
          let source = doc ? { key: msg.key, message: messageContent } : null;
          if (!doc && docOf(quoted)) {
            doc = docOf(quoted);
            source = {
              key: { remoteJid: msg.key.remoteJid, id: info.stanzaId, fromMe: false, participant: info.participant },
              message: quoted,
            };
          }
          if (!doc) return null;

          if (Number(doc.fileLength || 0) > maxBytes) throw new Error(`That file is too big (the limit is ${Math.round(maxBytes / 1048576)} MB).`);
          const buffer = await downloadMediaMessage(source, "buffer", {}, { reuploadRequest: newSock.updateMediaMessage });
          if (buffer.length > maxBytes) throw new Error(`That file is too big (the limit is ${Math.round(maxBytes / 1048576)} MB).`);
          return buffer.toString("utf8");
        },
        async sendSticker(buffer) {
          return newSock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
        },
        async reply(msgText) {
          return newSock.sendMessage(jid, { text: msgText }, { quoted: msg });
        },

        commands,

        shortId(id) {
          return String(id).split("@")[0];
        },
        
        async sendMention(msgText, ids = []) {
          return newSock.sendMessage(jid, { text: msgText, mentions: ids }, { quoted: msg });
        },
        
        async sendVoice(buffer) {
          return newSock.sendMessage(
            jid,
            { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
            { quoted: msg }
          );
        },

        getTargetUser() {
          const context = messageContent?.extendedTextMessage?.contextInfo;
          const mentioned = context?.mentionedJid?.[0];
          const quoted = context?.participant;
          return mentioned || quoted || null;
        },
        
        async getProfilePictureUrl(id) {
          if (!id) return null;
          try {
            return (await newSock.profilePictureUrl(id, "image")) || null;
          } catch (_) {
            return null;
          }
        },
        
        async resolveMember(rawId) {
          const metadata = await getGroupMetadata(newSock, jid);
          const digits = String(rawId || "").replace(/[^0-9]/g, "");
          const match = metadata.participants.find((p) => String(p.id || "").split("@")[0].replace(/[^0-9]/g, "") === digits);
          return match?.id || rawId;
        },
        
        async getAdminStatus() {
          if (!jid.endsWith("@g.us")) return { senderIsAdmin: false, botIsAdmin: false };

          const metadata = await getGroupMetadata(newSock, jid, { force: true });
          const normalize = (value) => {
            if (!value) return "";
            const raw = String(value).trim();
            try { return jidNormalizedUser(raw).split(":")[0].toLowerCase(); }
            catch (_) { return raw.split(":")[0].toLowerCase(); }
          };
          const senderIds = [
            msg.key.participant,
            msg.key.participantAlt,
            msg.key.senderPn,
            msg.key.remoteJidAlt,
          ].filter(Boolean).map(normalize).filter(Boolean);
          const botIds = [newSock.user?.id, newSock.user?.lid, newSock.user?.phoneNumber]
            .filter(Boolean).map(normalize).filter(Boolean);

          const participantIds = (participant) => [
            participant.id,
            participant.phoneNumber,
            participant.lid,
            participant.jid,
            participant.jidAlt,
          ].filter(Boolean).map(normalize).filter(Boolean);
          const matches = (participant, ids) => participantIds(participant).some((value) => ids.includes(value));
          const sender = metadata.participants.find((participant) => matches(participant, senderIds));
          const bot = metadata.participants.find((participant) => matches(participant, botIds));
          const isAdmin = (participant) => participant?.admin === "admin" || participant?.admin === "superadmin";

          return {
            senderIsAdmin: isAdmin(sender),
            botIsAdmin: isAdmin(bot),
          };
        },
        isBotId(id) {
          const normalize = (value) => String(value || "").split(":")[0].toLowerCase();
          return normalize(id) === normalize(newSock.user?.id) || normalize(id) === normalize(newSock.user?.lid);
        },
        isOwner() {
          if (!configuredOwnerNumber) return false;
          if (resolvedSenderPhone === configuredOwnerNumber) return true;
          return senderIdentityValues.some((value) => {
            const digits = String(value).split("@")[0].split(":")[0].replace(/\D/g, "");
            return digits === configuredOwnerNumber;
          });
        },

        async listMembers() {
          const metadata = await getGroupMetadata(newSock, jid);
          return metadata.participants.map((p) => p.id);
        },
        
        async getGroupInfo() {
          const metadata = await getGroupMetadata(newSock, jid);
          const admins = metadata.participants.filter((p) => p.admin === "admin" || p.admin === "superadmin");
          return {
            name: metadata.subject,
            id: jid,
            ownerId: metadata.owner || null,
            createdAt: metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString() : "Unknown",
            memberCount: metadata.participants.length,
            adminCount: admins.length,
            description: metadata.desc || null,
          };
        },

        async removeMember(rawId) {
          const target = await platformCtx.resolveMember(rawId);
          const result = await newSock.groupParticipantsUpdate(jid, [target], "remove");
          return result?.[0]?.status === "200";
        },
        
        async setMemberAdmin(rawId, makeAdmin) {
          const target = await platformCtx.resolveMember(rawId);
          const result = await newSock.groupParticipantsUpdate(jid, [target], makeAdmin ? "promote" : "demote");
          return result?.[0]?.status === "200";
        },
        
        async setGroupLocked(locked) {
          await newSock.groupSettingUpdate(jid, locked ? "announcement" : "not_announcement");
        },

        hasReply() {
          return !!msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        },
        
        async deleteReplied() {
          const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
          if (!contextInfo?.stanzaId) return false;
          await newSock.sendMessage(jid, {
            delete: {
              remoteJid: jid,
              fromMe: false,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant,
            },
          });
          return true;
        },
        
        async shutdown() {
          try {
            newSock.end(new Error("Stopped via !stop command"));
          } catch (_) {
            
          }
        },
      };

      try {
        await command.execute({
          sock: newSock,
          msg,
          jid,
          args,
          commands,
          getGroupMetadata: (groupJid, opts) => getGroupMetadata(newSock, groupJid, opts),
          ...platformCtx,
        });
      } catch (err) {
        console.error(`Error running command "${cmdName}":`, err);
        try {
          await newSock.sendMessage(jid, { text: "⚠️ Something went wrong running that command." });
        } catch (sendErr) {
          console.error(`Also failed to send the error notice for "${cmdName}":`, sendErr);
        }
      }
    } catch (err) {
      console.error("Unexpected error in messages.upsert handler:", err);
    }
  });

  return newSock;
}

async function resumeSavedSession() {
  try {
    const { authState } = await loadAuth();
    if (authState.creds.registered) {
      console.log("Found saved session, reconnecting…");
      await startSocket();
    }
  } catch (err) {
    console.error("Failed to resume saved session:", err.message);
  }
}

let groupListCache = { at: 0, groups: null };

async function listGroups() {
  if (!sock || state.status !== "connected") return null;
  if (groupListCache.groups && Date.now() - groupListCache.at < 20000) return groupListCache.groups;
  try {
    const all = await sock.groupFetchAllParticipating();
    const groups = Object.values(all).map((g) => ({ id: g.id, name: g.subject || g.id }));
    groupListCache = { at: Date.now(), groups };
    return groups;
  } catch (err) {
    console.error("listGroups failed:", err.message);
    return groupListCache.groups; 
  }
}

function getState() {
  return state;
}

function onUpdate(listener) {
  bus.on("update", listener);
  return () => bus.off("update", listener);
}

async function handlePrefixlessTrigger(sock, msg, jid, text) {
  if (msg.key.fromMe || typeof text !== "string") return false;

  const triggers = {
    rayden: "RAYDEN X VICTORIA",
    victoria: "RAYDEN X VICTORIA",
    ruban: "RUBAN PRASANNA X SHINUO",
    shinuo: "RUBAN PRASANNA X SHINUO",
    xinyang: "XIN YANG X ASHLEIGH",
    ashleigh: "XIN YANG X ASHLEIGH",
    haynan: "HAYNAN X ALISA",
    alisa: "HAYNAN X ALISA",
    jovier: "JOVIER X MEGAN",
    megan: "JOVIER X MEGAN",
  };

  const trigger = text.trim().toLowerCase();
  const reply = triggers[trigger];
  if (!reply) return false;

  await sock.sendMessage(jid, { text: reply });
  return true;
}

module.exports = { startSocket, getState, onUpdate, getGroupMetadata, resumeSavedSession, listGroups };
