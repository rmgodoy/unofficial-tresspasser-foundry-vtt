const { api, sheets } = foundry.applications;

/**
 * Item Sheet for Room items in the Trespasser TTRPG system.
 *
 * Connections are managed via drag-and-drop: drag a Room item from the sidebar
 * or from a dungeon sheet onto this room's connections drop zone. Both rooms
 * are updated bidirectionally.
 */
export class TrespasserRoomSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "item-sheet", "room-sheet"],
    position: { width: 520, height: 580 },
    form: {
      handler: TrespasserRoomSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/room-sheet.hbs",
      scrollable: [".scrollable", ".sheet-body"]
    }
  };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Item.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;
    
    context.item = item;
    context.system = system;
    context.config = CONFIG.TRESPASSER;
    context.connectionTypes = CONFIG.TRESPASSER?.dungeon?.connectionTypes ?? {};
    context.editable = this.isEditable;

    // Enrich HTML fields
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );
    context.hazardsHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.hazards ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );
    context.lootHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.loot ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    // Features list
    context.features = system.features ?? [];

    // Resolve connections — enrich with target room names
    const rawConnections = system.connections ?? [];
    context.connections = rawConnections.map(conn => {
      let name = conn.roomId;
      if (item.parent) {
        const target = item.parent.items.get(conn.roomId);
        if (target) name = target.name;
      }
      return { ...conn, name };
    });

    // Detail traps — enrich with feature name from index
    const features = system.features ?? [];
    context.detailTraps = (system.detailTraps ?? []).map(trap => ({
      ...trap,
      featureName: features[trap.featureIndex] ?? ""
    }));

    // Available rooms for the connection dropdown (rooms in the same dungeon
    // that are not this room and not already connected)
    context.availableRooms = [];
    context.hasDungeon = false;
    if (item.parent?.type === "dungeon") {
      context.hasDungeon = true;
      const connectedIds = new Set(rawConnections.map(c => c.roomId));
      const otherRooms = item.parent.items
        .filter(i => i.type === "room" && i.id !== item.id && !connectedIds.has(i.id));
      otherRooms.sort((a, b) => (a.system.sortOrder ?? 0) - (b.system.sortOrder ?? 0));
      context.availableRooms = otherRooms.map(r => ({ _id: r.id, name: r.name }));
    }

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this.isEditable) return;

    const html = this.element;

    // Features
    const addFeatureBtn = html.querySelector(".room-add-feature");
    if (addFeatureBtn) {
      addFeatureBtn.addEventListener("click", this._onAddFeature.bind(this));
    }
    const newFeatureInput = html.querySelector('input[name="newFeature"]');
    if (newFeatureInput) {
      newFeatureInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          this._onAddFeature(ev);
        }
      });
    }
    html.querySelectorAll(".room-remove-feature").forEach(btn => {
      btn.addEventListener("click", this._onRemoveFeature.bind(this));
    });

    // Connections
    html.querySelectorAll(".room-remove-connection").forEach(btn => {
      btn.addEventListener("click", this._onRemoveConnection.bind(this));
    });
    html.querySelectorAll(".room-connection-type").forEach(select => {
      select.addEventListener("change", this._onChangeConnectionType.bind(this));
    });
    html.querySelectorAll(".room-connection-desc").forEach(input => {
      input.addEventListener("change", this._onChangeConnectionDesc.bind(this));
    });
    html.querySelectorAll(".room-connection-locked").forEach(checkbox => {
      checkbox.addEventListener("change", this._onToggleConnectionFlag.bind(this, "locked"));
    });
    html.querySelectorAll(".room-connection-hidden").forEach(checkbox => {
      checkbox.addEventListener("change", this._onToggleConnectionFlag.bind(this, "hidden"));
    });
    html.querySelectorAll(".room-open-connection").forEach(btn => {
      btn.addEventListener("click", this._onOpenConnectedRoom.bind(this));
    });
    const addConnBtn = html.querySelector(".room-add-connection-btn");
    if (addConnBtn) {
      addConnBtn.addEventListener("click", this._onAddConnectionFromDropdown.bind(this));
    }

    // Detail traps
    const addTrapBtn = html.querySelector(".room-add-detail-trap");
    if (addTrapBtn) {
      addTrapBtn.addEventListener("click", this._onAddDetailTrap.bind(this));
    }
    html.querySelectorAll(".room-remove-detail-trap").forEach(btn => {
      btn.addEventListener("click", this._onRemoveDetailTrap.bind(this));
    });
    html.querySelectorAll(".detail-trap-feature-index").forEach(select => {
      select.addEventListener("change", this._onChangeDetailTrapField.bind(this, "featureIndex"));
    });
    html.querySelectorAll(".detail-trap-hidden-value").forEach(input => {
      input.addEventListener("change", this._onChangeDetailTrapField.bind(this, "hiddenValue"));
    });
    html.querySelectorAll(".detail-trap-trigger").forEach(input => {
      input.addEventListener("change", this._onChangeDetailTrapField.bind(this, "trigger"));
    });
    html.querySelectorAll(".detail-trap-effect").forEach(input => {
      input.addEventListener("change", this._onChangeDetailTrapField.bind(this, "effect"));
    });
    html.querySelectorAll(".detail-trap-magical").forEach(checkbox => {
      checkbox.addEventListener("change", this._onToggleDetailTrapFlag.bind(this, "magical"));
    });
    html.querySelectorAll(".detail-trap-disarmed").forEach(checkbox => {
      checkbox.addEventListener("change", this._onToggleDetailTrapFlag.bind(this, "disarmed"));
    });

    // Drop zone visual feedback
    const dropZone = html.querySelector(".room-connections-drop");
    if (dropZone) {
      dropZone.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        dropZone.classList.add("drag-over");
      });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
      dropZone.addEventListener("drop", (ev) => {
        dropZone.classList.remove("drag-over");
        this._onDrop(ev);
      });
    }

    // Intercept change events from prose-mirror in the capture phase to prevent synchronous submission crash
    this.element.addEventListener('change', ev => {
      const pm = ev.target.closest('prose-mirror');
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        const fieldName = pm.getAttribute('name');
        if (fieldName && this.element && this.document) {
          setTimeout(() => {
            if (this.element && this.document) {
              this.document.update({ [fieldName]: pm.value });
            }
          }, 0);
        }
      }
    }, true);
  }

  /**
   * Helper to retrieve all active/unsaved prose-mirror values from the DOM
   * so they are not wiped out by non-form updates (e.g. list changes, connection updates).
   */
  _getUnsavedEditorsData() {
    const html = this.element;
    const desc = html.querySelector("prose-mirror[name='system.description']")?.value;
    const hazards = html.querySelector("prose-mirror[name='system.hazards']")?.value;
    const loot = html.querySelector("prose-mirror[name='system.loot']")?.value;
    return {
      "system.description": desc ?? this.document.system.description,
      "system.hazards": hazards ?? this.document.system.hazards,
      "system.loot": loot ?? this.document.system.loot
    };
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data || data.type !== "Item") return;

    const droppedItem = await fromUuid(data.uuid);
    if (!droppedItem || droppedItem.type !== "room") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Dungeon.DropRoomsOnly"));
      return;
    }

    // This room must belong to a dungeon actor
    const dungeon = this.document.parent;
    if (!dungeon || dungeon.type !== "dungeon") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Dungeon.NeedsDungeon"));
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

      ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Dungeon.RoomAdded", { name: targetRoom.name }));
    }

    await this._createBidirectionalConnection(targetRoom);
  }

  /* -------------------------------------------- */
  /*  Feature Handlers                            */
  /* -------------------------------------------- */

  async _onAddFeature(event) {
    event.preventDefault();
    const input = this.element.querySelector('input[name="newFeature"]');
    const value = input?.value?.trim();
    if (!value) return;
    const features = [...(this.document.system.features ?? []), value];
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.features": features
    });
    if (input) input.value = "";
  }

  async _onRemoveFeature(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.index);
    if (isNaN(index)) return;
    const features = [...(this.document.system.features ?? [])];
    features.splice(index, 1);
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.features": features
    });
  }

  /* -------------------------------------------- */
  /*  Connection Handlers                         */
  /* -------------------------------------------- */

  async _onRemoveConnection(event) {
    event.preventDefault();
    const roomId = event.currentTarget.dataset.roomId;
    if (!roomId) return;

    // Remove from this room
    const connections = (this.document.system.connections ?? []).filter(c => c.roomId !== roomId);
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.connections": connections
    });

    // Remove reverse connection from the other room
    if (this.document.parent) {
      const otherRoom = this.document.parent.items.get(roomId);
      if (otherRoom) {
        const otherConns = (otherRoom.system.connections ?? []).filter(c => c.roomId !== this.document.id);
        await otherRoom.update({ "system.connections": otherConns });
      }
    }
  }

  async _onChangeConnectionType(event) {
    const roomId = event.currentTarget.dataset.roomId;
    const newType = event.currentTarget.value;
    if (!roomId) return;
    const connections = (this.document.system.connections ?? []).map(c =>
      c.roomId === roomId ? { ...c, type: newType } : c
    );
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.connections": connections
    });
  }

  async _onChangeConnectionDesc(event) {
    const roomId = event.currentTarget.dataset.roomId;
    const desc = event.currentTarget.value;
    if (!roomId) return;
    const connections = (this.document.system.connections ?? []).map(c =>
      c.roomId === roomId ? { ...c, description: desc } : c
    );
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.connections": connections
    });
  }

  async _onToggleConnectionFlag(flag, event) {
    const roomId = event.currentTarget.dataset.roomId;
    if (!roomId) return;
    const connections = (this.document.system.connections ?? []).map(c =>
      c.roomId === roomId ? { ...c, [flag]: !c[flag] } : c
    );
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.connections": connections
    });

    // Sync flag to the reverse connection
    if (this.document.parent) {
      const otherRoom = this.document.parent.items.get(roomId);
      if (otherRoom) {
        const otherConns = (otherRoom.system.connections ?? []).map(c =>
          c.roomId === this.document.id ? { ...c, [flag]: connections.find(x => x.roomId === roomId)?.[flag] } : c
        );
        await otherRoom.update({ "system.connections": otherConns });
      }
    }
  }

  async _onOpenConnectedRoom(event) {
    event.preventDefault();
    const roomId = event.currentTarget.dataset.roomId;
    if (!roomId || !this.document.parent) return;
    const room = this.document.parent.items.get(roomId);
    if (room) room.sheet.render(true);
  }

  async _onAddConnectionFromDropdown(event) {
    event.preventDefault();
    const select = this.element.querySelector(".room-add-connection-select");
    const roomId = select?.value;
    if (!roomId) return;
    const dungeon = this.document.parent;
    if (!dungeon) return;
    const targetRoom = dungeon.items.get(roomId);
    if (!targetRoom) return;
    await this._createBidirectionalConnection(targetRoom);
  }

  async _createBidirectionalConnection(targetRoom) {
    if (targetRoom.id === this.document.id) return;

    const existingConnections = this.document.system.connections ?? [];
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
    if (!theirConnections.some(c => c.roomId === this.document.id)) {
      theirConnections.push({
        roomId: this.document.id,
        type: "doorway",
        description: "",
        locked: false,
        hidden: false
      });
    }

    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.connections": myConnections
    });
    await targetRoom.update({ "system.connections": theirConnections });

    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Dungeon.ConnectionCreated", { name: targetRoom.name }));
  }

  /* -------------------------------------------- */
  /*  Detail Trap Handlers                        */
  /* -------------------------------------------- */

  async _onAddDetailTrap(event) {
    event.preventDefault();
    const traps = [...(this.document.system.detailTraps ?? [])];
    traps.push({
      featureIndex: 0,
      hiddenValue: 0,
      trigger: "",
      effect: "",
      magical: false,
      disarmed: false
    });
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.detailTraps": traps
    });
  }

  async _onRemoveDetailTrap(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    if (isNaN(index)) return;
    const traps = [...(this.document.system.detailTraps ?? [])];
    traps.splice(index, 1);
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.detailTraps": traps
    });
  }

  async _onChangeDetailTrapField(field, event) {
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    if (isNaN(index)) return;
    const traps = [...(this.document.system.detailTraps ?? [])];
    if (!traps[index]) return;
    const value = field === "featureIndex" || field === "hiddenValue"
      ? parseInt(event.currentTarget.value) || 0
      : event.currentTarget.value;
    traps[index] = { ...traps[index], [field]: value };
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.detailTraps": traps
    });
  }

  async _onToggleDetailTrapFlag(flag, event) {
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    if (isNaN(index)) return;
    const traps = [...(this.document.system.detailTraps ?? [])];
    if (!traps[index]) return;
    traps[index] = { ...traps[index], [flag]: !traps[index][flag] };
    await this.document.update({
      ...this._getUnsavedEditorsData(),
      "system.detailTraps": traps
    });
  }

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
