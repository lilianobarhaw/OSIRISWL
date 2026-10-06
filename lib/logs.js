// Journal du bot : qui a utilisé quelle commande, quand et où, plus les tickets et les annonces.
// Tout part dans le salon DISCORD_LOGS_CHANNEL_ID (sans variable, rien n'est envoyé).

import { bot, optEnv } from "./discord.js";
import { COMMANDS } from "./commandes.js";

export async function logEvent({ title, description, fields = [], color = 0xc4a265, user }) {
  const ch = optEnv("DISCORD_LOGS_CHANNEL_ID");
  if (!ch) return;
  try {
    await bot(`/channels/${ch}/messages`, {
      method: "POST",
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title, description, color, fields,
          ...(user ? { footer: { text: `${user.username} · ${user.id}` } } : {}),
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch {}
}

// « @lilian a utilisé /mute dans #général » + les options (membre, durée, raison…)
export function logCommand(i, user, refused) {
  const def = COMMANDS.find((c) => c.name === i.data.name);
  const fields = (i.data.options || []).map((o) => {
    const od = def?.options?.find((x) => x.name === o.name);
    let v = od?.choices?.find((c) => c.value === o.value)?.name ?? o.value;
    if (o.type === 6) v = `<@${o.value}>`;
    if (o.type === 5) v = o.value ? "oui" : "non";
    v = String(v ?? "").slice(0, 1000) || "—";
    return { name: o.name, value: v, inline: v.length < 40 };
  });
  return logEvent({
    title: `/${i.data.name}`,
    description: `<@${user.id}> a utilisé **/${i.data.name}** dans <#${i.channel_id}>`
      + (refused ? "\n❌ Refusée : commande réservée aux fondateurs et aux admins." : ""),
    fields,
    color: refused ? 0x9b1d1d : 0xc4a265,
    user,
  });
}
