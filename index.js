require("dotenv").config();

if (typeof globalThis.File === "undefined") {
  try {
    globalThis.File = require("node:buffer").File;
  } catch (_) {
    
    const { Blob } = require("node:buffer");
    globalThis.File = class File extends Blob {
      constructor(chunks, name, options = {}) {
        super(chunks, options);
        this.name = name;
        this.lastModified = options.lastModified ?? Date.now();
      }
    };
  }
}

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = require("node:crypto").webcrypto;
}

require("node:dns").setDefaultResultOrder("ipv4first");

const express = require("express");
const path = require("path");
const config = require("./config");
const { startSocket, getState, onUpdate, resumeSavedSession } = require("./lib/whatsapp");
const { createDashboardRouter } = require("./lib/dashboard");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/groups", createDashboardRouter());

app.post("/api/pair", async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber.replace(/[^0-9]/g, ""))) {
    return res.status(400).json({ error: "Enter your number with country code, digits only." });
  }

  try {
    await startSocket({ phoneNumber, forceReset: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pair-qr", async (req, res) => {
  try {
    await startSocket({ forceReset: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/status", (req, res) => {
  res.json(getState());
});

app.get("/api/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify(getState())}\n\n`);

  const unsubscribe = onUpdate((state) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.listen(config.PORT, () => {
  console.log(`Pairing website running at http://localhost:${config.PORT}`);
});
