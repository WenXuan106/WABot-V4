const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const MAX_CHARS = 2000;
const FISH_AUDIO_VOICE_ID = "46be5023533743df8fb432d30ce0f81a";
const FISH_AUDIO_API_URL = "https://api.fish.audio/v1/tts";

function const ff = spawn("ffmpeg", args){
  return new Promise((resolve, reject) => {
    const args = [
      "-y", "-i", "pipe:0", "-ac", "1", "-ar", "16000",
      "-c:a", "libopus", "-b:a", "32k", "-vn", "-f", "ogg", "pipe:1",
    ];
    const ff = spawn("ffmpeg", args);
    const chunks = [];
    const errors = [];
    ff.stdout.on("data", (data) => chunks.push(data));
    ff.stderr.on("data", (data) => errors.push(data));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
    ff.stdin.on("error", reject);
    ff.stdin.end(mp3Buffer);
  });
}

module.exports = {
  name: "tts",
  description: "Convert text to speech using Fish Audio. Example: !tts [excited] Hello!",
  async execute(ctx) {
    const { args } = ctx;
    const text = args.join(" ").trim();

    if (!text) {
      return ctx.sendText(
        "Usage: !tts <text>\nExample: !tts [excited] Hello! Welcome to Fish Audio.\nRequires FISH_API_KEY to be configured."
      );
    }

    if (text.length > MAX_CHARS) {
      return ctx.sendText(`That's too long (${text.length} characters). Keep it under ${MAX_CHARS} characters.`);
    }

    const apiKey = process.env.FISH_API_KEY;
    if (!apiKey) {
      return ctx.sendText(
        "Fish Audio TTS needs an API key. Set FISH_API_KEY in your bot's environment, then restart the bot."
      );
    }

    try {
      const response = await fetch(FISH_AUDIO_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model: "s2.1-pro-free",
        },
        body: JSON.stringify({
          text,
          reference_id: FISH_AUDIO_VOICE_ID,
          format: "mp3",
        }),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`Fish Audio returned ${response.status}: ${detail}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      if (!audioBuffer.length) throw new Error("Fish Audio returned an empty audio file");

      function cleanTTSInput(text) {
  return text
    
    .replace(/\b(?:ah+|a{4,})\b/gi, " ")

    .replace(/\bh{4,}\b/gi, " ")

    .replace(/\be{4,}\b/gi, " ")

    .replace(/\buh{2,}\b/gi, " ")

    .replace(/\b(?:hpmh+|hmm+|hmph+)\b/gi, " ")

    .replace(/\s+/g, " ")
    .trim();
}

      text = cleanTTSInput(text);

if (!text) {
  return ctx.sendText(
    "There is no text left to speak after removing vocalizations."
  );
}

      const voiceMessage = await const ff = spawn("ffmpeg", args);
      await ctx.sendVoice(voiceMessage);
    } catch (error) {
      console.error("Fish Audio TTS command failed:", error);
      await ctx.sendText(
        "⚠️ Fish Audio TTS failed. Check that FISH_API_KEY is valid, the voice is accessible to your account, and ffmpeg is installed."
      );
    }
  },
};
