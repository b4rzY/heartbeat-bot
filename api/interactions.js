// Discord interactions endpoint: verifies the signature and toggles game roles
// when someone clicks a button in #choose-your-games.
import { createPublicKey, verify } from 'node:crypto';
import config from '../config.json' with { type: 'json' };
import { discord } from '../lib/discord.js';

const key = createPublicKey({
  key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(process.env.DISCORD_PUBLIC_KEY, 'hex')]),
  format: 'der',
  type: 'spki',
});
const gameRoles = new Set(Object.values(config.games).map((g) => g.roleId));

const reply = (content) => Response.json({ type: 4, data: { content, flags: 64 } });

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  if (!sig || !ts || !verify(null, Buffer.from(ts + body), key, Buffer.from(sig, 'hex'))) {
    return new Response('bad signature', { status: 401 });
  }

  const i = JSON.parse(body);
  if (i.type === 1) return Response.json({ type: 1 }); // PING

  if (i.type === 3 && i.data.custom_id.startsWith('role:')) {
    const roleId = i.data.custom_id.slice(5);
    if (!gameRoles.has(roleId) || !i.member) return reply('Unknown role.');
    const has = i.member.roles.includes(roleId);
    await discord(has ? 'DELETE' : 'PUT', `/guilds/${i.guild_id}/members/${i.member.user.id}/roles/${roleId}`);
    return reply(has ? `Removed <@&${roleId}>.` : `Added <@&${roleId}> — its channels are now unlocked.`);
  }

  return reply('Unknown interaction.');
}
