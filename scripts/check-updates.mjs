// Watches each game's Steam build and posts to #<slug>-updates the moment a new
// client build goes live (pinging the game role). Patch notes are attached when
// Steam has them, or posted (without a ping) once they show up. Sales, promos and
// dev blogs are never posted. Last-seen builds live in state.json, which the
// workflow commits back.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { discord } from '../lib/discord.js';
import { GAMES } from '../lib/games.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const STATE_URL = new URL('../state.json', import.meta.url);
const state = existsSync(STATE_URL) ? JSON.parse(readFileSync(STATE_URL)) : {};
const NOTES_WINDOW = 2 * 86400; // notes within 2 days of a build count as its patch notes
const PATCH = /patch|hotfix|update|fix|notes|changelog|maintenance|\bv?\d+\.\d+/i;
const NOT_PATCH = /sale|% off|discount|free (weekend|to play|play)|play .* free|giveaway|bundle|survey|twitch drops|wishlist|dev ?blog|price/i;

function toEmbed(game, item) {
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

function buildEmbed(game, build, prev) {
  return {
    title: `${game.emoji} ${game.name} update is live`,
    url: `https://steamdb.info/app/${game.appid}/patchnotes/`,
    description: `A new client build was just pushed on Steam. Update your game.\n\nBuild **${prev}** → **${build.buildid}**`,
    color: game.color,
    timestamp: new Date(build.timeupdated * 1000).toISOString(),
    thumbnail: { url: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg` },
    footer: { text: game.branch ? `Steam · ${game.branch} branch` : 'Steam' },
  };
}

async function getBuild(game) {
  const res = await fetch(`https://api.steamcmd.net/v1/info/${game.appid}`);
  if (!res.ok) throw new Error(`steamcmd ${res.status}`);
  const branch = (await res.json()).data[game.appid]?.depots?.branches?.[game.branch ?? 'public'];
  if (!branch?.buildid) throw new Error('no build info');
  return { buildid: branch.buildid, timeupdated: Number(branch.timeupdated) };
}

async function getPatchNotes(game, since) {
  const res = await fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${game.appid}&count=10&feeds=steam_community_announcements`);
  const items = (await res.json()).appnews?.newsitems ?? [];
  return items
    .filter((i) => i.date >= since && PATCH.test(i.title) && !NOT_PATCH.test(i.title))
    .sort((a, b) => a.date - b.date);
}

for (const game of GAMES.filter((g) => g.appid)) {
  const ids = config.games[game.slug];
  const s = (state[game.slug] ??= { notes: [] });
  try {
    const build = await getBuild(game);
    if (!s.buildid) {
      // First sighting: remember it, don't announce an old build.
      Object.assign(s, { buildid: build.buildid, changedAt: build.timeupdated });
      s.notes = (await getPatchNotes(game, 0)).map((n) => n.url);
      console.log(`${game.name}: baseline build ${build.buildid}`);
      continue;
    }

    const notes = (await getPatchNotes(game, (s.changedAt ?? build.timeupdated) - NOTES_WINDOW))
      .filter((n) => !s.notes.includes(n.url));

    if (build.buildid !== s.buildid) {
      const fresh = await getPatchNotes(game, build.timeupdated - NOTES_WINDOW);
      const attach = fresh.filter((n) => !s.notes.includes(n.url)).slice(-1);
      await discord('POST', `/channels/${ids.updatesId}/messages`, {
        content: `<@&${ids.roleId}> new ${game.name} update!`,
        allowed_mentions: { roles: [ids.roleId] },
        embeds: [buildEmbed(game, build, s.buildid), ...attach.map((n) => toEmbed(game, n))],
      });
      s.notes.push(...attach.map((n) => n.url));
      Object.assign(s, { buildid: build.buildid, changedAt: build.timeupdated });
      console.log(`${game.name}: new build ${build.buildid}${attach.length ? ' + notes' : ''}`);
    } else if (notes.length && Date.now() / 1000 - s.changedAt < NOTES_WINDOW) {
      // Notes published after the build went live: post them quietly.
      for (const n of notes) {
        await discord('POST', `/channels/${ids.updatesId}/messages`, { embeds: [toEmbed(game, n)] });
        s.notes.push(n.url);
      }
      console.log(`${game.name}: ${notes.length} late patch notes`);
    } else {
      console.log(`${game.name}: no change (${build.buildid})`);
    }
    s.notes = s.notes.slice(-20);
  } catch (err) {
    console.error(`${game.name}: ${err.message}`);
    process.exitCode = 1;
  }
}

writeFileSync(STATE_URL, JSON.stringify(state, null, 2) + '\n');
