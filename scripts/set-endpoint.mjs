// Points the app's Interactions Endpoint URL at the Vercel deployment.
// Discord pings the URL first and rejects the change if verification fails.
import { discord } from '../lib/discord.js';

const url = 'https://heartbeat-bot.vercel.app/api/interactions';
const app = await discord('PATCH', '/applications/@me', { interactions_endpoint_url: url });
console.log('Interactions Endpoint URL:', app.interactions_endpoint_url);
