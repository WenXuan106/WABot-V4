const config = require("../config");

module.exports = {
  name: "credits",
  description: "credits on what was used in the bot",
  aliases: ["credit", "about"],
  async execute(ctx) {
    const prefix = String(config.PREFIX || "!");
    const botName = String(config.BOT_NAME || "WABot");
    const owner = String(config.OWNER_NAME || "Wen_Xuan106");

    const lines = [
      "╭━━━━━━━━━━━━━━━━━━━━━━╮",
      `│       ✦ *${botName}* ✦`,
      "│          *CREDITS*",
      "╰━━━━━━━━━━━━━━━━━━━━━━╯",
      "",
      "╭─ ⚙️ *POWERED BY*",
      "│ • WhatsApp connection: Baileys",
      "│ • Runtime: Node.js",
      "│ • Web dashboard: Express",
      "│ • Telegram integration: Telegraf",
      "╰──────────────────────",
      "",
      "╭─ 📦 *OPEN-SOURCE PACKAGES*",
      "│ • Axios — HTTP requests",
      "│ • dotenv — environment configuration",
      "│ • google-tts-api — text-to-speech support",
      "│ • qrcode — QR code generation for Bot Pairing",
      "│ • pino — logging",
      "│ • node-webpmux — WebP media utilities",
      "│ • @resvg/resvg-js — SVG rendering",
      "╰──────────────────────",
      "",
        "╭─ 🤖 *Referance*",
      "│ • ${config.PREFIX}ash: ASHBOT",
      "│ • ${config.PREFIX}desmos: KhoiBot & ASHBOT",
      "│ • ${config.PREFIX}ping: ASHBOT",
      "╰──────────────────────",
      `Type *${prefix}help* to view commands.`,
      `Type *${prefix}credits* to view these credits.`,
    ];

    await ctx.sendText(lines.join("\n"));
  },
};
