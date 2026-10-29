const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");

const MAX_CHARS = 2000;
const FISH_AUDIO_VOICE_ID = "46be5023533743df8fb432d30ce0f81a";
const FISH_AUDIO_API_URL = "https://api.fish.audio/v1/tts";
const FISH_AUDIO_MODEL = process.env.FISH_AUDIO_MODEL || "s2.1-pro-free";
const MOAN_FILTER_ENABLED = process.env.MOAN_FILTER !== "0";
const FILTER_SCRIPT = path.join(__dirname, "..", "tools", "filter_moan.py");

function cleanTTSInput(input) {
  return input
    .replace(/\[(?:moaning|moan|panting|heavy breathing|gasping|groaning)\]/gi, " ")
    .replace(/\b(?:ah+h{0,}|a{4,}|e{4,}|h{4,}|uh{3,}|hm+ph+|hp+mh+)\b/gi, " ")
    .replace(/\b(?:mmm+|hmm+|ngh+|hnng+|ooh+|oh+h+)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function runProcess(executable, args, inputBuffer) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(stdout));
      reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-1200) || `${executable} exited with code ${code}`));
    });
    if (inputBuffer) child.stdin.end(inputBuffer);
  });
}

async function mp3ToWav(mp3Buffer, outputPath) {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not provide an FFmpeg binary for this platform.");
  await runProcess(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", "pipe:0",
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "wav", outputPath,
  ], mp3Buffer);
}

async function wavToOggOpus(wavPath) {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not provide an FFmpeg binary for this platform.");
  return runProcess(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", wavPath,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1",
  ]);
}

async function applyFreeAIFilter(mp3Buffer) {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "wabot-tts-"));
  const inputWav = path.join(workDir, "input.wav");
  const filteredWav = path.join(workDir, "filtered.wav");
  try {
    await mp3ToWav(mp3Buffer, inputWav);
    if (MOAN_FILTER_ENABLED) {
      const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
      await runProcess(python, [FILTER_SCRIPT, inputWav, filteredWav]);
    } else {
      await fs.promises.copyFile(inputWav, filteredWav);
    }
    return await wavToOggOpus(filteredWav);
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  name: "tts",
  description: "Convert text to speech with Fish Audio and an optional free local AI moan filter.",
  async execute(ctx) {
    const originalText = (ctx.args || []).join(" ").trim();
    if (!originalText) {
      return ctx.sendText(
        "🎙️ Fish Audio TTS\nUsage: !tts <text>\nExample: !tts Hello, welcome!\nThe local AI audio filter removes likely moan/groan/pant/breathing segments after generation."
      );
    }
    if (originalText.length > MAX_CHARS) {
      return ctx.sendText(`Text is too long (${originalText.length} characters). Maximum: ${MAX_CHARS}.`);
    }
    const text = cleanTTSInput(originalText);
    if (!text) return ctx.sendText("No speakable text remains after removing vocalization tokens.");

    const apiKey = process.env.FISH_API_KEY;
    if (!apiKey) return ctx.sendText("⚠️ Set FISH_API_KEY in your hosting environment, then restart the bot.");

    try {
      const response = await fetch(FISH_AUDIO_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model: FISH_AUDIO_MODEL,
        },
        body: JSON.stringify({ text, reference_id: FISH_AUDIO_VOICE_ID, format: "mp3" }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`Fish Audio API error (${response.status}): ${detail}`);
      }
      const mp3Buffer = Buffer.from(await response.arrayBuffer());
      if (!mp3Buffer.length) throw new Error("Fish Audio returned an empty audio file.");
      const voiceBuffer = await applyFreeAIFilter(mp3Buffer);
      await ctx.sendVoice(voiceBuffer);
    } catch (error) {
      console.error("[Fish Audio TTS]", error);
      await ctx.sendText(
        `⚠️ TTS failed: ${String(error.message || error).slice(0, 220)}\nCheck FISH_API_KEY, model access, ffmpeg-static, and the Python AI-filter dependencies.`
      );
    }
  },
};
