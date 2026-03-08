/**
 * Character Sheet — Item handlers
 * onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";

export async function onItemCreate(event, sheet) {
  event.preventDefault();
  const type = event.currentTarget.dataset.type ?? "deed";

  // Only physical inventory types count against the inventory cap
  const inventoryTypes = ["weapon", "armor", "accessory", "rations", "item"];
  if (inventoryTypes.includes(type)) {
    const inventoryItems = sheet.actor.items.filter(i => inventoryTypes.includes(i.type) && !i.system.equipped);
    const maxSlots = sheet.actor.system.inventory_max ?? 5;
    if (inventoryItems.length >= maxSlots) {
      ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.InventoryCapReached"));
      return;
    }
  }

  const newLabel  = game.i18n.localize("TRESPASSER.General.New") || "New";
  const name      = `${newLabel} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const system    = {};
  if (event.currentTarget.dataset.tier) system.tier = event.currentTarget.dataset.tier;

  await foundry.documents.BaseItem.create({ name, type, system }, { parent: sheet.actor });
}

export async function onItemConsume(event, sheet) {
  event.preventDefault();
  const li   = event.currentTarget.closest("[data-item-id]");
  const itemId = li?.dataset.itemId;
  if (!itemId) return;
  await sheet.actor.onItemConsume(itemId);
}

export async function onDepletionRoll(event, sheet) {
  event.preventDefault();
  const li   = event.currentTarget.closest("[data-item-id]");
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (!item) return;
  await sheet._runDepletionCheck(item);
}

export async function runDepletionCheck(item, sheet) {
  const depletionDie = item.system.depletionDie || "d4";
  const roll = new foundry.dice.Roll(`1${depletionDie}`);
  await roll.evaluate();

  const isDepleted = roll.total <= 2;
  const flavor = isDepleted
    ? game.i18n.format("TRESPASSER.Chat.ResultVs", { total: item.name, target: `Depletion Roll: ${roll.total}`, status: "(DEPLETED/FAILED!)" })
    : game.i18n.format("TRESPASSER.Chat.ResultVs", { total: item.name, target: `Depletion Roll: ${roll.total}`, status: "(Safe)" });

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor });

  if (isDepleted) {
    if (item.type === "rations" || (item.type === "weapon" && item.system.properties?.fragile)) {
      await item.delete();
      ui.notifications.warn(game.i18n.format("TRESPASSER.Chat.DestroyedConsumed", { name: item.name }));
    } else {
      await item.update({ "system.broken": true });
    }
  }

  return isDepleted;
}
