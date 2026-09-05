import { addItemToActor } from "../../helpers/item-transfer-helper.mjs";
import { TrespasserSocket } from "../../helpers/socket/socket.mjs";
import { onItemTransfer } from "./handlers-items.mjs";
import { TrespasserCallingDialog } from "../../dialogs/calling-dialog.mjs";
import { TrespasserCraftDialog } from "../../dialogs/craft-dialog.mjs";
import { applyPastLife } from "./handlers-advancement.mjs";
import { resolveItem } from "../../helpers/item-resolver.mjs";

/**
 * Make item rows draggable with standard Foundry drag data.
 * @param {object} sheet
 */
export function bindItemDragHandlers(sheet) {
  for (const el of sheet.element.querySelectorAll('[draggable="true"]')) {
    if (el._trespasserDragBound) continue;
    el._trespasserDragBound = true;
    el.addEventListener("dragstart", ev => {
      const id = el.dataset.itemId ?? el.closest("[data-item-id]")?.dataset.itemId;
      const item = id ? sheet.actor.items.get(id) : null;
      if (!item) return;
      ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
    });
  }
}

/**
 * Withdraw an item dragged from a Haven's inventory.
 * @param {object} sheet
 * @param {object} data  The haven-transfer drag payload.
 */
export async function onDropHavenTransfer(sheet, data) {
  const sourceHaven = game.actors.get(data.actorId);
  if (!sourceHaven) return false;

  const entry = sourceHaven.system.inventory[data.havenIndex];
  if (!entry) return false;

  const itemData = foundry.utils.duplicate(entry.item);
  const qtyToTransfer = data.transferAll ? entry.quantity : 1;

  const success = await addItemToActor(sheet.actor, itemData, qtyToTransfer);

  if (success) {
    TrespasserSocket.emit("HAVEN_WITHDRAWAL", {
      havenUuid: sourceHaven.uuid,
      index: data.havenIndex,
      targetActorUuid: sheet.actor.uuid,
      transferAll: !!data.transferAll
    });

    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Transfer.Complete", {
      item: entry.item.name,
      target: sheet.actor.name
    }));
  }

  return false;
}

/**
 * Reorder an item dropped onto another row of the same sheet.
 * @param {object} sheet
 * @param {DragEvent} event
 * @param {Item} item
 */
export async function onSortItem(sheet, event, item) {
  const targetEl = event.target?.closest?.("[data-item-id]");
  const target = targetEl ? sheet.actor.items.get(targetEl.dataset.itemId) : null;
  if (!target || target.id === item.id) return false;

  const siblings = sheet.actor.items.filter(i => i.id !== item.id);
  const updates = foundry.utils.performIntegerSort(item, { target, siblings });
  return sheet.actor.updateEmbeddedDocuments("Item", updates.map(u => ({ _id: u.target.id, sort: u.update.sort })));
}

/**
 * Handle dropping items onto the sheet.
 * @param {object} sheet
 * @param {DragEvent} event
 * @param {object} dropped
 * @param {Function} superDropItemFn
 */
export async function handleDropItem(sheet, event, dropped, superDropItemFn) {
  if (event._trespasserItemDropHandled) return false;
  event._trespasserItemDropHandled = true;

  const sourceItem = dropped instanceof Item
    ? dropped
    : ((await Item.implementation.fromDropData(dropped ?? {})) || (await resolveItem(dropped)));

  const isTransfer = !!sourceItem?.parent && (sourceItem.parent !== sheet.actor);
  if (!sheet.actor.isOwner && !isTransfer) return false;

  if (isTransfer) {
    await onItemTransfer(null, sheet, { item: sourceItem, targetActor: sheet.actor });
    return false;
  }

  if (sourceItem && sourceItem.parent === sheet.actor) return onSortItem(sheet, event, sourceItem);

  if (!sourceItem) return superDropItemFn(event, dropped);
  if (sourceItem.type === "calling")   return TrespasserCallingDialog.wait(sourceItem, sheet.actor);
  if (sourceItem.type === "craft")     return TrespasserCraftDialog.wait(sourceItem, sheet.actor);
  if (sourceItem.type === "past_life") return applyPastLife(sheet, sourceItem);
  return superDropItemFn(event, dropped);
}
