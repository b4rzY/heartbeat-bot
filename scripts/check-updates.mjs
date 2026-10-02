// Polls Steam news for each game and posts new items to its #updates channel.
// State lives in Discord itself: we compare against our own last posted embeds.
import { readFileSync } from 'node:fs';
import { discord } from '../lib/discord.js';
import { GAMES } from '../lib/games.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const BACKFILL = 3;
const me = await discord('GET', '/users/@me');

function toEmbed(game, item) {
  const raw = item.contents.replaceAll('{STEAM_CLAN_IMAGE}', 'https://clan.akamai.steamstatic.com/images');
  const img = raw.match(/\[img(?:\s+src="([^"]+)")?[^\]]*\](?:([^\[]+)\[\/img\])?/i);
  const image = img?.[1] || img?.[2]?.trim();
  const text = raw
    .replace(/\[img[^\]]*\](?:[^\[]*\[\/img\])?/gi, '')
    .replace(/\[\*\]/g, '• ')
    .replace(/\[\/?[a-z0-9]+(?:[= ][^\]]*)?\]/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    title: item.title.slice(0, 256),
    url: item.url,
    description: text.length > 500 ? text.slice(0, 500).trimEnd() + '…' : text,
    color: game.color,
    timestamp: new Date(item.date * 1000).toISOString(),
    author: { name: `${game.emoji} ${game.name}` },
    thumbnail: { url: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg` },
    image: image?.startsWith('http') ? { url: image } : undefined,
    footer: { text: 'Steam news' },
  };
}

for (const game of GAMES.filter((g) => g.appid)) {
  const ids = config.games[game.slug];
  try {
    const res = await fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${game.appid}&count=10&feeds=steam_community_announcements`);
    const items = (await res.json()).appnews?.newsitems ?? [];
    const recent = await discord('GET', `/channels/${ids.updatesId}/messages?limit=50`);
    const ours = recent.filter((m) => m.author.id === me.id && m.embeds[0]?.url);
    const posted = new Set(ours.map((m) => m.embeds[0].url));
    const newest = Math.max(0, ...ours.map((m) => Date.parse(m.embeds[0].timestamp) / 1000 || 0));

    const backfill = ours.length === 0;
    const fresh = items
      .filter((i) => !posted.has(i.url) && (backfill || i.date > newest))
      .sort((a, b) => a.date - b.date)
      .slice(backfill ? -BACKFILL : 0);

    for (const item of fresh) {
      await discord('POST', `/channels/${ids.updatesId}/messages`, {
        content: backfill ? undefined : `<@&${ids.roleId}> new ${game.name} update!`,
        allowed_mentions: { roles: backfill ? [] : [ids.roleId] },
        embeds: [toEmbed(game, item)],
      });
    }
    console.log(`${game.name}: ${fresh.length} posted${backfill ? ' (backfill)' : ''}`);
  } catch (err) {
    console.error(`${game.name}: ${err.message}`);
    process.exitCode = 1;
  }
}
