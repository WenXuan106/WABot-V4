const DEFAULT_SWEAR_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "damn",
  "wtf",
  "stfu",
];
const { getAsianParent, setAsianParent } = require('../lib/group-state');
module.exports = {
  name: 'asianparent',
  aliases: ['civilguard', 'parent'],
  description: 'AsianParent group language filter: on/off, add/remove/list words. Group admins only.',
  async execute(ctx) {
    if (!ctx.isGroup) return ctx.sendText('👪 AsianParent only works in group chats.');
    if (ctx.platform === 'whatsapp') {
      const status = await ctx.getAdminStatus();
      if (!status.senderIsAdmin && !ctx.isOwner()) return ctx.sendText('👪 Only group admins can manage AsianParent.');
    } else {
      return ctx.sendText('👪 AsianParent settings are currently supported on WhatsApp groups only.');
    }
    const data = getAsianParent(ctx.chatId);
    const sub = String(ctx.args[0] || 'status').toLowerCase();
    if (sub === 'on' || sub === 'off') {
      data.enabled = sub === 'on';
      setAsianParent(ctx.chatId, data);
      return ctx.sendText(data.enabled ? '👪 AsianParent is ON. Watch your language, ah.' : '👪 AsianParent is OFF. No more nagging for now.');
    }
    if (sub === 'add' || sub === 'remove') {
      const word = ctx.args.slice(1).join(' ').trim().toLowerCase();
      if (!word) return ctx.sendText(`Usage: !asianparent ${sub} <word>`);
      if (word.length > 60) return ctx.sendText('Keep the word/phrase under 60 characters.');
      data.words = Array.isArray(data.words) ? data.words : [];
      if (sub === 'add' && !data.words.includes(word)) data.words.push(word);
      if (sub === 'remove') data.words = data.words.filter((item) => item !== word);
      setAsianParent(ctx.chatId, data);
      return ctx.sendText(sub === 'add' ? `👪 Added “${word}” to AsianParent's list.` : `👪 Removed “${word}” from AsianParent's list if it existed.`);
    }
    if (sub === 'list' || sub === 'status') {
      return ctx.sendText([`👪 AsianParent: ${data.enabled ? 'ON' : 'OFF'}`, `Custom words: ${data.words?.length ? data.words.join(', ') : '(none)'}`, 'Built-in filter: common profanity'].join('\n'));
    }
    function containsSwearWord(message, words) {
  const text = message.toLowerCase();

  return words.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");

    return pattern.test(text);
  });
}
    return ctx.sendText(['👪 ASIANPARENT COMMANDS', '!asianparent on — turn filter on', '!asianparent off — turn filter off', '!asianparent add <word> — add a word', '!asianparent remove <word> — remove a word', '!asianparent list — show settings'].join('\n'));
  },
};
