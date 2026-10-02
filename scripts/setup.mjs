// Idempotent: creates roles, categories and channels for Heart Beat, posts the
// role picker, and writes config.json with the resulting IDs. Never deletes.
import { writeFileSync } from 'node:fs';
import { discord } from '../lib/discord.js';
import { GAMES } from '../lib/games.js';

const GUILD = '471138099871744030';
const P = { VIEW: 1n << 10n, SEND: 1n << 11n, EMBED: 1n << 14n, HISTORY: 1n << 16n, THREADS: (1n << 35n) | (1n << 36n) | (1n << 38n), REACT: 1n << 6n };
const TEXT = 0, CATEGORY = 4;

const me = await discord('GET', '/users/@me');
let roles = await discord('GET', `/guilds/${GUILD}/roles`);
let channels = await discord('GET', `/guilds/${GUILD}/channels`);
const everyone = GUILD; // @everyone role id == guild id
const botAllow = { id: me.id, type: 1, allow: String(P.VIEW | P.SEND | P.EMBED | P.HISTORY), deny: '0' };

async function ensureRole(name, color) {
  const found = roles.find((r) => r.name === name);
  if (found) return found;
  const role = await discord('POST', `/guilds/${GUILD}/roles`, { name, color, mentionable: true, hoist: false });
  roles.push(role);
  console.log('+ role', name);
  return role;
}

async function ensureChannel(name, type, parentId, overwrites, topic) {
  const found = channels.find((c) => c.name === name && c.type === type && (c.parent_id ?? null) === (parentId ?? null));
  if (found) {
    // Keep permissions in sync on re-runs
    await discord('PATCH', `/channels/${found.id}`, { permission_overwrites: overwrites });
    return found;
  }
  const ch = await discord('POST', `/guilds/${GUILD}/channels`, {
    name, type, parent_id: parentId ?? undefined, permission_overwrites: overwrites, topic,
  });
  channels.push(ch);
  console.log('+ channel', name);
  return ch;
}

const readOnly = [
  { id: everyone, type: 0, allow: String(P.VIEW | P.HISTORY), deny: String(P.SEND | P.THREADS | P.REACT) },
  botAllow,
];

// START HERE
const start = await ensureChannel('📌 START HERE', CATEGORY, null, readOnly);
const welcome = await ensureChannel('welcome', TEXT, start.id, readOnly, 'Welcome to Heart Beat');
const picker = await ensureChannel('choose-your-games', TEXT, start.id, readOnly, 'Pick your games to get update pings');

// COMMUNITY
const community = await ensureChannel('💬 COMMUNITY', CATEGORY, null, []);
const general = await ensureChannel('general-chat', TEXT, community.id, [], 'Talk about anything');
await ensureChannel('media', TEXT, community.id, [], 'Clips, screenshots, highlights');
await ensureChannel('suggestions', TEXT, community.id, [], 'Ideas for the server — one suggestion per message');
await ensureChannel('bug-reports', TEXT, community.id, [], 'Server or bot bugs: what happened, what you expected, screenshots');

// Games
const config = { guildId: GUILD, games: {} };
for (const g of GAMES) {
  const role = await ensureRole(g.name, g.color);
  // Everyone can read every game; the role is only for update pings.
  const open = [botAllow];
  const cat = await ensureChannel(`${g.emoji} ${g.name}`, CATEGORY, null, open);
  const updates = await ensureChannel(`${g.slug}-updates`, TEXT, cat.id, readOnly,
    g.appid ? `Official ${g.name} patch notes & news (auto-posted from Steam)` : `Official ${g.name} news`);
  const chat = await ensureChannel(`${g.slug}-chat`, TEXT, cat.id, open, `${g.name} talk, LFG, clips`);
  config.games[g.slug] = { roleId: role.id, updatesId: updates.id, chatId: chat.id };
}
writeFileSync(new URL('../config.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');

// Role picker message (edit ours if it already exists)
const rows = [];
for (let i = 0; i < GAMES.length; i += 5) {
  rows.push({
    type: 1,
    components: GAMES.slice(i, i + 5).map((g) => ({
      type: 2, style: 2, label: g.name, emoji: { name: g.emoji }, custom_id: `role:${config.games[g.slug].roleId}`,
    })),
  });
}
const pickerMsg = {
  embeds: [{
    title: '🎮 Choose your games',
    description: 'Click a game to get its role. You\'ll be pinged in its **updates** channel whenever it gets a patch or news post. Click again to remove it.',
    color: 0xe91e63,
  }],
  components: rows,
};
await upsertBotMessage(picker.id, pickerMsg);

await upsertBotMessage(welcome.id, {
  embeds: [{
    title: '❤️ Welcome to Heart Beat',
    description: [
      `1. Head to <#${picker.id}> and pick the games you want update pings for.`,
      `2. Each game gets its own category with **#updates** (auto-posted patch notes) and **#chat**.`,
      `3. Hang out in <#${general.id}>, share clips in the media channel, and drop ideas or bugs in the suggestion and bug-report channels.`,
    ].join('\n'),
    color: 0xe91e63,
  }],
});

async function upsertBotMessage(channelId, body) {
  const msgs = await discord('GET', `/channels/${channelId}/messages?limit=20`);
  const mine = msgs.find((m) => m.author.id === me.id);
  if (mine) await discord('PATCH', `/channels/${channelId}/messages/${mine.id}`, body);
  else await discord('POST', `/channels/${channelId}/messages`, body);
}

console.log('Done. config.json written.');
