const { isSlipperOn, setSlipperOff } = require('../lib/group-state');
const config = require('../config');
module.exports = {
  name: 'slipper',
  aliases: ['bot', 'botoff'],
  description: 'Switch the bot off/on for this group. Group admins or the owner only.',
  async execute(ctx) {
    if (!ctx.isGroup) return ctx.sendText('🩴 Slipper only works in group chats.');
    const sub = String(ctx.args[0] || 'status').toLowerCase();
    const off = isSlipperOn(ctx.chatId);
    if (sub === 'status') return ctx.sendText(off ? '🩴 Slipper is on duty. Bot is OFF in this group. Use !slipper on to wake it up.' : '🩴 Slipper is resting. Bot is ON in this group. Use !slipper off to switch it off.');
    if (!['on', 'off'].includes(sub)) return ctx.sendText('Usage: !slipper on | off | status');
    if (ctx.platform === 'telegram') {
      if (!config.TELEGRAM_OWNER_ID || String(ctx.senderId) !== String(config.TELEGRAM_OWNER_ID)) return ctx.sendText('Only the configured Telegram bot owner can use Slipper. Set TELEGRAM_OWNER_ID in your environment.');
    } else {
      const status = await ctx.getAdminStatus();
      if (!status.senderIsAdmin && !ctx.isOwner()) return ctx.sendText('Only group admins or the bot owner can use Slipper.');
    }
    setSlipperOff(ctx.chatId, sub === 'off');
    return ctx.sendText(sub === 'off' ? '🩴 SLIPPER MODE ACTIVATED. Bot commands are paused in this group.' : '🩴 Slipper put away. Bot is back ON in this group.');
  },
};
