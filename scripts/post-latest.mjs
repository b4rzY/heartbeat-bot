// Posts a game's current Steam build and its patch notes to #<slug>-updates,
// without a ping. For seeding a newly added game: node scripts/post-latest.mjs <slug>
import { readFileSync } from 'node:fs';
import { discord } from '../lib/discord.js';
import { GAMES } from '../lib/games.js';
import { NOTES_WINDOW, toEmbed, buildEmbed, getBuild, getPatchNotes } from '../lib/steam.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const game = GAMES.find((g) => g.slug === process.argv[2] && g.appid);
if (!game) throw new Error(`Usage: post-latest.mjs <slug> (one of: ${GAMES.filter((g) => g.appid).map((g) => g.slug).join(', ')})`);

const build = await getBuild(game);
const notes = (await getPatchNotes(game, build.timeupdated - NOTES_WINDOW))
  .filter((n) => n.date <= build.timeupdated + NOTES_WINDOW)
  .slice(-1);
const embeds = [buildEmbed(game, build), ...notes.map((n) => toEmbed(game, n))];
if (process.argv.includes('--dry')) console.log(JSON.stringify(embeds, null, 2));
else await discord('POST', `/channels/${config.games[game.slug].updatesId}/messages`, { embeds });
console.log(`${game.name}: posted build ${build.buildid}${notes.length ? ` + "${notes[0].title}"` : ''}`);
