const axios = require("axios");

const cache = new Map();
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

async function translateText(text, language) {
  const input = String(text ?? "");
  if (language !== "ja" || !input.trim()) return input;
  if (cache.has(input)) return cache.get(input);

  // Protect links and command-prefix tokens from being altered by translation.
  const protectedItems = [];
  const protectedText = input.replace(URL_RE, (match) => {
    const token = `ZXQPROTECTED${protectedItems.length}QXZ`;
    protectedItems.push(match);
    return token;
  });

  try {
    const response = await axios.get("https://translate.googleapis.com/translate_a/single", {
      params: { client: "gtx", sl: "en", tl: "ja", dt: "t", q: protectedText },
      timeout: 8000,
    });
    let translated = response.data?.[0]?.map((part) => part[0] || "").join("") || input;
    translated = translated.replace(/ZXQPROTECTED(\d+)QXZ/g, (_, index) => protectedItems[Number(index)] || "");
    cache.set(input, translated);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return translated;
  } catch (error) {
    console.warn("Reply translation failed; using original English:", error.message);
    return input;
  }
}

module.exports = { translateText };
