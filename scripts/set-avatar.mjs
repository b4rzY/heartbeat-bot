// Sets the bot's avatar to assets/avatar.png (the Heart Beat server icon).
import { readFileSync } from 'node:fs';
import { discord } from '../lib/discord.js';

const png = readFileSync(new URL('../assets/avatar.png', import.meta.url));
const me = await discord('PATCH', '/users/@me', { avatar: `data:image/png;base64,${png.toString('base64')}` });
console.log('avatar set for', me.username);
