const config = require("../config");

const SECTIONS = [
  { title: "GENERAL", icon: "🧭", commands: ["help", "ping", "milo", "pfp"] },
  { title: "ADMIN", icon: "🛡️", commands: ["admin", "slipper", "asianparent"] },
  { title: "GAMES", icon: "🎮", commands: ["WORK IN PROGESS"] },
  { title: "FUN", icon: "🎭", commands: ["8ball", "ash", "ship","singlish"] },
  { title: "MEDIA", icon: "🎞️", commands: ["translate", "song", "anime", "tts"] },
  { title: "AI", icon: "🤖", commands: ["WORK IN PROGRESS"] },
  { title: "UTILITY", icon: "🌍", commands: ["desmos"] },
  { title: "OWNER", icon: "👑", commands: ["WORK IN PROGRESS"] },
];

const INFO = {
  help: ["[section]", "See cmds"],
  ping: ["", "See bot online or not"],
  milo: ["", "MILOOOOO!!!"],
  pfp: ["[@user]", "Download ppl pfp yeah"],
  "8ball": ["<question>", "Ask 8-ball random thing"],
  ash: ["", "Get random ahh respond from this cmd"],
  translate: ["<language> <text>", "Translation to other Language"],
  desmos: ["<function>", "Same sh- as Desmos"],
  song: ["","finds some random ahh song ur wanna search"],
  ship: ["", "I recommend shipping Haynan x Alisa 👍"],
  anime: ["", "search some random anime stuff, i recommend if you femboy"],
  admin: ["[kick, promote, demote, lock, unlock]", "Asian tools"],
  slipper: ["[on, off, status]", "Asian bot on/off switch"],
  asianparent: ["[on, off, add, remove, list]", "Group language filter"],
  singlish: ["","give random sg related sh-"],
  tts: ["<text>","turn any text into google voice"]
};

function commandInfo(command) {
  if (INFO[command.name]) return INFO[command.name];
  const firstPart = String(command.description || "").split(/\.\s|\s—\s|\s\(/)[0].trim();
  return ["", firstPart.length > 56 ? firstPart.slice(0, 53) + "…" : firstPart];
}

function buildSections(commands) {
  const real = new Map([...commands].filter(([key, cmd]) => cmd.name.toLowerCase() === key));
  const placed = new Set();
  const sections = [];

  for (const section of SECTIONS) {
    const present = section.commands.filter((name) => real.has(name));
    present.forEach((name) => placed.add(name));
    if (present.length) {
      sections.push({ ...section, commands: present.map((name) => real.get(name)) });
    }
  }

  const other = [...real.keys()].filter((name) => !placed.has(name)).sort();
  if (other.length) sections.push({ title: "MORE", icon: "📦", commands: other.map((name) => real.get(name)) });

  return { sections, totalCommands: real.size };
}

function menuMessage(ctx, sections, totalCommands) {
  const p = config.PREFIX;
  const width = 26;
  const line = "━━━━━━━━━━━━━━━━━━━━";
  const lines = [
    `╭${line}╮`,
    `│      ✦ *${config.BOT_NAME}* ✦`,
    `│        *COMMAND CENTER*`,
    `╰${line}╯`,
    "",
    `Hey @${ctx.shortId(ctx.senderId)}! 👋`,
    "Here is wat I can do.",
    "",
    `╭─ *BOT INFO*`,
    `│ ⚡ Prefix   : ${p}`,
    `│ 🧩 Commands : ${totalCommands}`,
  ];
  if (config.OWNER_NAME) lines.push(`│ 👑 Owner    : ${config.OWNER_NAME}`);
  lines.push(
    "╰────────────────────────",
    "",
    "╭─ *BROWSE CATEGORIES*",
  );

  sections.forEach((section, i) => {
    const number = String(i + 1).padStart(2, "0");
    lines.push(`│ ${number}  ${section.icon} *${section.title}*  ·  ${section.commands.length}`);
  });

  lines.push(
    "╰────────────────────────",
    "",
    "*HOW TO USE*",
    `▸ Send *${p}1* to open the first category`,
    `▸ Or send *${p}help fun* to open a category by name`,
    `▸ Example: *${p}pfp* or *${p}ping*`,
    "",
    "_Choose a category and explore._"
  );
  return lines.join("\n");
}

function sectionMessage(section, index, totalSections) {
  const p = config.PREFIX;
  const lines = [
    "╭━━━━━━━━━━━━━━━━━━━━╮",
    `│ ${section.icon}  *${section.title} COMMANDS*`,
    `│ Category ${String(index + 1).padStart(2, "0")} of ${String(totalSections).padStart(2, "0")}`,
    "╰━━━━━━━━━━━━━━━━━━━━╯",
    "",
  ];

  for (const command of section.commands) {
    const [usage, summary] = commandInfo(command);
    lines.push(`┌ *${p}${command.name}*${usage ? ` ${usage}` : ""}`);
    if (summary) lines.push(`└ ${summary}`);
    lines.push("");
  }

  lines.push(
    "━━━━━━━━━━━━━━━━━━━━",
    `↩️ Menu: *${p}help*`,
    `💡 Tip: *${p}help <category>*`
  );
  return lines.join("\n");
}

module.exports = {
  name: "help",
  description: "Open the command center and browse categories",
  aliases: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  async execute(ctx) {
    const { sections, totalCommands } = buildSections(ctx.commands);
    const p = config.PREFIX;
    let wanted = null;

    if (/^\d+$/.test(ctx.commandName || "")) {
      wanted = ctx.commandName;
    } else if (ctx.args[0]) {
      wanted = ctx.args[0].toLowerCase();
    }

    if (wanted === null) {
      return ctx.sendMention(menuMessage(ctx, sections, totalCommands), [ctx.senderId]);
    }

    const index = /^\d+$/.test(wanted)
      ? parseInt(wanted, 10) - 1
      : sections.findIndex((section) => section.title.toLowerCase() === wanted);
    const section = sections[index];

    if (!section) {
      return ctx.sendMention(`❌ Unknown category: *${wanted}*\n\nSend *${p}help* to view available categories.`, []);
    }

    return ctx.sendMention(sectionMessage(section, index, sections.length), []);
  },
};
