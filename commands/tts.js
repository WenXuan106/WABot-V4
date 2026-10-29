const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const MAX_CHARS = 2000;
const FISH_AUDIO_API_URL = "https://api.fish.audio/v1/tts";
const FISH_AUDIO_VOICE_ID = "46be5023533743df8fb432d30ce0f81a";
const FISH_AUDIO_MODEL = process.env.FISH_AUDIO_MODEL || "s2.1-pro-free";

function cleanTTSInput(text) {
  return text
   
    .replace(/\b(?:ah{3,}|a{4,})\b/gi, " ")

    .replace(/\bh{4,}\b/gi, " ")

    .replace(/\be{4,}\b/gi, " ")

    .replace(/\buh{3,}\b/gi, " ")

    .replace(/\b(?:hpmh+|hmph+)\b/gi, " ")

    .replace(/\b(?:ugh+|ugh+)\b/gi, " ")
    
    .replace(/\b(?:ug+|ug+)\b/gi, " ")
    
    .replace(/\b(?:弖+|弖+)\b/gi, " ")

    .replace(/\b(?:AAAAAAAAAEEEEEEOOOOOO+|AAAAAAAAAEEEEEEOOOOOO+)\b/gi, " ")
    
    .replace(/\s+/g, " ")
    .trim();
}

function mp3ToOggOpus(mp3Buffer) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      return reject(
        new Error(
          "FFmpeg binary unavailable. Check whether ffmpeg-static installed correctly."
        )
      );
    }

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      "pipe:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-f",
      "ogg",
      "pipe:1",
    ];

    const ff = spawn(ffmpegPath, args);
    const outputChunks = [];
    const errorChunks = [];

    let settled = false;

    function fail(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    ff.stdout.on("data", (chunk) => {
      outputChunks.push(chunk);
    });

    ff.stderr.on("data", (chunk) => {
      errorChunks.push(chunk);
    });

    ff.on("error", (error) => {
      fail(new Error(`Could not start FFmpeg: ${error.message}`));
    });

    ff.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") {
        fail(new Error(`FFmpeg input error: ${error.message}`));
      }
    });

    ff.on("close", (code) => {
      if (settled) return;

      if (code !== 0) {
        const details = Buffer.concat(errorChunks).toString("utf8");

        return fail(
          new Error(
            `FFmpeg exited with code ${code}: ${details || "Unknown error"}`
          )
        );
      }

      const result = Buffer.concat(outputChunks);

      if (!result.length) {
        return fail(new Error("FFmpeg produced an empty audio file."));
      }

      settled = true;
      resolve(result);
    });

    ff.stdin.end(mp3Buffer);
  });
}

module.exports = {
  name: "tts",

  description:
    "Convert text to speech using Fish Audio. Example: !tts Hello there",

  async execute(ctx) {
    const { args } = ctx;

    if (!args || !args.length) {
      return ctx.sendText(
        [
          "🎙️ Fish Audio TTS",
          "",
          "Usage: !tts <text>",
          "",
          "Example:",
          "!tts Hello, welcome to my WhatsApp bot!",
          "",
          "Requires FISH_API_KEY to be configured.",
        ].join("\n")
      );
    }

    let text = args.join(" ").trim();

    if (
      args.length > 1 &&
      /^[a-z]{2}(-[a-z]{2})?$/i.test(args[0])
    ) {
      text = args.slice(1).join(" ").trim();
    }

    if (!text) {
      return ctx.sendText("Please provide text for me to speak.");
    }

    if (text.length > MAX_CHARS) {
      return ctx.sendText(
        `Your text is too long (${text.length} characters). Maximum: ${MAX_CHARS}.`
      );
    }

    const cleanedText = cleanTTSInput(text);

    if (!cleanedText) {
      return ctx.sendText(
        "No speakable text remains after filtering the vocalizations."
      );
    }

    const apiKey = process.env.FISH_API_KEY;

    if (!apiKey) {
      return ctx.sendText(
        "⚠️ Fish Audio API key is missing. Set FISH_API_KEY in your environment and restart the bot."
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
          text: cleanedText,
          reference_id: FISH_AUDIO_VOICE_ID,
          format: "mp3",
        }),
      });

      if (!response.ok) {
        const details = (await response.text()).slice(0, 500);

        throw new Error(
          `Fish Audio API error (${response.status}): ${details}`
        );
      }

      const mp3Buffer = Buffer.from(await response.arrayBuffer());

      if (!mp3Buffer.length) {
        throw new Error("Fish Audio returned an empty audio response.");
      }

      const voiceBuffer = await mp3ToOggOpus(mp3Buffer);

      await ctx.sendVoice(voiceBuffer);
    } catch (error) {
      console.error("[Fish Audio TTS]", error);

      await ctx.sendText(
        "⚠️ TTS failed. Check your Fish Audio API key, model access, and FFmpeg installation."
      );
    }
  },
};
