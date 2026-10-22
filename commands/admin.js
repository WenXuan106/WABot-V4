module.exports = {
  name: 'admin',
  aliases: ['adminhelp'],
  description: 'Manage group members and view Asian meme admin tools.',
  async execute(ctx) {
    if (!ctx.isGroup) return ctx.sendText('🧧 Admin tools are for group chats.');
    if (ctx.platform !== 'whatsapp') return ctx.sendText('🧧 These group admin actions currently work on WhatsApp only.');
    const status = await ctx.getAdminStatus();
    if (!status.senderIsAdmin && !ctx.isOwner()) return ctx.sendText('⛔ Only group admins or the bot owner can use these tools.');
    const action = String(ctx.args[0] || 'help').toLowerCase();
    if (action === 'help' || action === 'menu') {
      return ctx.sendText([
        '🧧 *ASIAN MENU*',
        '',
        '🩴 *Slipper* — bot on/off switch',
        '!slipper off | !slipper on | !slipper status',
        '',
        '👪 *AsianParent* — language filter',
        '!asianparent on/off/list',
        '!asianparent add <word>',
        '!asianparent remove <word>',
        '',
        '🛠️ *Group controls*',
        '!admin kick — reply to or mention a member',
        '!admin promote — reply to or mention a member',
        '!admin demote — reply to or mention a member',
        '!admin lock | !admin unlock — restrict or reopen group chat',
      ].join('\n'));
    }
    if (['kick', 'promote', 'demote'].includes(action)) {
      const target = ctx.getTargetUser?.();
      if (!target) return ctx.sendText(`Usage: reply to a member or mention them with !admin ${action}`);
      if (!status.botIsAdmin) return ctx.sendText('⛔ Make the bot a group admin first.');
      try {
        let ok = false;
        if (action === 'kick') ok = await ctx.removeMember(target);
        else ok = await ctx.setMemberAdmin(target, action === 'promote');
        return ctx.sendText(ok ? `✅ ${action === 'kick' ? 'Member removed' : action === 'promote' ? 'Member promoted' : 'Member demoted'}.` : '⚠️ WhatsApp did not confirm the action.');
      } catch (error) {
        return ctx.sendText(`⚠️ Could not ${action} that member: ${error.message}`);
      }
    }
    if (action === 'lock' || action === 'unlock') {
      if (!status.botIsAdmin) return ctx.sendText('⛔ Make the bot a group admin first.');
      try {
        await ctx.setGroupLocked(action === 'lock');
        return ctx.sendText(action === 'lock' ? '🔒 Group locked: only admins can send messages.' : '🔓 Group unlocked: everyone can send messages.');
      } catch (error) {
        return ctx.sendText(`⚠️ Could not ${action} the group: ${error.message}`);
      }
    }
    return ctx.sendText('Unknown action. Send !admin help to see available tools.');
  },
};
