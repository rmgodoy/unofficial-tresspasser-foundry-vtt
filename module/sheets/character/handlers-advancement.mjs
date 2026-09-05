import { TrespasserCallingDialog } from "../../dialogs/calling-dialog.mjs";
import { TrespasserCraftDialog } from "../../dialogs/craft-dialog.mjs";
import { PlightPickerDialog } from "../../dialogs/plight-picker-dialog.mjs";
import { COMMON_PLIGHTS } from "../../config/plight-config.mjs";
import { resolveItem } from "../../helpers/item-resolver.mjs";

/**
 * Handle clicking Edit on Calling.
 * @param {object} sheet
 * @param {Event} event
 */
export async function onCallingEdit(sheet, event) {
  event.preventDefault();
  const callingItem = sheet.actor.items.find(i => i.type === "calling");
  if (!callingItem) return ui.notifications.warn("No calling item found on this actor.");
  return TrespasserCallingDialog.wait(callingItem, sheet.actor);
}

/**
 * Handle clicking Delete on Calling.
 * @param {object} sheet
 * @param {Event} event
 */
export async function onCallingDelete(sheet, event) {
  event.preventDefault();
  const callingItem = sheet.actor.items.find(i => i.type === "calling");
  if (!callingItem) return;

  const callingName = callingItem.name;

  const confirm = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format("TRESPASSER.Dialog.Delete.CallingTitle", { name: callingName }) },
    content: `<p>${game.i18n.format("TRESPASSER.Dialog.Delete.CallingConfirm", { name: callingName })}</p>`,
    classes: ["trespasser", "dialog"],
    rejectClose: false
  });

  if (!confirm) return;

  const toDelete = sheet.actor.items
    .filter(it => it.flags.trespasser?.linkedSource === callingName || it.id === callingItem.id)
    .map(it => it.id);

  const skillUpdates = {};
  if (callingItem.system.skills) {
    for (const skillKey of callingItem.system.skills) {
      skillUpdates[`system.skills.${skillKey}`] = false;
    }
  }

  await sheet.actor.deleteEmbeddedDocuments("Item", toDelete);
  await sheet.actor.update({
    ...skillUpdates,
    "system.calling": ""
  });

  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Apply.CallingRemoved", { name: callingName, actor: sheet.actor.name }));
}

/**
 * Handle clicking Edit on a Craft slot.
 * @param {object} sheet
 * @param {Event} event
 */
export async function onCraftEdit(sheet, event) {
  event.preventDefault();
  const slotIdx = event.currentTarget.dataset.slot;
  const craftName = (event.currentTarget.dataset.craft || sheet.actor.system.crafts?.[slotIdx])?.trim();
  if (!craftName) return;

  const lower = craftName.toLowerCase();
  let craftItem = sheet.actor.items.find(i => i.type === "craft" && i.name.trim().toLowerCase() === lower)
    || game.items.find(i => i.type === "craft" && i.name.trim().toLowerCase() === lower);

  if (!craftItem) {
    const pack = game.packs.get("trespasser.trespasser-content");
    const entry = pack?.index.find(e => e.type === "craft" && e.name.trim().toLowerCase() === lower);
    if (entry) craftItem = await pack.getDocument(entry._id);
  }

  if (!craftItem) return ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Apply.CraftNotFound", { name: craftName }));
  return TrespasserCraftDialog.wait(craftItem, sheet.actor);
}

/**
 * Handle clicking Delete on a Craft slot.
 * @param {object} sheet
 * @param {Event} event
 */
export async function onCraftDelete(sheet, event) {
  event.preventDefault();
  const slotIdx = parseInt(event.currentTarget.dataset.slot);
  const craftName = event.currentTarget.dataset.craft || sheet.actor.system.crafts?.[slotIdx];
  if (!craftName) return;

  const confirm = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format("TRESPASSER.Dialog.Delete.CraftTitle", { name: craftName }) },
    content: `<p>${game.i18n.format("TRESPASSER.Dialog.Delete.CraftConfirm", { name: craftName })}</p>`,
    classes: ["trespasser", "dialog"],
    rejectClose: false
  });
  if (!confirm) return;

  const toDelete = sheet.actor.items
    .filter(it => it.flags.trespasser?.linkedSource === craftName || (it.type === "craft" && it.name === craftName))
    .map(it => it.id);
  if (toDelete.length > 0) await sheet.actor.deleteEmbeddedDocuments("Item", toDelete);

  const current = [...(sheet.actor.system.crafts ?? ["", "", ""])];
  if (slotIdx >= 0 && slotIdx < current.length) current[slotIdx] = "";
  else {
    const idx = current.findIndex(c => c === craftName);
    if (idx !== -1) current[idx] = "";
  }
  await sheet.actor.update({ "system.crafts": current });
  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Apply.CraftRemoved", { name: craftName, actor: sheet.actor.name }));
}

/**
 * Apply a Past Life template to the character.
 * @param {object} sheet
 * @param {Item} pastLifeItem 
 */
export async function applyPastLife(sheet, pastLifeItem) {
  const actor = sheet.actor;
  const system = pastLifeItem.system;
  
  const updates = {
    "system.past_life": pastLifeItem.name,
  };

  for (const [key, bonus] of Object.entries(system.attributes)) {
    const currentVal = actor.system.attributes[key] || 0;
    updates[`system.attributes.${key}`] = currentVal + (bonus || 0);
  }

  for (const [key, trained] of Object.entries(system.skills)) {
    if (trained) {
      updates[`system.skills.${key}`] = true;
    }
  }

  await actor.update(updates);

  const itemsToCreate = [];
  for (const entry of system.items) {
    const sourceItem = await resolveItem(entry);
    if (sourceItem) {
      const itemData = sourceItem.toObject();
      delete itemData._id;
      if (entry.quantity !== undefined) {
        itemData.system.quantity = entry.quantity;
      }
      itemsToCreate.push(itemData);
    }
  }

  if (itemsToCreate.length > 0) {
    await actor.createEmbeddedDocuments("Item", itemsToCreate);
  }

  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Apply.PastLife", {
    name: pastLifeItem.name,
    actor: actor.name
  }));
}

/**
 * Handle adding a Plight.
 * @param {object} sheet
 * @param {Event} event
 */
export async function onPlightAdd(sheet, event) {
  event.preventDefault();
  const plightId = await PlightPickerDialog.wait(sheet.actor);
  if (!plightId) return;

  if (plightId === "custom") {
    const created = await Item.implementation.create({
      name: game.i18n.localize("TRESPASSER.Plight.Custom.Name"),
      type: "plight",
      img: "systems/trespasser/assets/icons/effect.webp",
      system: {
        plightId: "",
        description: ""
      }
    }, { parent: sheet.actor });
    if (created) {
      created.sheet.render(true);
    }
  } else {
    const config = COMMON_PLIGHTS[plightId];
    if (config) {
      const alreadyHas = sheet.actor.items.some(i => i.type === "plight" && i.system.plightId === plightId);
      if (alreadyHas) {
        ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: game.i18n.localize(config.label) }));
        return;
      }

      await Item.implementation.create({
        name: game.i18n.localize(config.label),
        type: "plight",
        img: "systems/trespasser/assets/icons/effect.webp",
        system: {
          plightId: plightId,
          description: game.i18n.localize(config.description)
        }
      }, { parent: sheet.actor });
    }
  }
}

/**
 * Handle adding a Lasting State.
 * @param {object} sheet
 * @param {Event} event
 */
export async function onLastingStateAdd(sheet, event) {
  event.preventDefault();
  const type = "effect";
  const name = "New Lasting State";
  const system = {
    isLasting: true,
    isCombat: true
  };
  const created = await Item.implementation.create({ name, type, system }, { parent: sheet.actor });
  if (created) {
    created.sheet.render(true);
  }
}
