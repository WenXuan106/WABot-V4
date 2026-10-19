const express = require("express");
const crypto = require("crypto");
const { listGroups, getState } = require("./whatsapp");

const groupEnabled = new Map();
const attempts = new Map();

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createDashboardRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    const configuredPassword = process.env.DASHBOARD_PASSWORD || "";
    if (!configuredPassword) {
      return res.status(503).json({ error: "Dashboard password is not configured. Set DASHBOARD_PASSWORD in the environment." });
    }

    const ip = req.ip || "unknown";
    const now = Date.now();
    const record = attempts.get(ip) || { count: 0, until: 0 };
    if (record.until > now && record.count >= 10) {
      return res.status(429).json({ error: "Too many attempts. Try again later." });
    }

    const supplied = req.get("x-dashboard-password") || "";
    if (!safeEqual(supplied, configuredPassword)) {
      record.count = record.until > now ? record.count + 1 : 1;
      record.until = now + 10 * 60 * 1000;
      attempts.set(ip, record);
      return res.status(401).json({ error: "Incorrect dashboard password." });
    }

    attempts.delete(ip);
    next();
  });

  router.get("/", async (req, res) => {
    try {
      const groups = await listGroups();
      if (groups === null) {
        return res.json({
          whatsappConnected: getState().status === "connected",
          telegramConfigured: false,
          groups: [],
        });
      }
      res.json({
        whatsappConnected: true,
        telegramConfigured: false,
        groups: groups.map((group) => ({
          ...group,
          platform: "whatsapp",
          enabled: groupEnabled.get(group.id) !== false,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Unable to load groups." });
    }
  });

  router.post("/toggle", express.json(), (req, res) => {
    const { id, enabled } = req.body || {};
    if (typeof id !== "string" || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "A group id and enabled boolean are required." });
    }
    groupEnabled.set(id, enabled);
    res.json({ ok: true, id, enabled });
  });

  return router;
}

module.exports = { createDashboardRouter };
