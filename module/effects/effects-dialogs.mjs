import { showOilDialog } from "../dialogs/oil-dialog.mjs";
import { formatDiceIcons } from "../helpers/dice-icon-helper.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";

/**
 * Posts or renders a standardized chat card with buttons to apply effects manually.
 * This is the system standard for situational effects from armor, weapons, or deeds.
 * @param {Object|Object[]} effects - Single effect or array of effects from item data
 * @param {Actor} actor - The source actor
 * @param {Object} options - title, description, renderOnly (returns HTML instead of creating msg)
 * @returns {Promise<string|ChatMessage>}
 */
export async function applyEffectChat(effects, actor, { title = "", description = "", renderOnly = false, bypassFilter = false } = {}) {
  if (!effects) return null;
  const effArray = Array.isArray(effects) ? effects : [effects];
  if (effArray.length === 0) return null;

  const activeOnly = [];
  for (const eff of effArray) {
    if (!eff.uuid) continue;
    const source = await resolveItem(eff, { type: "effect", notify: false });
    if (!bypassFilter && source && (source.system?.type === "continuous" || source.system?.type === "movement" || source.system?.when === "immediate" || !source.system?.when)) continue;
    activeOnly.push(eff);
  }
  if (activeOnly.length === 0) return null;

  let cardHtml = `<div class="trespasser-chat-card">`;
  if (title) cardHtml += `<h3>${title}</h3>`;
  if (description) cardHtml += `<p><em>${formatDiceIcons(description)}</em></p>`;

  cardHtml += `<div class="applied-effects">
    <strong>${game.i18n.localize("TRESPASSER.Terms.ItemType.States")}</strong>`;

  for (const eff of activeOnly) {
    const intensity = parseInt(eff.intensity) || 0;
    const nameLabel = intensity !== 0 ? `${eff.name} ${intensity}` : eff.name;
    cardHtml += `
      <a class="apply-effect-btn" data-uuid="${eff.uuid}" data-intensity="${intensity}">
        <img src="${eff.img}" width="20" height="20" /><span>${nameLabel}</span><i class="fas fa-hand-sparkles"></i>
      </a>`;
  }
  cardHtml += `</div></div>`;

  if (renderOnly) return cardHtml;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: cardHtml
  });
}

/**
 * Dialog to apply an oil to an equipped weapon.
 * @param {Actor} actor 
 * @param {Item} oilItem 
 */
export async function applyOilDialog(actor, oilItem) {
  const equippedWeapons = actor.items.filter(i => 
    i.type === "weapon" && 
    i.system?.equipped && 
    ["melee", "missile"].includes(i.system?.type)
  );
  if (equippedWeapons.length === 0) {
    ui.notifications.warn("No equipped weapons to apply oil to.");
    return;
  }

  const weaponId = await showOilDialog(equippedWeapons, oilItem);
  if (!weaponId) return;

  const weapon = actor.items.get(weaponId);
  if (!weapon) return;

  const existingOilEffects = weapon.system?.oilEffects || [];
  const newEffects = (oilItem.system?.effects || []).map(e => ({
    ...e,
    sourceOil: oilItem.id
  }));

  await weapon.update({ "system.oilEffects": [...existingOilEffects, ...newEffects] });
  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Save.OilApplied", { oil: oilItem.name, weapon: weapon.name }));
  
  if (oilItem.system?.quantity !== undefined) {
    if (oilItem.system.quantity > 1) await oilItem.update({ "system.quantity": oilItem.system.quantity - 1 });
    else await oilItem.delete();
  }
}

/**
 * Open effect sheet with an optional callback.
 * @param {string} uuid 
 * @param {Function} callback 
 */
export async function openEffectSheet(uuid, callback) {
  const doc = await resolveItem(uuid, { type: "effect" });
  if (!doc) return;
  doc.sheet._updateObject = async (_event, formData) => {
    if (callback) await callback(doc, formData);
  };
  doc.sheet.render(true);
}
