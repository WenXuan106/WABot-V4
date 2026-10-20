const config = require("../config");
const { loadCommands } = require("./commands");
const { Telegraf } = require("telegraf");

const commands = loadCommands();

function displayName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.username || String(user?.id ?? "user");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function makeContext(tgCtx, commandName, args) {
  const message = tgCtx.message || tgCtx.editedMessage || {};
  const chatId = tgCtx.chat.id;
  const senderId = String(tgCtx.from?.id ?? "");
  const senderName = displayName(tgCtx.from);
  const text = message.text || message.caption || "";
  const replied = message.reply_to_message || null;
  const quotedText = replied?.text || replied?.caption || null;
  const telegram = tgCtx.telegram;

  function getTargetUser() {
    const entities = message.entities || [];
    for (const entity of entities) {
      if (entity.type === "text_mention" && entity.user) return String(entity.user.id);
      if (entity.type === "mention") {
        const username = text.slice(entity.offset, entity.offset + entity.length).replace(/^@/, "").toLowerCase();
        if (tgCtx.from?.username?.toLowerCase() === username) return senderId;
      }
    }
    if (replied?.from && !replied.from.is_bot) return String(replied.from.id);
    return null;
  }

  return {
    platform: "telegram",
    chatId,
    senderId,
    senderName,
    commandName,
    args,
    commands,
    text,
    quotedText,
    isGroup: tgCtx.chat.type === "group" || tgCtx.chat.type === "supergroup",
    messageTimestampMs: message.date ? Number(message.date) * 1000 : Date.now(),
    shortId(id) { return String(id); },
    async sendText(value) { return tgCtx.reply(String(value), { link_preview_options: { is_disabled: true } }); },
    async reply(value) { return tgCtx.reply(String(value)); },
    async sendMention(value, ids = []) {
      let html = escapeHtml(value).replace(/\*(?!\s)([^*\n]+?)(?<!\s)\*/g, "<b>$1</b>");
      for (const id of ids) {
        let name = String(id);
        try {
          const member = await telegram.getChatMember(chatId, Number(id));
          name = displayName(member.user);
        } catch (_) {}
        const mention = `<a href="tg://user?id=${encodeURIComponent(String(id))}">${escapeHtml(name)}</a>`;
        html = html.replace(new RegExp(`@${String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`, "g"), () => mention);
      }
      return tgCtx.reply(html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    },
    async sendImage(source, caption) {
      const photo = Buffer.isBuffer(source) ? { source } : source;
      return tgCtx.replyWithPhoto(photo, caption ? { caption } : {});
    },
    async sendSticker(buffer) { return tgCtx.replyWithSticker({ source: buffer }); },
    async getDocumentText(maxBytes = 8 * 1024 * 1024) {
      const doc = message.document || replied?.document;
      if (!doc) return null;
      if (doc.file_size && doc.file_size > maxBytes) throw new Error(`That file is too big (the limit is ${Math.round(maxBytes / 1048576)} MB).`);
      const link = await telegram.getFileLink(doc.file_id);
      const response = await fetch(String(link));
      if (!response.ok) throw new Error("I couldn't download that file.");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw new Error(`That file is too big (the limit is ${Math.round(maxBytes / 1048576)} MB).`);
      return buffer.toString("utf8");
    },
    async getProfilePictureUrl(id) {
      try {
        const photos = await telegram.getUserProfilePhotos(Number(id), 0, 1);
        const sizes = photos?.photos?.[0];
        if (!sizes?.length) return null;
        const file = sizes[sizes.length - 1];
        return String(await telegram.getFileLink(file.file_id));
      } catch (_) { return null; }
    },
    getTargetUser,
  };
}

async function launchWithRetry(bot, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await bot.launch();
      console.log("Telegram bot connected.");
      return;
    } catch (error) {
      const delay = Math.min(30000, 2000 * 2 ** (attempt - 1));
      console.error(`Telegram startup attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  console.error("Telegram bot could not start. WhatsApp and the website can continue running.");
}

function startTelegramBot() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.log("TELEGRAM_BOT_TOKEN is not set; Telegram support is disabled.");
    return null;
  }

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
  bot.catch((error) => console.error("Telegram handler error:", error));

  bot.start(async (ctx) => {
    await ctx.reply(`Hi! I'm ${config.BOT_NAME}. Send ${config.PREFIX}help to see commands.`);
  });

  bot.on(["text", "document", "photo"], async (tgCtx) => {
    const message = tgCtx.message;
    const text = message?.text || message?.caption || "";
    if (!text.startsWith(config.PREFIX)) return;

    const raw = text.slice(config.PREFIX.length).trim();
    if (!raw) return;
    const [typedName, ...args] = raw.split(/\s+/);
    const command = commands.get(typedName.toLowerCase());
    if (!command) return;

    const ownerId = String(config.TELEGRAM_OWNER_ID || "").trim();
    const isOwner = !!ownerId && String(tgCtx.from?.id) === ownerId;
    if (command.ownerOnly && !isOwner) return tgCtx.reply("⛔ This command is only available to the bot owner.");

    const context = makeContext(tgCtx, typedName.toLowerCase(), args);
    try {
      await command.execute(context);
    } catch (error) {
      console.error(`Telegram command ${typedName} failed:`, error);
      try { await tgCtx.reply("⚠️ Something went wrong running that command."); } catch (_) {}
    }
  });

  launchWithRetry(bot);
  process.once("SIGINT", () => { try { bot.stop("SIGINT"); } catch (_) {} });
  process.once("SIGTERM", () => { try { bot.stop("SIGTERM"); } catch (_) {} });
  return bot;
}

module.exports = { startTelegramBot, makeContext };
