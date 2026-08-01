import { generateCommoner } from "../../helpers/commoner-generator.mjs";

/**
 * Triggered when a user manually modifies any attribute field on the Commoner sheet.
 * Permanently removes the "Generate" button by setting isGenerated to true.
 * @param {Event} event
 * @param {Actor} actor
 */
export async function handleAttributeManualEdit(event, actor) {
  if (!actor.system.isGenerated) {
    await actor.update({ "system.isGenerated": true });
  }
}

/**
 * Triggered when the user clicks the "Generate" button on an ungenerated Commoner.
 * @param {Event} event
 * @param {Actor} actor
 */
export async function handleGenerateButton(event, actor) {
  event?.preventDefault();
  await generateCommoner(actor);
}

/**
 * Handle drop of a Past Life item onto a Commoner sheet.
 * @param {Actor} actor
 * @param {Item|Object} itemData
 * @returns {Promise<boolean>}
 */
export async function handlePastLifeDrop(actor, itemData) {
  const item = itemData.document ?? itemData;
  if (item?.type !== "past_life") return false;

  const pastLifeName = item.name;
  const sysData = item.system || {};

  const updates = {
    "system.past_life": pastLifeName
  };

  // Extract stat bonuses
  const attrBonuses = sysData.attributes || sysData.attribute_bonuses || {};
  for (const [attr, val] of Object.entries(attrBonuses)) {
    if (val && actor.system.attributes?.[attr] !== undefined) {
      const current = actor.system.attributes[attr] || 0;
      updates[`system.attributes.${attr}`] = current + Number(val);
    }
  }

  // Extract skills
  if (Array.isArray(sysData.skills)) {
    for (const sk of sysData.skills) {
      updates[`system.skills.${sk}`] = true;
    }
  } else if (sysData.skills && typeof sysData.skills === "object") {
    for (const [sk, trained] of Object.entries(sysData.skills)) {
      if (trained) {
        updates[`system.skills.${sk}`] = true;
      }
    }
  }

  await actor.update(updates);

  // Transfer starting items if defined
  const itemsToCreate = [];
  if (Array.isArray(sysData.items) && sysData.items.length > 0) {
    for (const entry of sysData.items) {
      const sourceItem = entry.uuid ? await fromUuid(entry.uuid) : null;
      if (sourceItem) {
        const itemObj = sourceItem.toObject();
        delete itemObj._id;
        if (entry.quantity !== undefined) {
          itemObj.system.quantity = entry.quantity;
        }
        itemsToCreate.push(itemObj);
      }
    }
  } else if (Array.isArray(sysData.granted_items) && sysData.granted_items.length > 0) {
    itemsToCreate.push(...sysData.granted_items);
  }

  if (itemsToCreate.length > 0) {
    await actor.createEmbeddedDocuments("Item", itemsToCreate);
  }

  if (ui?.notifications) {
    const msg = game.i18n.format("TRESPASSER.COMMONER.PAST_LIFE_APPLIED", { name: pastLifeName });
    ui.notifications.info(msg);
  }

  return true;
}
