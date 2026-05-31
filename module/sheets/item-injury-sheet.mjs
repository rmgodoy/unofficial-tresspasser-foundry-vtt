const { api, sheets } = foundry.applications;
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Sheet for the Injury item type.
 * Minimalist — no tabs, consistent with the Weapon sheet style.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserInjurySheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "injury-sheet"],
    position: { width: 480, height: 420 },
    form: {
      handler: TrespasserInjurySheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/injury-sheet.hbs",
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
    const system = foundry.utils.deepClone(item.system);

    // Clamp currentClock so it never exceeds injuryClock
    if (system.currentClock > system.injuryClock) {
      system.currentClock = system.injuryClock;
    }

    context.item = item;
    context.system = system;
    context.editable = this.isEditable;

    // Build clock segments for the SVG clock rendering
    const total   = Math.max(2, system.injuryClock);
    const filled  = Math.min(system.currentClock, total);
    context.clockSegments = this._buildClockSegments(total, filled);
    context.clockTotal    = total;
    context.clockFilled   = filled;

    // Enrich HTML description
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      {
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );

    return context;
  }

  /**
   * Build an array of segment descriptors for the SVG clock.
   * Each segment: { path, filled }
   */
  _buildClockSegments(total, filled) {
    const cx = 50, cy = 50, r = 44;
    const segments = [];
    const angleStep = (2 * Math.PI) / total;
    // Start from the top (−π/2)
    const startOffset = -Math.PI / 2;

    for (let i = 0; i < total; i++) {
      const a1 = startOffset + i * angleStep;
      const a2 = startOffset + (i + 1) * angleStep;

      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy + r * Math.sin(a2);

      // Inner point (a tiny gap makes each segment look discrete)
      const gap = 0; // radians
      const x3 = cx + r * Math.cos(a2 - gap);
      const y3 = cy + r * Math.sin(a2 - gap);
      const x4 = cx + r * Math.cos(a1 + gap);
      const y4 = cy + r * Math.sin(a1 + gap);

      const largeArc = (a2 - a1) > Math.PI ? 1 : 0;

      const path = `M ${cx} ${cy} L ${x4.toFixed(2)} ${y4.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;

      segments.push({ path, filled: i < filled });
    }
    return segments;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Intercept change events from prose-mirror and handle them asynchronously to prevent synchronous re-rendering crash
    this.element.addEventListener('change', ev => {
      const pm = ev.target.closest('prose-mirror');
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        setTimeout(() => {
          if (this.element && this.document) {
            const desc = pm.value;
            this.document.update({ "system.description": desc });
          }
        }, 0);
      }
    }, true);

    // Intercept submit events from prose-mirror and handle them asynchronously
    this.element.addEventListener('submit', ev => {
      const pm = ev.submitter?.closest('prose-mirror');
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        setTimeout(() => {
          if (this.element && this.document) {
            const desc = pm.value;
            this.document.update({ "system.description": desc });
          }
        }, 0);
      }
    }, true);

    if (!this.isEditable) return;

    // Clock segment click: advance by 1
    this.element.querySelectorAll(".clock-segment").forEach(el => {
      el.addEventListener("click", this._onClockSegmentClick.bind(this));
    });

    // Remove effect button
    this.element.querySelectorAll(".effect-remove").forEach(el => {
      el.addEventListener("click", this._onRemoveEffect.bind(this));
    });

    // Drag-and-drop for effects
    const dropZone = this.element.querySelector(".drop-zone");
    if (dropZone) {
      dropZone.addEventListener("dragover", (ev) => { ev.preventDefault(); return false; });
      dropZone.addEventListener("drop", this._onDropEffect.bind(this));
    }

    // Intensity changes
    this.element.querySelectorAll(".effect-intensity-input").forEach(el => {
      el.addEventListener("change", this._onIntensityChange.bind(this));
    });

    // Edit button
    this.element.querySelectorAll(".effect-edit").forEach(el => {
      el.addEventListener("click", this._onEffectEdit.bind(this));
    });
  }

  /** Clicking a clock segment sets currentClock to that segment index + 1 (toggle off if already filled). */
  async _onClockSegmentClick(event) {
    event.preventDefault();
    const idx   = parseInt(event.currentTarget.dataset.index);
    const total = this.document.system.injuryClock;
    const cur   = this.document.system.currentClock;

    // Toggle: clicking the last filled segment unfills it
    const newVal = (cur === idx + 1) ? idx : idx + 1;

    // Preserve unsaved description edits
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    const updateData = { "system.currentClock": Math.min(newVal, total) };
    if (desc !== undefined) updateData["system.description"] = desc;

    await this.document.update(updateData);
  }

  async _onRemoveEffect(event) {
    event.preventDefault();
    const el    = event.currentTarget.closest(".effect-chip");
    const index = Number(el.dataset.index);
    const arr   = [...this.document.system.effects];
    arr.splice(index, 1);

    // Preserve unsaved description edits
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    const updateData = { "system.effects": arr };
    if (desc !== undefined) updateData["system.description"] = desc;

    await this.document.update(updateData);
  }

  async _onDropEffect(event) {
    event.preventDefault();
    const dataText = (event.dataTransfer || event.originalEvent?.dataTransfer)?.getData("text/plain");
    if (!dataText) return;
    let dropData;
    try { dropData = JSON.parse(dataText); } catch(e) { return; }
    if (dropData.type !== "Item") return;

    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;
    if (sourceItem.type !== "effect" && sourceItem.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsStatesOnly"));
      return;
    }

    const arr = [...(this.document.system.effects || [])];
    if (arr.some(e => e.name === sourceItem.name || e.uuid === sourceItem.uuid)) {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name }));
      return;
    }

    arr.push({
      uuid:      sourceItem.uuid,
      type:      sourceItem.type,
      name:      sourceItem.name,
      img:       sourceItem.img,
      intensity: sourceItem.system.intensity || 0
    });

    // Preserve unsaved description edits
    const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
    const updateData = { "system.effects": arr };
    if (desc !== undefined) updateData["system.description"] = desc;

    await this.document.update(updateData);
  }

  async _onIntensityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const el    = input.closest(".effect-chip");
    if (!el) return;
    const index = Number(el.dataset.index);
    const value = parseInt(input.value) || 0;
    const arr   = [...(this.document.system.effects || [])];
    if (arr[index]) {
      arr[index].intensity = value;

      // Preserve unsaved description edits
      const desc = this.element.querySelector("prose-mirror[name='system.description']")?.value;
      const updateData = { "system.effects": arr };
      if (desc !== undefined) updateData["system.description"] = desc;

      await this.document.update(updateData);
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const targetType = "effects";
    const currentArray = [...(this.document.system[targetType] || [])];
    const effectData = foundry.utils.deepClone(currentArray[index]);

    if (effectData.uuid) {
      await TrespasserEffectsHelper.openEffectSheet(effectData.uuid);
      return;
    }
  }

  static async #onSubmit(event, form, formData) {
    await this.document.update(formData.object);
  }
}
