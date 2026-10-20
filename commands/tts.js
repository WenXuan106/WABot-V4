const googleTTS = require("google-tts-api");
const { spawn } = require("child_process");

const MAX_CHARS = 2000;
const DEFAULT_LANG = "en";

function mp3ToOggOpus(mp3Buffer) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", "pipe:0",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libopus",
      "-b:a", "32k",
      "-vn",
      "-f", "ogg",
      "pipe:1",
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

    ff.stdin.write(mp3Buffer);
    ff.stdin.end();
  });
}

module.exports = {
  name: "tts",
  description:
    "Convert text to speech with Google's voice, e.g. !tts hello there — or with a language code: !tts es hola",
  async execute(ctx) {
    const { args } = ctx;
    if (!args.length) {
      return ctx.sendText("Usage: !tts <text>\nOptional language code: !tts es hola, como estas?");
    }

    let lang = DEFAULT_LANG;
    let text = args.join(" ").trim();
    const maybeLang = args[0].toLowerCase();
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(maybeLang) && args.length > 1) {
      lang = maybeLang;
      text = args.slice(1).join(" ").trim();
    }

    if (!text) {
      return ctx.sendText("Give me some text to speak, e.g. !tts hello there");
    }
    if (text.length > MAX_CHARS) {
      return ctx.sendText(`That's too long (${text.length} chars). Keep it under ${MAX_CHARS} characters.`);
    }

    try {
      
      const urls = googleTTS.getAllAudioUrls(text, {
        lang,
        slow: false,
        host: "https://translate.google.com",
      });

      const buffers = [];
      for (const { url } of urls) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Google TTS request failed: ${res.status}`);
        buffers.push(Buffer.from(await res.arrayBuffer()));
      }
      const mp3 = Buffer.concat(buffers);
      const audio = await mp3ToOggOpus(mp3);

      await ctx.sendVoice(audio);
    } catch (err) {
      console.error("tts command failed:", err);
      await ctx.sendText("⚠️ Cannot load anything bcs Wen_Xuan106 stuid nvr code proparly. Mb try shorter msg or see lang code.");
    }
  },
};
