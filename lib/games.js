const fs = require('fs');
const path = require('path');
const { getPlayer, recordGame, keyFor } = require('../lib/player-data');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSION_FILE = path.join(DATA_DIR, 'game-sessions.json');
const TRIVIA = [
  { q: 'Which planet has the most prominent ring system?', a: ['saturn'] },
  { q: 'What is the only mammal capable of true flight?', a: ['bat', 'bats'] },
  { q: 'How many sides does a hexagon have?', a: ['6', 'six'] },
  { q: 'What is the chemical symbol for gold?', a: ['au'] },
  { q: 'Which ocean is the largest on Earth?', a: ['pacific', 'pacific ocean'] },
  { q: 'What is the square root of 144?', a: ['12', 'twelve'] },
  { q: 'What is the fastest land animal?', a: ['cheetah'] },
  { q: 'How many minutes are in three hours?', a: ['180', 'one hundred eighty'] },
];
const SCRAMBLE_WORDS = ['nebula', 'pixel', 'comet', 'thunder', 'lantern', 'orbit', 'dragon', 'mystery', 'crystal', 'velvet'];

function readSessions() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch (_) { return {}; }
}
function writeSessions(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${SESSION_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, SESSION_FILE);
}
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function norm(value) { return String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
function award(ctx, result, coins, xp, message) {
  recordGame(ctx.senderId, ctx.senderName, result, coins, xp);
  return ctx.sendText(message);
}
function gamesHelp(prefix) {
  return `╭─「 ARCADE / GAME DECK 」\n│ ${prefix}games — show this deck\n│ ${prefix}rps <rock|paper|scissors> — quick duel\n│ ${prefix}coinflip [heads|tails] — risk 10 coins\n│ ${prefix}dice [1-6] — roll or guess the roll\n│ ${prefix}guess — start a number challenge\n│ ${prefix}guess <1-10> — submit your guess\n│ ${prefix}trivia — start a knowledge round\n│ ${prefix}trivia <answer> — answer the round\n│ ${prefix}scramble — start a word puzzle\n│ ${prefix}scramble <word> — solve it\n│ ${prefix}profile — view your player dossier\n╰─ Win games to earn XP and coins.`;
}

module.exports = {
  name: 'games',
  aliases: ['rps', 'coinflip', 'dice', 'guess', 'trivia', 'scramble'],
  description: 'Original mini-game deck: RPS, coinflip, dice, number guess, trivia and word scramble.',
  async execute(ctx) {
    const prefix = String(config.PREFIX || '-');
    const cmd = String(ctx.commandName || 'games').toLowerCase();
    const args = ctx.args || [];
    const userKey = keyFor(ctx.senderId);
    const sessions = readSessions();

    if (cmd === 'games' || !cmd) return ctx.sendText(gamesHelp(prefix));

    if (cmd === 'rps') {
      const choices = ['rock', 'paper', 'scissors'];
      const playerChoice = norm(args[0]);
      if (!choices.includes(playerChoice)) return ctx.sendText(`✦ RPS DUEL\nChoose one: ${prefix}rps rock | paper | scissors`);
      const botChoice = choices[randomInt(0, 2)];
      if (playerChoice === botChoice) return award(ctx, 'draw', 0, 5, `◈ DRAW\nYou: ${playerChoice}\nArcade: ${botChoice}\n+5 XP · no coins lost`);
      const win = (playerChoice === 'rock' && botChoice === 'scissors') || (playerChoice === 'paper' && botChoice === 'rock') || (playerChoice === 'scissors' && botChoice === 'paper');
      return win
        ? award(ctx, 'win', 15, 20, `✦ YOU WIN\nYou: ${playerChoice}  >  Arcade: ${botChoice}\n+15 coins · +20 XP`)
        : award(ctx, 'loss', -8, 5, `◇ ARCADE WINS\nYou: ${playerChoice}  <  Arcade: ${botChoice}\n−8 coins · +5 XP. Run it back?`);
    }

    if (cmd === 'coinflip') {
      const choice = norm(args[0]);
      if (choice && !['heads', 'tails'].includes(choice)) return ctx.sendText(`Usage: ${prefix}coinflip [heads|tails]`);
      const player = getPlayer(ctx.senderId, ctx.senderName);
      if (player.coins < 10) return ctx.sendText('You need at least 10 coins to play this round.');
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      if (!choice) return ctx.sendText(`◉ COIN ORBIT\nThe coin lands on: ${result.toUpperCase()}\nTip: ${prefix}coinflip heads (or tails) to wager 10 coins.`);
      if (choice === result) return award(ctx, 'win', 10, 15, `◉ ${result.toUpperCase()}!\nYou called it. +10 coins net · +15 XP`);
      return award(ctx, 'loss', -10, 3, `◉ ${result.toUpperCase()}!\nYour call was ${choice}. −10 coins · +3 XP`);
    }

    if (cmd === 'dice') {
      const guess = Number(args[0]);
      if (args[0] && (!Number.isInteger(guess) || guess < 1 || guess > 6)) return ctx.sendText(`Usage: ${prefix}dice [1-6]`);
      const roll = randomInt(1, 6);
      if (!args[0]) return ctx.sendText(`⚄ DICE DROP\nThe die rolled ${roll}.\nGuess next time: ${prefix}dice <1-6>`);
      if (guess === roll) return award(ctx, 'win', 25, 25, `⚄ PERFECT HIT — ${roll}\n+25 coins · +25 XP`);
      return award(ctx, 'loss', -5, 4, `⚄ The die rolled ${roll}; you guessed ${guess}.\n−5 coins · +4 XP`);
    }

    if (cmd === 'guess') {
      const guess = Number(args[0]);
      if (!args.length) {
        sessions[userKey] = { type: 'guess', answer: randomInt(1, 10), expiresAt: Date.now() + 120000 };
        writeSessions(sessions);
        return ctx.sendText(`⌁ NUMBER VAULT\nI'm holding a number from 1–10. You have one shot.\nSend: ${prefix}guess <number>\nRound expires in 2 minutes.`);
      }
      const session = sessions[userKey];
      if (!session || session.type !== 'guess' || session.expiresAt < Date.now()) return ctx.sendText(`Start a new round first: ${prefix}guess`);
      delete sessions[userKey]; writeSessions(sessions);
      if (!Number.isInteger(guess) || guess < 1 || guess > 10) return ctx.sendText('Choose a whole number from 1 to 10. Start again with the guess command.');
      if (guess === session.answer) return award(ctx, 'win', 20, 30, `⌁ CRACKED IT!\nThe vault number was ${session.answer}. +20 coins · +30 XP`);
      return award(ctx, 'loss', -2, 5, `⌁ LOCKED OUT\nThe number was ${session.answer}. −2 coins · +5 XP. Try again?`);
    }

    if (cmd === 'trivia') {
      const session = sessions[userKey];
      if (!args.length) {
        const question = TRIVIA[randomInt(0, TRIVIA.length - 1)];
        sessions[userKey] = { type: 'trivia', answer: question.a, question: question.q, expiresAt: Date.now() + 180000 };
        writeSessions(sessions);
        return ctx.sendText(`⌘ QUICKFIRE TRIVIA\n${question.q}\n\nAnswer with: ${prefix}trivia <answer>`);
      }
      if (!session || session.type !== 'trivia' || session.expiresAt < Date.now()) return ctx.sendText(`No active trivia round. Start one with ${prefix}trivia`);
      delete sessions[userKey]; writeSessions(sessions);
      if (session.answer.some((answer) => norm(answer) === norm(args.join(' ')))) return award(ctx, 'win', 12, 22, `⌘ CORRECT!\n${session.question}\n+12 coins · +22 XP`);
      return award(ctx, 'loss', -1, 4, `⌘ Not quite! The answer was: ${session.answer[0]}.\n−1 coin · +4 XP`);
    }

    if (cmd === 'scramble') {
      const session = sessions[userKey];
      if (!args.length) {
        const answer = SCRAMBLE_WORDS[randomInt(0, SCRAMBLE_WORDS.length - 1)];
        let scrambled = answer;
        for (let i = 0; i < 8 && scrambled === answer; i++) scrambled = answer.split('').sort(() => Math.random() - 0.5).join('');
        sessions[userKey] = { type: 'scramble', answer, scrambled, expiresAt: Date.now() + 180000 };
        writeSessions(sessions);
        return ctx.sendText(`⟡ WORD FLUX\nDecode this word:  ${scrambled.toUpperCase()}\n\nAnswer with: ${prefix}scramble <word>`);
      }
      if (!session || session.type !== 'scramble' || session.expiresAt < Date.now()) return ctx.sendText(`No active puzzle. Start one with ${prefix}scramble`);
      delete sessions[userKey]; writeSessions(sessions);
      if (norm(args.join(' ')) === norm(session.answer)) return award(ctx, 'win', 14, 24, `⟡ SOLVED: ${session.answer.toUpperCase()}\n+14 coins · +24 XP`);
      return award(ctx, 'loss', -1, 4, `⟡ The word was ${session.answer.toUpperCase()}.\n−1 coin · +4 XP`);
    }

    return ctx.sendText(gamesHelp(prefix));
  },
};
