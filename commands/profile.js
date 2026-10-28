const sharp = require('sharp');
const { init, getPlayer, savePlayer, levelFor, xpForNextLevel } = require('../lib/player-data');

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function initials(name) {
  const parts = String(name || 'P').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || 'P').toUpperCase();
}

function profileSvg(player, level, xpProgress, avatarLetter) {
  const name = escapeXml(player.name || 'Player');
  const levelLabel = String(level).padStart(2, '0');
  const progressWidth = Math.round(420 * xpProgress);
  const winRate = player.gamesPlayed ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
  const safeStreak = Number(player.streak || 0);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#101827"/><stop offset="0.56" stop-color="#18243b"/><stop offset="1" stop-color="#26324a"/></linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3ffcb"/><stop offset="1" stop-color="#62d8ff"/></linearGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a3ffcb"/><stop offset="1" stop-color="#62d8ff"/></linearGradient>
      <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#ffffff" stroke-opacity="0.045" stroke-width="1"/></pattern>
    </defs>
    <rect width="1000" height="600" rx="34" fill="url(#bg)"/>
    <rect width="1000" height="600" rx="34" fill="url(#grid)"/>
    <path d="M700 -30 L1030 -30 L1030 280 L835 420 L690 260 Z" fill="#a3ffcb" opacity="0.07"/>
    <path d="M790 -20 L1010 -20 L1010 185 L890 270 L780 170 Z" fill="url(#accent)" opacity="0.16"/>
    <rect x="42" y="38" width="6" height="44" rx="3" fill="url(#accent)"/>
    <text x="66" y="57" fill="#a3ffcb" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="4">PLAYER DOSSIER</text>
    <text x="66" y="83" fill="#8292ad" font-family="Arial, sans-serif" font-size="13" letter-spacing="2">WABOT // PLAYER NETWORK</text>
    <rect x="795" y="43" width="160" height="38" rx="19" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.13"/>
    <circle cx="817" cy="62" r="5" fill="#a3ffcb"/><text x="832" y="67" fill="#d7e5f7" font-family="Arial, sans-serif" font-size="12" letter-spacing="1.2">ACTIVE PLAYER</text>
    <circle cx="139" cy="205" r="72" fill="#a3ffcb" opacity="0.12"/>
    <circle cx="139" cy="205" r="61" fill="#1c2e43" stroke="url(#accent)" stroke-width="3"/>
    <text x="139" y="219" text-anchor="middle" fill="url(#accent)" font-family="Arial, sans-serif" font-size="40" font-weight="700">${escapeXml(avatarLetter)}</text>
    <text x="230" y="171" fill="#8192ad" font-family="Arial, sans-serif" font-size="13" letter-spacing="2">CALLSIGN</text>
    <text x="230" y="215" fill="#f3f7ff" font-family="Arial, sans-serif" font-size="34" font-weight="700">${name.slice(0, 28)}</text>
    <text x="230" y="246" fill="#a6b5cc" font-family="Arial, sans-serif" font-size="16">Level ${level}  •  ${Number(player.xp || 0).toLocaleString()} total XP</text>
    <rect x="230" y="267" width="420" height="10" rx="5" fill="#ffffff" fill-opacity="0.09"/>
    <rect x="230" y="267" width="${progressWidth}" height="10" rx="5" fill="url(#bar)"/>
    <text x="230" y="297" fill="#8494ad" font-family="Arial, sans-serif" font-size="12">${Math.max(0, Number(player.xp || 0) - (level - 1) * (level - 1) * 100).toLocaleString()} / ${(level * level * 100 - (level - 1) * (level - 1) * 100).toLocaleString()} XP TO NEXT LEVEL</text>
    <text x="892" y="214" text-anchor="middle" fill="#f4f7ff" font-family="Arial, sans-serif" font-size="50" font-weight="700">${levelLabel}</text>
    <text x="892" y="240" text-anchor="middle" fill="#91a3bd" font-family="Arial, sans-serif" font-size="12" letter-spacing="2">LEVEL</text>
    <path d="M42 333H958" stroke="#ffffff" stroke-opacity="0.12"/>
    <g font-family="Arial, sans-serif">
      <rect x="42" y="358" width="218" height="105" rx="18" fill="#ffffff" fill-opacity="0.055" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="64" y="386" fill="#8fa1bc" font-size="12" letter-spacing="1.5">MATCHES</text><text x="64" y="430" fill="#f5f8ff" font-size="32" font-weight="700">${Number(player.gamesPlayed || 0).toLocaleString()}</text>
      <rect x="276" y="358" width="218" height="105" rx="18" fill="#ffffff" fill-opacity="0.055" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="298" y="386" fill="#8fa1bc" font-size="12" letter-spacing="1.5">WINS</text><text x="298" y="430" fill="#a3ffcb" font-size="32" font-weight="700">${Number(player.wins || 0).toLocaleString()}</text>
      <rect x="510" y="358" width="218" height="105" rx="18" fill="#ffffff" fill-opacity="0.055" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="532" y="386" fill="#8fa1bc" font-size="12" letter-spacing="1.5">WIN RATE</text><text x="532" y="430" fill="#f5f8ff" font-size="32" font-weight="700">${winRate}%</text>
      <rect x="744" y="358" width="214" height="105" rx="18" fill="#ffffff" fill-opacity="0.055" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="766" y="386" fill="#8fa1bc" font-size="12" letter-spacing="1.5">COINS</text><text x="766" y="430" fill="#62d8ff" font-size="32" font-weight="700">${Number(player.coins || 0).toLocaleString()}</text>
    </g>
    <rect x="42" y="492" width="916" height="1" fill="#ffffff" fill-opacity="0.12"/>
    <text x="46" y="534" fill="#8494ad" font-family="Arial, sans-serif" font-size="13">WIN STREAK  <tspan fill="#f5f8ff" font-weight="700">${safeStreak}</tspan>  /  BEST  <tspan fill="#f5f8ff" font-weight="700">${Number(player.bestStreak || 0)}</tspan></text>
    <text x="954" y="534" text-anchor="end" fill="#a3ffcb" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="2">MAKE YOUR NEXT MOVE ↗</text>
  </svg>`;
}

module.exports = {
  name: 'profile',
  aliases: ['me', 'rank'],
  description: 'Show your original player dossier card and game stats.',
  async execute(ctx) {
    await init();
    const targetId = String(ctx.getTargetUser() || ctx.senderId);
    const isSelf = targetId === ctx.senderId;
    const displayName = isSelf ? ctx.senderName : `Player ${String(targetId).split('@')[0].slice(-6)}`;
    let player = getPlayer(targetId, displayName);
    if (isSelf && ctx.senderName) player = savePlayer(targetId, ctx.senderName, player);
    const level = levelFor(player.xp || 0);
    const currentFloor = (level - 1) * (level - 1) * 100;
    const nextFloor = xpForNextLevel(level);
    const progress = Math.max(0, Math.min(1, ((player.xp || 0) - currentFloor) / Math.max(1, nextFloor - currentFloor)));
    let svg = profileSvg(player, level, progress, initials(player.name));

    try {
      const pictureUrl = await ctx.getProfilePictureUrl(targetId);
      if (pictureUrl) {
        const response = await fetch(pictureUrl, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Avatar fetch failed: ${response.status}`);
        const avatarBytes = Buffer.from(await response.arrayBuffer());
        if (avatarBytes.length > 5 * 1024 * 1024) throw new Error('Avatar image is too large');
        const avatar = await sharp(avatarBytes).resize(112, 112, { fit: 'cover' }).png().toBuffer();
        const base = await sharp(Buffer.from(svg)).png().toBuffer();
        const circle = Buffer.from('<svg width="112" height="112"><circle cx="56" cy="56" r="55" fill="white"/></svg>');
        const roundAvatar = await sharp(avatar).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
        const card = await sharp(base).composite([{ input: roundAvatar, left: 83, top: 149 }]).png().toBuffer();
        return ctx.sendImage(card, `✦ ${player.name} · Level ${level}`);
      }
    } catch (_) {}

    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    return ctx.sendImage(image, `✦ ${player.name} · Level ${level}`);
  },
};
