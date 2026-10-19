const config = require("../config");

const SECTIONS = [
  { title: "GENERAL", icon: "🧭", commands: ["help", "ping", "milo", "pfp"] },
  {
    title: "ADMIN",
    icon: "🛡️",
    commands: ["WORK IN PROGRESS"],
  },
  { title: "GAMES", icon: "🎮", commands: ["WORK IN PROGESS"] },
  { title: "FUN", icon: "🎭", commands: ["8ball", "ash"] },
  { title: "MEDIA", icon: "🎞️", commands: ["translate"] },
  { title: "AI", icon: "🤖", commands: ["WORK IN PROGRESS"] },
  { title: "UTILITY", icon: "🌍", commands: ["WORK IN PROGRESS"] },
  { title: "OWNER", icon: "👑", commands: ["WORK IN PROGRESS"] },
];

const INFO = {
  help: ["[section]", "Show this menu"],
  ping: ["", "Check the bot is alive"],
  milo: ["", "Check the bot is alive"],
  pfp: ["[@user]", "Get a profile picture"],
  "8ball": ["<question>", "Ask the magic 8-ball"],
  ash: ["", "Says something random"],
  translate: ["<language> <text>", "Translate text"],
};

function commandInfo(command) {
  if (INFO[command.name]) return INFO[command.name];
  const firstPart = String(command.description || "").split(/\.\s|\s—\s|\s\(/)[0].trim();
  return ["", firstPart.length > 50 ? firstPart.slice(0, 47) + "…" : firstPart];
}

function buildSections(commands) {
  
  const real = new Map([...commands].filter(([key, cmd]) => cmd.name.toLowerCase() === key));
  const placed = new Set();
  const sections = [];

  for (const section of SECTIONS) {
    const present = section.commands.filter((name) => real.has(name));
    present.forEach((name) => placed.add(name));
    if (present.length > 0) sections.push({ ...section, commands: present.map((name) => real.get(name)) });
  }

  const other = [...real.keys()].filter((name) => !placed.has(name)).sort();
  if (other.length > 0) {
    sections.push({ title: "OTHER", icon: "📦", commands: other.map((name) => real.get(name)) });
  }

  return { sections, totalCommands: real.size };
}

function menuMessage(ctx, sections, totalCommands) {
  const p = config.PREFIX;
  const lines = [];
  lines.push(`╭━━『 *${config.BOT_NAME}* 』━━╮`, "");
  lines.push(`👋 Hello @${ctx.shortId(ctx.senderId)}!`);
  lines.push(`⚡ Prefix: ${p}   •   📦 ${totalCommands} commands`);
  if (config.OWNER_NAME) lines.push(`👑 Owner: ${config.OWNER_NAME}`);
  lines.push("", "━━━━━━━━━━━━━━━━━", "📖 *MENU* — send a number", "━━━━━━━━━━━━━━━━━", "");
  sections.forEach((section, i) => lines.push(`${p}${i + 1}  ${section.icon} *${section.title}*`));
  lines.push("", `💡 ${p}1 opens ${sections[0].title} • ${p}help ${sections[0].title.toLowerCase()} works too`);
  return lines.join("\n");
}

function sectionMessage(section) {
  const p = config.PREFIX;
  const lines = [];
  lines.push(`╭━━『 ${section.icon} *${section.title}* 』━━╮`, "");
  for (const command of section.commands) {
    const [usage, summary] = commandInfo(command);
    lines.push(`▪️ *${p}${command.name}*${usage ? " " + usage : ""}`);
    if (summary) lines.push(`   └ ${summary}`);
  }
  lines.push("", `↩️ Send ${p}help for the menu`);
  return lines.join("\n");
}

module.exports = {
  name: "help",
  description: "Show the command menu — then !1, !2, ... open each section",
  
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

    const section = /^\d+$/.test(wanted)
      ? sections[parseInt(wanted, 10) - 1]
      : sections.find((s) => s.title.toLowerCase() === wanted);

    if (!section) {
      return ctx.sendMention(`❌ There's no section "${wanted}". Send ${p}help to see the menu.`, []);
    }

    await ctx.sendMention(sectionMessage(section), []);
  },
};
