const SENTENCES = [
  "You're nothing but a prostitute - Crimewatch",
  "Melvin, Melvin is no name for a gang member - Jun Xiang 'crimewatch'",
  "You JOLLY-WELL stayback!!",
  "Why nver go toilet during recess?",
  "'Good Morning fuhuanites, we would be having morning assembly in the hall, all please proceed towards the hall' - Liu Yao Zhong",
  ];

module.exports = {
  name: "singlish",
  description: "Says something random",
  async execute(ctx) {
    const line = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
    await ctx.sendText(line);
  },
};
