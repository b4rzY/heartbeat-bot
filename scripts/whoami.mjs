// Diagnostic: which bot is this token, and which servers is it in?
import { discord } from '../lib/discord.js';

const me = await discord('GET', '/users/@me');
console.log('bot:', me.username, me.id);
const guilds = await discord('GET', '/users/@me/guilds');
console.log('guilds:', guilds.length ? guilds.map((g) => `${g.name} (${g.id})`).join(', ') : 'none');
