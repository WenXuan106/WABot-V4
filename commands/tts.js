const { spawn } = require("child_process");

const MAX_CHARS = 2000;
const DEFAULT_LANG = "en";
const FISH_AUDIO_VOICE_ID = "46be5023533743df8fb432d30ce0f81a";
const FISH_AUDIO_API_URL = "https://api.fish.audio/v1/tts";
const FISH_AUDIO_MODEL = process.env.FISH_AUDIO_MODEL || "s2.1-pro";

function mp3ToOggOpus(mp3Buffer) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y", "-i", "pipe:0", "-ac", "1", "-ar", "16000",
      "-c:a", "libopus", "-b:a", "32k", "-vn", "-f", "ogg", "pipe:1",
    ];
    const ff = spawn("ffmpeg", args);
    const chunks = [];
    const errors = [];
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (e) => errors.push(e));
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
  description: "Convert text to speech using the selected Fish Audio voice. Example: !tts hello there, or !tts ja こんにちは",
  async execute(ctx) {
    const { args } = ctx;
    if (!args.length) {
      return ctx.sendText(
        "Usage: !tts <text>\nOptional language code: !tts ja こんにちは\nRequires FISH_AUDIO_API_KEY to be configured."
      );
    }

    let lang = DEFAULT_LANG;
    let text = args.join(" ").trim();
    const maybeLang = String(args[0]).toLowerCase();
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(maybeLang) && args.length > 1) {
      lang = maybeLang;
      text = args.slice(1).join(" ").trim();
    }

    if (!text) return ctx.sendText("Give me some text to speak, e.g. !tts hello there");
    if (text.length > MAX_CHARS) {
      return ctx.sendText(`That's too long (${text.length} characters). Keep it under ${MAX_CHARS} characters.`);
    }

    const apiKey = process.env.FISH_AUDIO_API_KEY;
    if (!apiKey) {
      return ctx.sendText(
        "Fish Audio TTS needs an API key. Set FISH_AUDIO_API_KEY in your bot's environment, then restart the bot."
      );
    }

    try {
      const response = await fetch(FISH_AUDIO_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model: FISH_AUDIO_MODEL,
        },
        body: JSON.stringify({
          text,
          reference_id: FISH_AUDIO_VOICE_ID,
          format: "mp3",
          normalize: true,
        }),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`Fish Audio returned ${response.status}: ${detail}`);
      }

      const mp3 = Buffer.from(await response.arrayBuffer());
      if (!mp3.length) throw new Error("Fish Audio returned an empty audio file");
      const audio = await mp3ToOggOpus(mp3);
      await ctx.sendVoice(audio);
    } catch (err) {
      console.error("Fish Audio TTS command failed:", err);
      await ctx.sendText(
        "⚠️ Fish Audio TTS failed. Check that FISH_AUDIO_API_KEY is valid, the voice is accessible to your account, and ffmpeg is installed."
      );
    }
  },
};
