const SENTENCES = [
  "You're nothing but a prostitute - Crimewatch",
  "Melvin, Melvin is no name for a gang member - Jun Xiang 'crimewatch'",
  "You JOLLY-WELL stayback!!",
  "Why nver go toilet during recess?",
  "'Good Morning fuhuanites, we would be having morning assembly in the hall, all please proceed towards the hall' - Liu Yao Zhong",
  "the harder the shit, the longer you shit.",
  "in order to chase your dream, you will have to dream for days",
  "the stronger the meat, the harder to beat",
  "when you study, you pass, when you pass, you dont study, and when you dont study, you fail, and when you fail, you die, so dont study",
  "to confuse the enemy, you must first confuse yourself",
  "the more you sleep, the longer you are awake",
  "the more you eat, the fatter you get",
  "Life is like a dih. sometimes it up, sometimes it down. But it's not always hard, and it's short",
  ];

module.exports = {
  name: "singlish",
  description: "Says something random",
  async execute(ctx) {
    const line = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
    await ctx.sendText(line);
  },
};
