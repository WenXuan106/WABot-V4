const axios = require("axios");

function formatResult(item) {
  const title = item.l || "Untitled";
  const year = item.y ? ` (${item.y})` : "";
  const type = item.q ? ` · ${item.q}` : "";
  const cast = item.s ? `\n   Cast: ${item.s}` : "";
  const id = typeof item.id === "string" ? item.id : "";
  const link = id.startsWith("tt") ? `\n   https://www.imdb.com/title/${id}/` : "";
  return `🎬 *${title}*${year}${type}${cast}${link}`;
}

module.exports = {
  name: "movie",
  aliases: ["movies", "searchmovie", "imdb"],
  description: "Search movies and find IMDb details",
  async execute(ctx) {
    const query = ctx.args.join(" ").trim();
    if (!query) {
      return ctx.sendText(
        "🎬 *Movie Search*\nUsage: !movie <movie title>\nExample: !movie Your Name"
      );
    }

    try {
      const response = await axios.get(
        `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`,
        {
          timeout: 12000,
          headers: { "User-Agent": "WABot-V4 movie search" },
        }
      );

      const results = Array.isArray(response.data?.d) ? response.data.d : [];
      const movies = results
        .filter((item) => {
          const type = String(item.q || "").toLowerCase();
          return item.id && (type.includes("movie") || type === "feature" || type === "video");
        })
        .slice(0, 5);

      if (!movies.length) {
        return ctx.sendText(`🔎 No movie results found for *${query}*. Try another title.`);
      }

      const lines = [
        "🎬 *MOVIE SEARCH RESULTS*",
        `Search: ${query}`,
        "━━━━━━━━━━━━━━━━━━",
        ...movies.map((item, index) => `${index + 1}. ${formatResult(item)}`),
        "━━━━━━━━━━━━━━━━━━",
        "Results provided by IMDb. Some titles may include TV movies or videos.",
      ];
      await ctx.sendText(lines.join("\n\n"));
    } catch (error) {
      console.error("movie command failed:", error.message);
      await ctx.sendText("❌ Movie search is temporarily unavailable. Please try again later.");
    }
  },
};
