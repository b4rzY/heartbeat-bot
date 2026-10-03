// Steam build + patch-note lookups and the embeds built from them
export const NOTES_WINDOW = 2 * 86400; // notes within 2 days of a build count as its patch notes
const PATCH = /patch|hotfix|update|fix|notes|changelog|maintenance|\bv?\d+\.\d+/i;
const NOT_PATCH = /sale|% off|discount|free (weekend|to play|play)|play .* free|giveaway|bundle|survey|twitch drops|wishlist|dev ?blog|price/i;

export function toEmbed(game, item) {
  const raw = item.contents.replaceAll('{STEAM_CLAN_IMAGE}', 'https://clan.akamai.steamstatic.com/images');
  const img = raw.match(/\[img(?:\s+src="([^"]+)")?[^\]]*\](?:([^\[]+)\[\/img\])?/i);
  const image = img?.[1] || img?.[2]?.trim();
  const text = raw
    .replace(/\[img[^\]]*\](?:[^\[]*\[\/img\])?/gi, '')
    .replace(/\[\*\]/g, '• ')
    .replace(/\[\/\*\]/g, '')
    .replace(/\[(?:\/p|br|\/h\d|\/list|hr)\]/gi, '\n')
    .replace(/\[\/?[a-z0-9]+(?:[= ][^\]]*)?\]/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    title: item.title.slice(0, 256),
    url: item.url,
    description: text.length > 1500 ? text.slice(0, 1500).trimEnd() + '…' : text,
    color: game.color,
    timestamp: new Date(item.date * 1000).toISOString(),
    author: { name: `${game.emoji} ${game.name} patch notes` },
    image: image?.startsWith('http') ? { url: image } : undefined,
    footer: { text: 'Steam' },
  };
}

// prev = the build this one replaced; omit it to describe the current build on its own
export function buildEmbed(game, build, prev) {
  return {
    title: prev ? `${game.emoji} ${game.name} update is live` : `${game.emoji} ${game.name} latest update`,
    url: `https://steamdb.info/app/${game.appid}/patchnotes/`,
    description: prev
      ? `A new client build was just pushed on Steam. Update your game.\n\nBuild **${prev}** → **${build.buildid}**`
      : `Latest client build on Steam: **${build.buildid}**`,
    color: game.color,
    timestamp: new Date(build.timeupdated * 1000).toISOString(),
    thumbnail: { url: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg` },
    footer: { text: game.branch ? `Steam · ${game.branch} branch` : 'Steam' },
  };
}

export async function getBuild(game) {
  const res = await fetch(`https://api.steamcmd.net/v1/info/${game.appid}`);
  if (!res.ok) throw new Error(`steamcmd ${res.status}`);
  const branch = (await res.json()).data[game.appid]?.depots?.branches?.[game.branch ?? 'public'];
  if (!branch?.buildid) throw new Error('no build info');
  return { buildid: branch.buildid, timeupdated: Number(branch.timeupdated) };
}

export async function getPatchNotes(game, since) {
  const res = await fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${game.appid}&count=10&feeds=steam_community_announcements`);
  const items = (await res.json()).appnews?.newsitems ?? [];
  return items
    .filter((i) => i.date >= since && PATCH.test(i.title) && !NOT_PATCH.test(i.title))
    .sort((a, b) => a.date - b.date);
}
