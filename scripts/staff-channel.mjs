// Turns the old #fortnite channel into a private #staff-chat.
// Only King + Nobles can see and chat. (Roles with Administrator bypass this.)
// Dry run by default — pass --apply to change anything.
import { discord } from '../lib/discord.js';

const GUILD = '471138099871744030';
const APPLY = process.argv.includes('--apply');
const ADMIN = 1n << 3n;
const P = { VIEW: 1n << 10n, SEND: 1n << 11n, HISTORY: 1n << 16n, THREADS: (1n << 35n) | (1n << 36n) | (1n << 38n) };

const me = await discord('GET', '/users/@me');
const roles = await discord('GET', `/guilds/${GUILD}/roles`);
const channels = await discord('GET', `/guilds/${GUILD}/channels`);

console.log('Roles (highest first):');
for (const r of [...roles].sort((a, b) => b.position - a.position)) {
  console.log(`  ${r.name}${BigInt(r.permissions) & ADMIN ? '  [Administrator]' : ''}`);
}

const fortnite = channels.filter((c) => c.type === 0 && /fortnite/i.test(c.name));
const king = roles.find((r) => /^king/i.test(r.name));
const nobles = roles.find((r) => /^noble/i.test(r.name));

console.log('\nFortnite text channels:', fortnite.map((c) => `#${c.name}`).join(', ') || 'none');
console.log('King role:', king?.name ?? 'NOT FOUND');
console.log('Nobles role:', nobles?.name ?? 'NOT FOUND');

if (fortnite.length !== 1 || !king || !nobles) {
  console.log('\nStopping: need exactly one fortnite channel plus King and Nobles roles.');
  process.exit(1);
}

const chat = String(P.VIEW | P.SEND | P.HISTORY);
const overwrites = [
  { id: GUILD, type: 0, allow: '0', deny: String(P.VIEW) }, // @everyone hidden
  { id: king.id, type: 0, allow: chat, deny: '0' },
  { id: nobles.id, type: 0, allow: chat, deny: '0' },
  { id: me.id, type: 1, allow: chat, deny: '0' },
];

console.log(`\nPlan: #${fortnite[0].name} -> #staff-chat, hidden from everyone else.`);
if (!APPLY) {
  console.log('Dry run. Re-run with --apply to make the change.');
  process.exit(0);
}
await discord('PATCH', `/channels/${fortnite[0].id}`, {
  name: 'staff-chat', topic: 'Staff only — King & Nobles', permission_overwrites: overwrites,
});
console.log('Done.');
