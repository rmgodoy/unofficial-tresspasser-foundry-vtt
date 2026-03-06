import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Sheet for the Injury item type.
 * Minimalist — no tabs, consistent with the Weapon sheet style.
 */
export class TrespasserInjurySheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "injury-sheet"],
      width: 480,
      height: 420,
      scrollY: [".sheet-body"],
      tabs: [] // No tabs — minimalist like the weapon sheet
    });
  }

  /** @override */
  get template() {
    return `systems/trespasser/templates/item/injury-sheet.hbs`;
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;

    // Clamp currentClock so it never exceeds injuryClock
    if (context.system.currentClock > context.system.injuryClock) {
      context.system.currentClock = context.system.injuryClock;
    }

    // Build clock segments for the SVG clock rendering
    const total   = Math.max(2, context.system.injuryClock);
    const filled  = Math.min(context.system.currentClock, total);
    context.clockSegments = this._buildClockSegments(total, filled);
    context.clockTotal    = total;
    context.clockFilled   = filled;

    // Enrich HTML description
    context.descriptionHTML = await TextEditor.enrichHTML(this.item.system.description, {
      async: true,
      secrets: this.document.isOwner,
      relativeTo: this.document
    });

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
      const gap = 0.06; // radians
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
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    // Clock segment click: advance by 1
    html.find(".clock-segment").on("click", this._onClockSegmentClick.bind(this));

    // Effects list
    html.find(".effect-remove").on("click", this._onRemoveEffect.bind(this));

    // Drag-and-drop for effects
    const dropZone = html.find(".drop-zone");
    dropZone.on("dragover", (ev) => { ev.preventDefault(); return false; });
    dropZone.on("drop", this._onDropEffect.bind(this));

    // Intensity changes
    html.find(".effect-intensity-input").change(this._onIntensityChange.bind(this));

    // Edit button
    html.find(".effect-edit").on("click", this._onEffectEdit.bind(this));
  }

  /** Clicking a clock segment sets currentClock to that segment index + 1 (toggle off if already filled). */
  async _onClockSegmentClick(event) {
    event.preventDefault();
    const idx   = parseInt(event.currentTarget.dataset.index);
    const total = this.item.system.injuryClock;
    const cur   = this.item.system.currentClock;

    // Toggle: clicking the last filled segment unfills it
    const newVal = (cur === idx + 1) ? idx : idx + 1;
    await this.item.update({ "system.currentClock": Math.min(newVal, total) });
  }

  async _onRemoveEffect(event) {
    event.preventDefault();
    const el    = event.currentTarget.closest(".effect-chip");
    const index = Number(el.dataset.index);
    const arr   = [...this.item.system.effects];
    arr.splice(index, 1);
    await this.item.update({ "system.effects": arr });
  }

  async _onDropEffect(event) {
    event.preventDefault();
    const dataText = event.originalEvent?.dataTransfer?.getData("text/plain");
    if (!dataText) return;
    let dropData;
    try { dropData = JSON.parse(dataText); } catch(e) { return; }
    if (dropData.type !== "Item") return;

    const sourceItem = await fromUuid(dropData.uuid);
    if (!sourceItem) return;
    if (sourceItem.type !== "effect" && sourceItem.type !== "state") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.DropEffectsStatesOnly"));
      return;
    }

    const arr = [...(this.item.system.effects || [])];
    if (arr.some(e => e.name === sourceItem.name || e.uuid === sourceItem.uuid)) {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.AlreadyAdded", { name: sourceItem.name }));
      return;
    }

    arr.push({
      uuid:      sourceItem.uuid,
      type:      sourceItem.type,
      name:      sourceItem.name,
      img:       sourceItem.img,
      intensity: sourceItem.system.intensity || 0
    });
    await this.item.update({ "system.effects": arr });
  }

  async _onIntensityChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const el    = input.closest(".effect-chip");
    if (!el) return;
    const index = Number(el.dataset.index);
    const value = parseInt(input.value) || 0;
    const arr   = [...(this.item.system.effects || [])];
    if (arr[index]) {
      arr[index].intensity = value;
      await this.item.update({ "system.effects": arr });
    }
  }

  async _onEffectEdit(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    if (!el) return;

    const index = Number(el.dataset.index);
    const targetType = "effects";
    const currentArray = [...(this.item.system[targetType] || [])];
    const effectData = foundry.utils.deepClone(currentArray[index]);

    if(effectData.uuid) {
      await TrespasserEffectsHelper.openEffectSheet(effectData.uuid);
      return;
    }
  }
}
