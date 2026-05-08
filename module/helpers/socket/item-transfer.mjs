import { addItemToActor } from "../item-transfer-helper.mjs";

/**
 * Socket handlers for item transfer operations.
 */
export async function handleTransferRequest(data, senderId) {
  const { itemData, targetActorId, sourceActorUuid, itemId } = data;
  const targetActor = game.actors.get(targetActorId);
  if (!targetActor) return;

  // Determine the responsible user to handle this request (prefer player owners over GMs)
  const owners = game.users.filter(u => u.active && targetActor.testUserPermission(u, "OWNER"));
  const playerOwners = owners.filter(u => !u.isGM);
  
  let isResponsible = false;
  if (playerOwners.length > 0) {
    playerOwners.sort((a, b) => a.id.localeCompare(b.id));
    isResponsible = game.user.id === playerOwners[0].id;
  } else if (owners.length > 0) {
    owners.sort((a, b) => a.id.localeCompare(b.id));
    isResponsible = game.user.id === owners[0].id;
  }

  if (!isResponsible) return;

  const confirm = game.settings.get("trespasser", "confirmItemTransfer");
  let accepted = !confirm;

  if (confirm) {
    const sender = game.users.get(senderId);
    accepted = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.Dialog.TransferTitle") },
      content: "<p>" + game.i18n.format("TRESPASSER.Dialog.TransferContent", {
        user: sender.name,
        item: itemData.name,
        target: targetActor.name
      }) + "</p>",
      rejectClose: false
    });
  }

  if (accepted) {
    const success = await addItemToActor(targetActor, itemData);

    if (success) {
      ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.TransferAccepted", {
        item: itemData.name,
        actor: targetActor.name
      }));

      // Notify sender that it was accepted
      const { TrespasserSocket } = await import("./socket.mjs");
      TrespasserSocket.emit("TRANSFER_ACCEPTED", { 
        sourceActorUuid, 
        itemId, 
        targetActorName: targetActor.name, 
        itemName: itemData.name 
      });
    }
  } else {
    // Notify sender that it was rejected
    const { TrespasserSocket } = await import("./socket.mjs");
    TrespasserSocket.emit("TRANSFER_REJECTED", { 
      itemName: itemData.name, 
      targetActorName: targetActor.name 
    });
  }
}

/**
 * Handle a transfer acceptance (delete the source item).
 * @param {object} data
 */
export async function handleTransferAccepted(data) {
  const { sourceActorUuid, itemId, targetActorName, itemName } = data;
  const sourceActor = await fromUuid(sourceActorUuid);
  if (!sourceActor || !sourceActor.isOwner) return;

  // Prevent multiple owners (e.g. GM and Player) from all trying to delete the same item.
  // We pick the first active owner to be responsible.
  const activeOwners = game.users.filter(u => u.active && sourceActor.testUserPermission(u, "OWNER"));
  activeOwners.sort((a, b) => a.id.localeCompare(b.id));
  if (game.user.id !== activeOwners[0].id) return;

  const item = sourceActor.items.get(itemId);
  if (item) {
    await sourceActor.deleteEmbeddedDocuments("Item", [itemId]);
    
    ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.TransferComplete", {
      item: itemName,
      target: targetActorName
    }));
  }
}

/**
 * Handle a transfer rejection.
 * @param {object} data
 */
export function handleTransferRejected(data) {
  const { itemName, targetActorName } = data;
  ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.TransferRejected", {
    item: itemName,
    target: targetActorName
  }));
}

/**
 * Handle a request to withdraw items from a Haven's inventory.
 */
export async function handleHavenWithdrawalRequest(data, senderId) {
  const { havenUuid, index, transferAll } = data;
  console.log(`Trespasser | handleHavenWithdrawalRequest: Received request for Haven ${havenUuid}, index ${index}, transferAll: ${transferAll}`);
  
  const haven = await fromUuid(havenUuid);
  if (!haven) {
    console.error(`Trespasser | handleHavenWithdrawalRequest: Haven ${havenUuid} not found.`);
    return;
  }

  // Determine who is responsible for the Haven update. Prioritize the first active GM.
  const activeGMs = game.users.filter(u => u.active && u.isGM);
  const activeOwners = game.users.filter(u => u.active && haven.testUserPermission(u, "OWNER"));
  const responsibleUser = activeGMs[0] || activeOwners[0];
  
  if (!responsibleUser || game.user.id !== responsibleUser.id) {
    console.log(`Trespasser | handleHavenWithdrawalRequest: Not responsible user. Responsible: ${responsibleUser?.name || "None"}`);
    return;
  }

  console.log(`Trespasser | handleHavenWithdrawalRequest: Performing update on ${haven.name} as user ${game.user.name}`);

  // Use toObject() to ensure we have a clean array to work with
  const inventory = foundry.utils.duplicate(haven.system.inventory || []);
  const idx = Number(index);
  const entry = inventory[idx];
  
  if (!entry) {
    console.warn(`Trespasser | Haven withdrawal failed: index ${idx} not found in inventory of ${haven.name}`);
    return;
  }

  const qtyInStack = Number(entry.quantity || 1);
  const qtyToWithdraw = transferAll ? qtyInStack : 1;
  console.log(`Trespasser | handleHavenWithdrawalRequest: Withdrawing ${qtyToWithdraw} from stack of ${qtyInStack} (${entry.item.name})`);

  // Update Haven inventory
  if (transferAll || qtyInStack <= qtyToWithdraw) {
    console.log(`Trespasser | handleHavenWithdrawalRequest: Removing entire entry at index ${idx}`);
    inventory.splice(idx, 1);
  } else {
    console.log(`Trespasser | handleHavenWithdrawalRequest: Decreasing quantity from ${qtyInStack} to ${qtyInStack - qtyToWithdraw}`);
    inventory[idx].quantity = qtyInStack - qtyToWithdraw;
  }

  // Perform the update. Use diff: false to ensure the array is completely replaced.
  const updated = await haven.update({ "system.inventory": inventory }, { diff: false });
  console.log(`Trespasser | handleHavenWithdrawalRequest: Haven update result:`, updated ? "Success" : "Failure");
}
