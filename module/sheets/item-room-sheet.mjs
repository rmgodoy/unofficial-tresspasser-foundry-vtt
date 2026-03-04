/**
 * Item Sheet for Room items in the Trespasser TTRPG system.
 * Follows rmgodoy's AppV1 item sheet pattern (foundry.appv1.sheets.ItemSheet).
 *
 * Connections are managed via drag-and-drop: drag a Room item from the sidebar
 * or from a dungeon sheet onto this room's connections drop zone. Both rooms
 * are updated bidirectionally.
 */
export class TrespasserRoomSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "item-sheet", "room-sheet"],
      template: "systems/trespasser/templates/item/room-sheet.hbs",
      width: 520,
      height: 580,
      scrollY: [".sheet-body"],
      tabs: [],
      dragDrop: [{ dropSelector: ".room-connections-drop" }]
    });
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    context.config = CONFIG.TRESPASSER;
    context.connectionTypes = CONFIG.TRESPASSER?.dungeon?.connectionTypes ?? {};

    // Enrich HTML fields
    context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description, {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document
    });
    context.hazardsHTML = await TextEditor.enrichHTML(this.item.system.hazards ?? "", {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document
    });
    context.lootHTML = await TextEditor.enrichHTML(this.item.system.loot ?? "", {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document
    });

    // Features list
    context.features = this.item.system.features ?? [];

    // Resolve connections — enrich with target room names
    const rawConnections = this.item.system.connections ?? [];
    context.connections = rawConnections.map(conn => {
      let name = conn.roomId;
      if (this.item.parent) {
        const target = this.item.parent.items.get(conn.roomId);
        if (target) name = target.name;
      }
      return { ...conn, name };
    });

    // Detail traps — enrich with feature name from index
    const features = this.item.system.features ?? [];
    context.detailTraps = (this.item.system.detailTraps ?? []).map(trap => ({
      ...trap,
      featureName: features[trap.featureIndex] ?? ""
    }));

    // Available rooms for the connection dropdown (rooms in the same dungeon
    // that are not this room and not already connected)
    context.availableRooms = [];
    context.hasDungeon = false;
    if (this.item.parent?.type === "dungeon") {
      context.hasDungeon = true;
      const connectedIds = new Set(rawConnections.map(c => c.roomId));
      const otherRooms = this.item.parent.items
        .filter(i => i.type === "room" && i.id !== this.item.id && !connectedIds.has(i.id));
      otherRooms.sort((a, b) => (a.system.sortOrder ?? 0) - (b.system.sortOrder ?? 0));
      context.availableRooms = otherRooms.map(r => ({ _id: r.id, name: r.name }));
    }

    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // Features
    html.find(".room-add-feature").on("click", this._onAddFeature.bind(this));
    html.find('input[name="newFeature"]').on("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._onAddFeature(ev);
      }
    });
    html.find(".room-remove-feature").on("click", this._onRemoveFeature.bind(this));

    // Connections
    html.find(".room-remove-connection").on("click", this._onRemoveConnection.bind(this));
    html.find(".room-connection-type").on("change", this._onChangeConnectionType.bind(this));
    html.find(".room-connection-desc").on("change", this._onChangeConnectionDesc.bind(this));
    html.find(".room-connection-locked").on("change", this._onToggleConnectionFlag.bind(this, "locked"));
    html.find(".room-connection-hidden").on("change", this._onToggleConnectionFlag.bind(this, "hidden"));
    html.find(".room-open-connection").on("click", this._onOpenConnectedRoom.bind(this));
    html.find(".room-add-connection-btn").on("click", this._onAddConnectionFromDropdown.bind(this));

    // Detail traps
    html.find(".room-add-detail-trap").on("click", this._onAddDetailTrap.bind(this));
    html.find(".room-remove-detail-trap").on("click", this._onRemoveDetailTrap.bind(this));
    html.find(".detail-trap-feature-index").on("change", this._onChangeDetailTrapField.bind(this, "featureIndex"));
    html.find(".detail-trap-hidden-value").on("change", this._onChangeDetailTrapField.bind(this, "hiddenValue"));
    html.find(".detail-trap-trigger").on("change", this._onChangeDetailTrapField.bind(this, "trigger"));
    html.find(".detail-trap-effect").on("change", this._onChangeDetailTrapField.bind(this, "effect"));
    html.find(".detail-trap-magical").on("change", this._onToggleDetailTrapFlag.bind(this, "magical"));
    html.find(".detail-trap-disarmed").on("change", this._onToggleDetailTrapFlag.bind(this, "disarmed"));

    // Drop zone visual feedback
    const dropZone = html.find(".room-connections-drop");
    dropZone.on("dragover", (ev) => {
      ev.preventDefault();
      dropZone.addClass("drag-over");
    });
    dropZone.on("dragleave", () => dropZone.removeClass("drag-over"));
    dropZone.on("drop", () => dropZone.removeClass("drag-over"));
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    const dataText = event.dataTransfer?.getData("text/plain");
    if (!dataText) return;

    let dropData;
    try { dropData = JSON.parse(dataText); } catch { return; }
    if (dropData.type !== "Item") return;

    const droppedItem = await fromUuid(dropData.uuid);
    if (!droppedItem || droppedItem.type !== "room") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Dungeon.Connection.DropRoomsOnly"));
      return;
    }

    // This room must belong to a dungeon actor
    const dungeon = this.item.parent;
    if (!dungeon || dungeon.type !== "dungeon") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Dungeon.Connection.NeedsDungeon"));
      return;
    }

    // Resolve the target room — if it doesn't exist on this dungeon yet, add it
    let targetRoom = dungeon.items.get(droppedItem.id);

    if (!targetRoom) {
      // The dropped room is external (sidebar, compendium, or another dungeon).
      // Create a copy on this dungeon actor.
      const itemData = droppedItem.toObject();
      delete itemData._id;
      // Clear connections from the source — they reference rooms on the original parent
      itemData.system.connections = [];

      const created = await dungeon.createEmbeddedDocuments("Item", [itemData]);
      targetRoom = created[0];
      if (!targetRoom) return;

      ui.notifications.info(game.i18n.format("TRESPASSER.Dungeon.Connection.RoomAdded", {
        room: targetRoom.name,
        dungeon: dungeon.name
      }));
    }

    await this._createBidirectionalConnection(targetRoom);
  }

  /* -------------------------------------------- */
  /*  Feature Handlers                            */
  /* -------------------------------------------- */

  async _onAddFeature(event) {
    event.preventDefault();
    const input = this.element.find('input[name="newFeature"]');
    const value = input.val()?.trim();
    if (!value) return;
    const features = [...(this.item.system.features ?? []), value];
    await this.item.update({ "system.features": features });
    input.val("");
  }

  async _onRemoveFeature(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.index);
    if (isNaN(index)) return;
    const features = [...(this.item.system.features ?? [])];
    features.splice(index, 1);
    await this.item.update({ "system.features": features });
  }

  /* -------------------------------------------- */
  /*  Connection Handlers                         */
  /* -------------------------------------------- */

  async _onRemoveConnection(event) {
    event.preventDefault();
    const roomId = event.currentTarget.dataset.roomId;
    if (!roomId) return;

    // Remove from this room
    const connections = (this.item.system.connections ?? []).filter(c => c.roomId !== roomId);
    await this.item.update({ "system.connections": connections });

    // Remove reverse connection from the other room
    if (this.item.parent) {
      const otherRoom = this.item.parent.items.get(roomId);
      if (otherRoom) {
        const otherConns = (otherRoom.system.connections ?? []).filter(c => c.roomId !== this.item.id);
        await otherRoom.update({ "system.connections": otherConns });
      }
    }
  }

  async _onChangeConnectionType(event) {
    const roomId = event.currentTarget.dataset.roomId;
    const newType = event.currentTarget.value;
    if (!roomId) return;
    const connections = (this.item.system.connections ?? []).map(c =>
      c.roomId === roomId ? { ...c, type: newType } : c
    );
    await this.item.update({ "system.connections": connections });
  }

  async _onChangeConnectionDesc(event) {
    const roomId = event.currentTarget.dataset.roomId;
    const desc = event.currentTarget.value;
    if (!roomId) return;
    const connections = (this.item.system.connections ?? []).map(c =>
      c.roomId === roomId ? { ...c, description: desc } : c
    );
    await this.item.update({ "system.connections": connections });
  }

  async _onToggleConnectionFlag(flag, event) {
    const roomId = event.currentTarget.dataset.roomId;
    if (!roomId) return;
    const connections = (this.item.system.connections ?? []).map(c =>
      c.roomId === roomId ? { ...c, [flag]: !c[flag] } : c
    );
    await this.item.update({ "system.connections": connections });

    // Sync flag to the reverse connection
    if (this.item.parent) {
      const otherRoom = this.item.parent.items.get(roomId);
      if (otherRoom) {
        const otherConns = (otherRoom.system.connections ?? []).map(c =>
          c.roomId === this.item.id ? { ...c, [flag]: connections.find(x => x.roomId === roomId)?.[flag] } : c
        );
        await otherRoom.update({ "system.connections": otherConns });
      }
    }
  }

  async _onOpenConnectedRoom(event) {
    event.preventDefault();
    const roomId = event.currentTarget.dataset.roomId;
    if (!roomId || !this.item.parent) return;
    const room = this.item.parent.items.get(roomId);
    if (room) room.sheet.render(true);
  }

  /**
   * Add a connection from the dropdown picker.
   */
  async _onAddConnectionFromDropdown(event) {
    event.preventDefault();
    const select = this.element.find(".room-add-connection-select");
    const roomId = select.val();
    if (!roomId) return;
    const dungeon = this.item.parent;
    if (!dungeon) return;
    const targetRoom = dungeon.items.get(roomId);
    if (!targetRoom) return;
    await this._createBidirectionalConnection(targetRoom);
  }

  /**
   * Create a bidirectional connection between this room and a target room.
   * Checks for duplicates and self-connections.
   * @param {Item} targetRoom - The room to connect to
   */
  async _createBidirectionalConnection(targetRoom) {
    if (targetRoom.id === this.item.id) return;

    const existingConnections = this.item.system.connections ?? [];
    if (existingConnections.some(c => c.roomId === targetRoom.id)) {
      ui.notifications.info(game.i18n.format("TRESPASSER.Dungeon.Connection.AlreadyConnected", { name: targetRoom.name }));
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
    if (!theirConnections.some(c => c.roomId === this.item.id)) {
      theirConnections.push({
        roomId: this.item.id,
        type: "doorway",
        description: "",
        locked: false,
        hidden: false
      });
    }

    await this.item.update({ "system.connections": myConnections });
    await targetRoom.update({ "system.connections": theirConnections });

    ui.notifications.info(game.i18n.format("TRESPASSER.Dungeon.Connection.Created", {
      from: this.item.name,
      to: targetRoom.name
    }));
  }

  /* -------------------------------------------- */
  /*  Detail Trap Handlers                        */
  /* -------------------------------------------- */

  async _onAddDetailTrap(event) {
    event.preventDefault();
    const traps = [...(this.item.system.detailTraps ?? [])];
    traps.push({
      featureIndex: 0,
      hiddenValue: 0,
      trigger: "",
      effect: "",
      magical: false,
      disarmed: false
    });
    await this.item.update({ "system.detailTraps": traps });
  }

  async _onRemoveDetailTrap(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    if (isNaN(index)) return;
    const traps = [...(this.item.system.detailTraps ?? [])];
    traps.splice(index, 1);
    await this.item.update({ "system.detailTraps": traps });
  }

  async _onChangeDetailTrapField(field, event) {
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    if (isNaN(index)) return;
    const traps = [...(this.item.system.detailTraps ?? [])];
    if (!traps[index]) return;
    const value = field === "featureIndex" || field === "hiddenValue"
      ? parseInt(event.currentTarget.value) || 0
      : event.currentTarget.value;
    traps[index] = { ...traps[index], [field]: value };
    await this.item.update({ "system.detailTraps": traps });
  }

  async _onToggleDetailTrapFlag(flag, event) {
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    if (isNaN(index)) return;
    const traps = [...(this.item.system.detailTraps ?? [])];
    if (!traps[index]) return;
    traps[index] = { ...traps[index], [flag]: !traps[index][flag] };
    await this.item.update({ "system.detailTraps": traps });
  }
}
