/**
 * Character Sheet — Item handlers
 * onItemCreate, onItemConsume, onDepletionRoll, runDepletionCheck
 */

import { TrespasserEffectsHelper } from "../../helpers/effects-helper.mjs";
import { TransferDialog } from "../../dialogs/transfer-dialog.mjs";
import { TrespasserSocket } from "../../helpers/socket/socket.mjs";
import { ItemTypeDialog } from "../../dialogs/item-type-dialog.mjs";


export async function onItemCreate(event, sheet) {
  event.preventDefault();
  let type = event.currentTarget.dataset.type ?? "deed";

  const inventoryTypes = ["weapon", "armor", "accessory", "rations", "item"];

  // If this is an inventory creation trigger, prompt the user for the item type
  if (type === "inventory") {
    // Check inventory capacity and display a warning if full, but do not block creation
    const inventoryItems = sheet.actor.items.filter(i => inventoryTypes.includes(i.type) && !i.system.equipped);
    const maxSlots = sheet.actor.system.inventory_max ?? 5;
    if (inventoryItems.length >= maxSlots) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Inventory.InventoryCapReached"));
    }

    // Query for the item type
    type = await ItemTypeDialog.wait();
    if (!type) return; // Cancelled
  } else {
    // For non-inventory triggers, show warning if it's an inventory type and capacity is reached
    if (inventoryTypes.includes(type)) {
      const inventoryItems = sheet.actor.items.filter(i => inventoryTypes.includes(i.type) && !i.system.equipped);
      const maxSlots = sheet.actor.system.inventory_max ?? 5;
      if (inventoryItems.length >= maxSlots) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Inventory.InventoryCapReached"));
      }
    }
  }

  const newLabel  = game.i18n.localize("TRESPASSER.Global.Action.New") || "New";
  const name      = `${newLabel} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  const system    = {};
  if (event.currentTarget.dataset.tier) system.tier = event.currentTarget.dataset.tier;

  const created = await foundry.documents.BaseItem.create({ name, type, system }, { parent: sheet.actor });
  if (created) {
    created.sheet.render(true);
  }
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
    ? game.i18n.format("TRESPASSER.Chat.Check.ResultVs", { total: item.name, target: `Depletion Roll: ${roll.total}`, status: "(DEPLETED/FAILED!)" })
    : game.i18n.format("TRESPASSER.Chat.Check.ResultVs", { total: item.name, target: `Depletion Roll: ${roll.total}`, status: "(Safe)" });

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor });

  if (isDepleted) {
    if (item.type === "rations" || (item.type === "weapon" && item.system.properties?.fragile)) {
      await item.delete();
      ui.notifications.warn(game.i18n.format("TRESPASSER.Chat.Action.DestroyedConsumed", { name: item.name }));
    } else {
      await item.update({ "system.broken": true });
    }
  }

  return isDepleted;
}

export async function onItemTransfer(event, sheet, options = {}) {
  if (event) event.preventDefault();
  
  let item = options.item;
  let targetActor = options.targetActor;

  if (!item) {
    const li = event?.currentTarget?.closest("[data-item-id]");
    const itemId = li?.dataset.itemId;
    item = sheet.actor.items.get(itemId);
  }
  if (!item) return;

  if (!targetActor) {
    const targetId = event?.currentTarget?.dataset.targetId;
    targetActor = game.actors.get(targetId);
  }

  // If still no target, show selection dialog
  if (!targetActor) {
    targetActor = await TransferDialog.wait(item);
  }

  if (!targetActor) return; // Cancelled

  const itemData = item.toObject();
  
  if (targetActor.type === "haven") {
    // Deposit into Haven inventory
    const inventory = foundry.utils.duplicate(targetActor.system.inventory);
    const qty = itemData.system.quantity || 1;

    const isMatch = (item1, item2) => {
        if (item1.name !== item2.name || item1.type !== item2.type) return false;
        const s1 = item1.system || {};
        const s2 = item2.system || {};
        if (s1.subType !== s2.subType) return false;
        if (s1.tier !== s2.tier) return false;
        return true;
    };

    const matchIndex = inventory.findIndex(entry => isMatch(entry.item, itemData));

    if (matchIndex !== -1) {
      inventory[matchIndex].quantity += qty;
    } else {
      inventory.push({ item: itemData, quantity: qty });
    }

    await targetActor.update({ "system.inventory": inventory });
    await item.delete();
    ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Haven.DepositedToHaven", { item: item.name, haven: targetActor.name }));
  } else {
    // Transfer to another actor (character or creature)
    await transferItem(item, targetActor);
  }
}

import { addItemToActor } from "../../helpers/item-transfer-helper.mjs";

/**
 * Perform an item transfer between actors, using sockets if the current user doesn't own the target.
 * @param {Item} item 
 * @param {Actor} targetActor 
 */
export async function transferItem(item, targetActor) {
  if (!item || !targetActor) return;
  const sourceActor = item.parent;
  if (!sourceActor) return;

  // If the user owns the target actor, perform the transfer directly
  if (targetActor.isOwner) {
    const itemData = item.toObject();
    const success = await addItemToActor(targetActor, itemData);
    
    if (success) {
      await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
      
      ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Transfer.Complete", {
        item: item.name,
        target: targetActor.name
      }));
    }
    return;
  }

  console.log("Trespasser | transferItem: User does NOT own target, emitting socket request.");
  // If the user does NOT own the target actor, emit a socket request
  const itemData = item.toObject();
  delete itemData._id;
  
  TrespasserSocket.emit("TRANSFER_REQUEST", {
    itemData,
    targetActorId: targetActor.id,
    sourceActorUuid: sourceActor.uuid,
    itemId: item.id
  });

  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Transfer.Pending", {
    item: item.name,
    target: targetActor.name
  }));
}
