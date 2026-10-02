const API = 'https://discord.com/api/v10';

// Tolerate common paste mistakes: Notepad BOM on the key, quotes, "Bot " prefix, whitespace
const token = (process.env.DISCORD_TOKEN ?? process.env['﻿DISCORD_TOKEN'] ?? '')
  .trim().replace(/^["']|["']$/g, '').replace(/^Bot\s+/i, '');

export async function discord(method, path, body) {
  if (!token) throw new Error('DISCORD_TOKEN is not set');
  for (;;) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const { retry_after } = await res.json();
      await new Promise((r) => setTimeout(r, (retry_after ?? 1) * 1000 + 100));
      continue;
    }
    if (res.status === 401) throw new Error(`Discord rejected the token (length ${token.length}, ${token.split('.').length} dot-separated parts; a valid one has 3)`);
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
}
