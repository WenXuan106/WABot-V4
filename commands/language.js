const { getLanguage, setLanguage } = require("../lib/user-language");

module.exports = {
  name: "language",
  aliases: ["lang"],
  description: "Set your personal command reply language to English or Japanese",
  async execute(ctx) {
    const choice = String(ctx.args[0] || "").trim().toLowerCase();
    const current = getLanguage(ctx.senderId);

    if (!choice) {
      return ctx.sendText(
        `🌐 Your language: ${current === "ja" ? "Japanese (日本語)" : "English"}\n\n` +
        `Usage: ${require("../config").PREFIX}language en\n` +
        `       ${require("../config").PREFIX}language ja`
      );
    }

    const normalized = ({
      en: "en", english: "en", eng: "en",
      ja: "ja", japanese: "ja", 日本語: "ja",
    })[choice];

    if (!normalized) {
      return ctx.sendText("❌ Choose English with `language en` or Japanese with `language ja`.");
    }

    if (!setLanguage(ctx.senderId, normalized)) {
      return ctx.sendText("⚠️ I couldn't save your language preference. Please check the bot's file permissions.");
    }

    ctx.language = normalized;
    return ctx.sendText("✅ Language preference saved. This setting only applies to your replies.");
  },
};
