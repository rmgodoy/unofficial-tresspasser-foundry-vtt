/**
 * Light sources detection, aggregation, and depletion prompt for dungeon exploration.
 */

/**
 * Get the character actors that belong to the active party.
 * Falls back to all character actors if no party exists.
 * @returns {Actor[]}
 */
export function getPartyMembers() {
  const party = game.trespasser.TrespasserPartyHelper?.getActiveParty();
  if (party) {
    const memberIds = party.system?.members ?? [];
    return memberIds.map(id => game.actors.get(id)).filter(a => a?.type === "character");
  }
  return game.actors.filter(a => a.type === "character");
}

/**
 * Scan party members for equipped items that are light sources.
 * @returns {Object[]}
 */
export function aggregateLightSources() {
  const lightTags = CONFIG.TRESPASSER.dungeon.lightSourceTags ?? [];
  const sources = [];

  for (const actor of getPartyMembers()) {
    for (const item of actor.items) {
      let isLightSource = false;
      let depletionDie = "";

      if (item.system?.isLightFuel) {
        isLightSource = true;
        depletionDie = item.system.depletionDie ?? "";
      }

      if (!isLightSource && item.type === "equipment") {
        if (!item.system?.equipped && item.system?.equipped !== undefined) continue;
        const tags = item.system?.tags ?? [];
        const tagMatch = tags.some(t => lightTags.includes(t.toLowerCase()));
        const nameMatch = lightTags.some(t => item.name.toLowerCase().includes(t));
        if (tagMatch || nameMatch) {
          isLightSource = true;
          depletionDie = item.system?.depletionDie ?? "";
        }
      }

      if (isLightSource) {
        sources.push({
          actorName: actor.name,
          itemName: item.name,
          quantity: item.system?.quantity ?? 1,
          depletionDie
        });
      }
    }
  }

  return sources;
}

/**
 * At end of round, prompt the GM to roll depletion for active light sources.
 * @param {Actor} dungeon
 */
export async function promptLightDepletion(dungeon) {
  const lightTags = CONFIG.TRESPASSER.dungeon.lightSourceTags ?? [];
  const activeSources = [];

  const party = game.trespasser.TrespasserPartyHelper?.getActiveParty();
  const characters = party
    ? (party.system?.members ?? []).map(id => game.actors.get(id)).filter(a => a?.type === "character")
    : game.actors.filter(a => a.type === "character");

  for (const actor of characters) {
    for (const item of actor.items) {
      let isLightSource = false;
      let depDie = "";

      if (item.system?.isLightFuel) {
        isLightSource = true;
        depDie = item.system.depletionDie ?? "";
      }

      if (!isLightSource && item.type === "equipment") {
        if (!item.system?.equipped && item.system?.equipped !== undefined) continue;
        const tags = item.system?.tags ?? [];
        const tagMatch = tags.some(t => lightTags.includes(t.toLowerCase()));
        const nameMatch = lightTags.some(t => item.name.toLowerCase().includes(t));
        if (tagMatch || nameMatch) {
          isLightSource = true;
          depDie = item.system?.depletionDie ?? "";
        }
      }

      if (isLightSource && depDie) {
        activeSources.push({
          actorName: actor.name,
          actorId: actor.id,
          itemName: item.name,
          itemId: item.id,
          depletionDie: depDie,
          quantity: item.system?.quantity ?? 1
        });
      }
    }
  }

  if (activeSources.length === 0) return;

  let content = `<div class="trespasser-light-depletion">`;
  content += `<h3><i class="fas fa-fire"></i> ${game.i18n.localize("TRESPASSER.Chat.Dungeon.LightDepletion")}</h3>`;
  content += `<p>${game.i18n.localize("TRESPASSER.Chat.Dungeon.DepletionPrompt")}</p>`;
  content += `<table class="light-depletion-table">`;
  content += `<tr><th>Source</th><th>Owner</th><th>Die</th><th>Qty</th></tr>`;
  for (const source of activeSources) {
    content += `<tr>`;
    content += `<td>${source.itemName}</td>`;
    content += `<td>${source.actorName}</td>`;
    content += `<td><strong>${source.depletionDie}</strong></td>`;
    content += `<td>${source.quantity}</td>`;
    content += `</tr>`;
  }
  content += `</table>`;
  content += `<p><em>${game.i18n.localize("TRESPASSER.Chat.Dungeon.DepletionRollHint")}</em></p>`;
  content += `</div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ alias: dungeon.name }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });
}
