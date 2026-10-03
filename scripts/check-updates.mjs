// Watches each game's Steam build and posts to #<slug>-updates the moment a new
// client build goes live (pinging the game role). Patch notes are attached when
// Steam has them, or posted (without a ping) once they show up. Sales, promos and
// dev blogs are never posted. Last-seen builds live in state.json, which the
// workflow commits back.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { discord } from '../lib/discord.js';
import { GAMES } from '../lib/games.js';
import { NOTES_WINDOW, toEmbed, buildEmbed, getBuild, getPatchNotes } from '../lib/steam.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const STATE_URL = new URL('../state.json', import.meta.url);
const state = existsSync(STATE_URL) ? JSON.parse(readFileSync(STATE_URL)) : {};

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
