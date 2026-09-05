import { TrespasserItemSheet } from "./base-sheet.mjs";
import {
  handleRoomDrop,
  removeRoomConnection,
  changeRoomConnectionType,
  changeRoomConnectionDesc,
  toggleRoomConnectionFlag,
  openConnectedRoom,
  addConnectionFromDropdown,
  createBidirectionalConnection
} from "./room/room-connections.mjs";
import {
  addDetailTrap,
  removeDetailTrap,
  changeDetailTrapField,
  toggleDetailTrapFlag
} from "./room/room-detail-traps.mjs";

/**
 * Item Sheet for Room items in the Trespasser TTRPG system.
 *
 * Connections are managed via drag-and-drop: drag a Room item from the sidebar
 * or from a dungeon sheet onto this room's connections drop zone. Both rooms
 * are updated bidirectionally.
 */
export class TrespasserRoomSheet extends TrespasserItemSheet {

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
    return handleRoomDrop(this, event);
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
    return removeRoomConnection(this, roomId);
  }

  async _onChangeConnectionType(event) {
    const roomId = event.currentTarget.dataset.roomId;
    const newType = event.currentTarget.value;
    return changeRoomConnectionType(this, roomId, newType);
  }

  async _onChangeConnectionDesc(event) {
    const roomId = event.currentTarget.dataset.roomId;
    const desc = event.currentTarget.value;
    return changeRoomConnectionDesc(this, roomId, desc);
  }

  async _onToggleConnectionFlag(flag, event) {
    const roomId = event.currentTarget.dataset.roomId;
    return toggleRoomConnectionFlag(this, roomId, flag);
  }

  async _onOpenConnectedRoom(event) {
    event.preventDefault();
    const roomId = event.currentTarget.dataset.roomId;
    return openConnectedRoom(this, roomId);
  }

  async _onAddConnectionFromDropdown(event) {
    event.preventDefault();
    const select = this.element.querySelector(".room-add-connection-select");
    const roomId = select?.value;
    return addConnectionFromDropdown(this, roomId);
  }

  async _createBidirectionalConnection(targetRoom) {
    return createBidirectionalConnection(this, targetRoom);
  }

  /* -------------------------------------------- */
  /*  Detail Trap Handlers                        */
  /* -------------------------------------------- */

  async _onAddDetailTrap(event) {
    event.preventDefault();
    return addDetailTrap(this);
  }

  async _onRemoveDetailTrap(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    return removeDetailTrap(this, index);
  }

  async _onChangeDetailTrapField(field, event) {
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    return changeDetailTrapField(this, index, field, event.currentTarget.value);
  }

  async _onToggleDetailTrapFlag(flag, event) {
    const index = parseInt(event.currentTarget.dataset.trapIndex);
    return toggleDetailTrapFlag(this, index, flag);
  }

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
