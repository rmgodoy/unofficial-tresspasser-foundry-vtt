import { resolveItem } from "../../helpers/item-resolver.mjs";

/**
 * room-connections.mjs
 * Connection management and drag-and-drop linking for Room items.
 */

/**
 * Creates bidirectional connection between two room documents.
 * @param {object} sheet
 * @param {Item} targetRoom
 */
export async function createBidirectionalConnection(sheet, targetRoom) {
  if (targetRoom.id === sheet.document.id) return;

  const existingConnections = sheet.document.system.connections ?? [];
  if (existingConnections.some(c => c.roomId === targetRoom.id)) {
    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Dungeon.AlreadyConnected", { name: targetRoom.name }));
    return;
  }

  const myConnections = [...existingConnections, {
    roomId: targetRoom.id,
    type: "doorway",
    description: "",
    locked: false,
    hidden: false
  }];

  const theirConnections = [...(targetRoom.system.connections ?? [])];
  if (!theirConnections.some(c => c.roomId === sheet.document.id)) {
    theirConnections.push({
      roomId: sheet.document.id,
      type: "doorway",
      description: "",
      locked: false,
      hidden: false
    });
  }

  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.connections": myConnections
  });
  await targetRoom.update({ "system.connections": theirConnections });

  ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Dungeon.ConnectionCreated", { name: targetRoom.name }));
}

/**
 * Handles dropping a Room item into the connections drop zone.
 * @param {object} sheet
 * @param {DragEvent} event
 */
export async function handleRoomDrop(sheet, event) {
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (!data || data.type !== "Item") return;

  const droppedItem = await resolveItem(data);
  if (!droppedItem) return;
  if (droppedItem.type !== "room") {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Dungeon.DropRoomsOnly"));
    return;
  }

  const dungeon = sheet.document.parent;
  if (!dungeon || dungeon.type !== "dungeon") {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Dungeon.NeedsDungeon"));
    return;
  }

  let targetRoom = dungeon.items.get(droppedItem.id);
  if (!targetRoom) {
    const itemData = droppedItem.toObject();
    delete itemData._id;
    itemData.system.connections = [];

    const created = await dungeon.createEmbeddedDocuments("Item", [itemData]);
    targetRoom = created[0];
    if (!targetRoom) return;

    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Dungeon.RoomAdded", { name: targetRoom.name }));
  }

  await createBidirectionalConnection(sheet, targetRoom);
}

/**
 * Removes a connection and its reverse link.
 * @param {object} sheet
 * @param {string} roomId
 */
export async function removeRoomConnection(sheet, roomId) {
  if (!roomId) return;

  const connections = (sheet.document.system.connections ?? []).filter(c => c.roomId !== roomId);
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.connections": connections
  });

  if (sheet.document.parent) {
    const otherRoom = sheet.document.parent.items.get(roomId);
    if (otherRoom) {
      const otherConns = (otherRoom.system.connections ?? []).filter(c => c.roomId !== sheet.document.id);
      await otherRoom.update({ "system.connections": otherConns });
    }
  }
}

/**
 * Updates connection type.
 * @param {object} sheet
 * @param {string} roomId
 * @param {string} newType
 */
export async function changeRoomConnectionType(sheet, roomId, newType) {
  if (!roomId) return;
  const connections = (sheet.document.system.connections ?? []).map(c =>
    c.roomId === roomId ? { ...c, type: newType } : c
  );
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.connections": connections
  });
}

/**
 * Updates connection description.
 * @param {object} sheet
 * @param {string} roomId
 * @param {string} desc
 */
export async function changeRoomConnectionDesc(sheet, roomId, desc) {
  if (!roomId) return;
  const connections = (sheet.document.system.connections ?? []).map(c =>
    c.roomId === roomId ? { ...c, description: desc } : c
  );
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.connections": connections
  });
}

/**
 * Toggles a connection flag and syncs with reverse link.
 * @param {object} sheet
 * @param {string} roomId
 * @param {string} flag
 */
export async function toggleRoomConnectionFlag(sheet, roomId, flag) {
  if (!roomId) return;
  const connections = (sheet.document.system.connections ?? []).map(c =>
    c.roomId === roomId ? { ...c, [flag]: !c[flag] } : c
  );
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.connections": connections
  });

  if (sheet.document.parent) {
    const otherRoom = sheet.document.parent.items.get(roomId);
    if (otherRoom) {
      const otherConns = (otherRoom.system.connections ?? []).map(c =>
        c.roomId === sheet.document.id ? { ...c, [flag]: connections.find(x => x.roomId === roomId)?.[flag] } : c
      );
      await otherRoom.update({ "system.connections": otherConns });
    }
  }
}

/**
 * Opens connected room sheet.
 * @param {object} sheet
 * @param {string} roomId
 */
export function openConnectedRoom(sheet, roomId) {
  if (!roomId || !sheet.document.parent) return;
  const room = sheet.document.parent.items.get(roomId);
  if (room) room.sheet.render(true);
}

/**
 * Adds connection from the dropdown select element.
 * @param {object} sheet
 * @param {string} roomId
 */
export async function addConnectionFromDropdown(sheet, roomId) {
  if (!roomId) return;
  const dungeon = sheet.document.parent;
  if (!dungeon) return;
  const targetRoom = dungeon.items.get(roomId);
  if (!targetRoom) return;
  await createBidirectionalConnection(sheet, targetRoom);
}
