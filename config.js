function envNumber(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

module.exports = {
  PREFIX: process.env.PREFIX || "!",

  PORT: process.env.PORT || 3000,

  AUTH_FOLDER: process.env.AUTH_FOLDER || "auth_info_baileys",

  BOT_NAME: process.env.BOT_NAME || "Wen_Xuan106’s Whatsapp Bot"
  
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || "",
  };
