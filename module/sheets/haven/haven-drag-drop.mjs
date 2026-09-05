import { resolveItem } from "../../helpers/item-resolver.mjs";

/**
 * Drag and Drop handlers for Haven sheets.
 */

/**
 * Setup drop zones on the Haven sheet element.
 * @param {TrespasserHavenSheet} sheet
 * @param {HTMLElement} html
 */
export function setupHavenDropZones(sheet, html) {
  const dropZones = html.querySelectorAll(".drop-zone");
  dropZones.forEach(zone => {
    const isInvZone = zone.classList.contains("inventory-list");
    if (!sheet.isEditable && !isInvZone) return;

    zone.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (ev) => {
      zone.classList.remove("drag-over");
      handleHavenDrop(sheet, ev);
    });
  });

  if (!sheet.element._trespasserRootDropBound) {
    sheet.element._trespasserRootDropBound = true;
    sheet.element.addEventListener("dragover", (ev) => ev.preventDefault());
    sheet.element.addEventListener("drop", (ev) => handleHavenDrop(sheet, ev));
  }

  html.querySelectorAll(".inventory-item.item").forEach(li => {
    li.addEventListener("dragstart", (ev) => handleHavenDragStart(sheet, ev));
  });

  if (!sheet.isEditable) return;

  html.querySelectorAll(".available-hirelings-select").forEach(s => {
    s.addEventListener("change", ev => ev.stopPropagation());
  });
}

/**
 * Handle drop event on the Haven sheet.
 * @param {TrespasserHavenSheet} sheet
 * @param {DragEvent} event
 */
export async function handleHavenDrop(sheet, event) {
  event.preventDefault();
  event.stopPropagation();
  const zone = event.currentTarget;
  const action = zone?.dataset?.action;
  
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  
  if (action === "dropLeader") {
    if (data.type !== "Actor") return;
    const leader = await fromUuid(data.uuid);
    if (leader?.type !== "character") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Haven.CharactersOnly"));
      return;
    }
    await sheet.document.update({ "system.leaderId": leader.id });
  } else {
    if (data.type !== "Item") return;
    const item = await resolveItem(data);
    if (!item) return;

    if (["hireling", "room", "build", "stronghold"].includes(item.type)) {
      if (item.parent === sheet.document) return;

      if (item.type === "build" && game.settings.get("trespasser", "enforceHavenBuildingLimits")) {
        const system = sheet.document.system;
        const allBuildings = sheet.document.items.filter(i => i.type === "build");
        const numConstruction = allBuildings.filter(b => b.system.progress < b.system.buildClock).length;
        const numCompleted = allBuildings.filter(b => b.system.progress >= b.system.buildClock).length;

        if (numConstruction >= system.maxBuildSlots) {
          ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Haven.NoBuildSlots", { max: system.maxBuildSlots }));
          return;
        }
        if (numCompleted >= system.maxBuildingLimit) {
          ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Haven.BuildingLimitReached", { max: system.maxBuildingLimit }));
          return;
        }
      }

      const created = await Item.create(item.toObject(), { parent: sheet.document });
      if (created && item.parent && item.parent !== sheet.document) {
        await item.delete();
      }
      return created;
    }

    const inventory = foundry.utils.duplicate(sheet.document.system.inventory);
    const itemData = item.toObject();
    const qty = itemData.system.quantity || 1;

    const matchIndex = inventory.findIndex(entry => 
      sheet.document.system._isItemMatch(entry.item, itemData)
    );

    if (matchIndex !== -1) {
      inventory[matchIndex].quantity += qty;
    } else {
      inventory.push({ item: itemData, quantity: qty });
    }

    const updated = await sheet.document.update({ "system.inventory": inventory });
    
    if (updated && item.parent && item.parent !== sheet.document) {
      await item.delete();
    }
  }
}

/**
 * Handle dragging an item out of the Haven inventory.
 * @param {TrespasserHavenSheet} sheet
 * @param {DragEvent} event
 */
export function handleHavenDragStart(sheet, event) {
  const li = event.currentTarget;
  if (li.dataset.index === undefined) return;
  
  const index = parseInt(li.dataset.index);
  const entry = sheet.document.system.inventory[index];
  if (!entry) return;

  const dragData = {
    type: "Item",
    data: entry.item,
    havenIndex: index,
    actorId: sheet.document.id,
    isHavenTransfer: true
  };
  
  if (event.altKey) {
    dragData.transferAll = true;
  }

  event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
}
