
const axios = require("axios");

const JIKAN_BASE = "https://api.jikan.moe/v4";
const ANILIST_BASE = "https://graphql.anilist.co";

function truncate(text, max) {
  if (!text) return "";

  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max
    ? clean.slice(0, max).trim() + "…"
    : clean;
}

function cleanAniListText(text) {
  if (!text) return "";

  return String(text)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(?:i|b|em|strong)>/gi, "")
    .replace(/~!|!~/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchAnimeJikan(query) {
  const res = await axios.get(`${JIKAN_BASE}/anime`, {
    params: { q: query, limit: 1, sfw: true },
    timeout: 15000,
  });

  return res.data?.data?.[0] || null;
}

async function searchCharacterJikan(query) {
  const res = await axios.get(`${JIKAN_BASE}/characters`, {
    params: { q: query, limit: 1 },
    timeout: 15000,
  });

  return res.data?.data?.[0] || null;
}

async function searchAnimeAniList(query) {
  const gql = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        title {
          romaji
          english
        }
        description(asHtml: false)
        averageScore
        episodes
        status
        genres
        startDate {
          year
          month
          day
        }
        coverImage {
          large
        }
      }
    }
  `;

  const res = await axios.post(
    ANILIST_BASE,
    {
      query: gql,
      variables: { search: query },
    },
    {
      timeout: 15000,
      headers: { "Content-Type": "application/json" },
    }
  );

  return res.data?.data?.Media || null;
}

async function searchCharacterAniList(query) {
  const gql = `
    query ($search: String) {
      Character(search: $search) {
        name {
          full
          native
        }
        description(asHtml: false)
        image {
          large
        }
      }
    }
  `;

  const res = await axios.post(
    ANILIST_BASE,
    {
      query: gql,
      variables: { search: query },
    },
    {
      timeout: 15000,
      headers: { "Content-Type": "application/json" },
    }
  );

  return res.data?.data?.Character || null;
}

function normalizeAnimeFromJikan(anime) {
  return {
    title: anime.title_english || anime.title || "Unknown",
    altTitle:
      anime.title_english && anime.title_english !== anime.title
        ? anime.title
        : null,
    score: anime.score != null ? `${anime.score}/10` : "N/A",
    aired: anime.aired?.string || "Unknown",
    episodes: anime.episodes ?? "Unknown",
    status: anime.status || "Unknown",
    genres:
      (anime.genres || []).map((genre) => genre.name).join(", ") ||
      "Unknown",
    synopsis: anime.synopsis,
    image:
      anime.images?.jpg?.large_image_url ||
      anime.images?.jpg?.image_url ||
      null,
    source: "MyAnimeList",
  };
}

function normalizeAnimeFromAniList(media) {
  const date = media.startDate;
  const aired = date?.year
    ? [date.year, date.month, date.day].filter(Boolean).join("-")
    : "Unknown";

  const english = media.title?.english;
  const romaji = media.title?.romaji;

  return {
    title: english || romaji || "Unknown",
    altTitle: english && romaji && english !== romaji ? romaji : null,
    score: media.averageScore != null
      ? `${media.averageScore}/100`
      : "N/A",
    aired,
    episodes: media.episodes ?? "Unknown",
    status: media.status || "Unknown",
    genres: (media.genres || []).join(", ") || "Unknown",
    synopsis: cleanAniListText(media.description),
    image: media.coverImage?.large || null,
    source: "AniList",
  };
}

function normalizeCharacterFromJikan(character) {
  return {
    name: character.name || "Unknown",
    altName: character.name_kanji || null,
    about: character.about || "",
    image: character.images?.jpg?.image_url || null,
    source: "MyAnimeList",
  };
}

function normalizeCharacterFromAniList(character) {
  return {
    name: character.name?.full || "Unknown",
    altName: character.name?.native || null,
    about: cleanAniListText(character.description),
    image: character.image?.large || null,
    source: "AniList",
  };
}

async function fetchAnimeWithFallback(query) {
  try {
    const anime = await searchAnimeJikan(query);
    if (anime) return normalizeAnimeFromJikan(anime);
  } catch (err) {
    console.error("Jikan anime search failed:", err.message);
  }

  try {
    const anime = await searchAnimeAniList(query);
    if (anime) return normalizeAnimeFromAniList(anime);
  } catch (err) {
    console.error("AniList anime search failed:", err.message);
  }

  return null;
}

async function fetchCharacterWithFallback(query) {
  try {
    const character = await searchCharacterJikan(query);
    if (character) return normalizeCharacterFromJikan(character);
  } catch (err) {
    console.error("Jikan character search failed:", err.message);
  }

  try {
    const character = await searchCharacterAniList(query);
    if (character) return normalizeCharacterFromAniList(character);
  } catch (err) {
    console.error("AniList character search failed:", err.message);
  }

  return null;
}

function formatAnime(anime) {
  const altTitle = anime.altTitle ? ` (${anime.altTitle})` : "";

  return [
    `📺 *${anime.title}*${altTitle}`,
    "",
    `⭐ Score: ${anime.score}`,
    `📅 Aired: ${anime.aired}`,
    `🎬 Episodes: ${anime.episodes}`,
    `📊 Status: ${anime.status}`,
    `🏷️ Genres: ${anime.genres}`,
    "",
    truncate(anime.synopsis, 600) || "No synopsis available.",
    "",
    `_via ${anime.source}_`,
  ].join("\n");
}

function formatCharacter(character) {
  const altName = character.altName ? ` (${character.altName})` : "";

  return [
    `🎭 *${character.name}*${altName}`,
    "",
    truncate(character.about, 700) || "No bio available.",
    "",
    `_via ${character.source}_`,
  ].join("\n");
}

async function handleAnimeSearch(ctx, query) {
  const anime = await fetchAnimeWithFallback(query);

  if (!anime) {
    return ctx.sendText(
      `❌ No anime found for "${query}". Checked MyAnimeList and AniList.`
    );
  }

  const caption = formatAnime(anime);

  if (anime.image) {
    await ctx.sendImage(anime.image, caption);
  } else {
    await ctx.sendText(caption);
  }
}

async function handleCharacterSearch(ctx, query) {
  const character = await fetchCharacterWithFallback(query);

  if (!character) {
    return ctx.sendText(
      `❌ No character found for "${query}". Checked MyAnimeList and AniList.`
    );
  }

  const caption = formatCharacter(character);

  if (character.image) {
    await ctx.sendImage(character.image, caption);
  } else {
    await ctx.sendText(caption);
  }
}

module.exports = {
  name: "anime",
  description:
    "Search anime by name or use '!anime character <name>' to search characters.",

  async execute(ctx) {
    if (!ctx.args?.length) {
      return ctx.sendText(
        [
          "Usage:",
          "!anime <name> — search for an anime",
          "!anime character <name> — search for a character",
        ].join("\n")
      );
    }

    const first = ctx.args[0].toLowerCase();

    try {
      if (first === "character") {
        const query = ctx.args.slice(1).join(" ").trim();

        if (!query) {
          return ctx.sendText("Usage: !anime character <name>");
        }

        await handleCharacterSearch(ctx, query);
        return;
      }

      const query = ctx.args.join(" ").trim();
      await handleAnimeSearch(ctx, query);
    } catch (err) {
      console.error("Anime command failed:", err.message);

      await ctx.sendText(
        "❌ The anime search failed. Please try again later."
      );
    }
  },
};
