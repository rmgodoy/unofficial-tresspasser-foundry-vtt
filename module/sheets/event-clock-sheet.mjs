/**
 * Event Clock Edit Sheet
 *
 * Sheet for editing a single Event Clock stored in settings.
 */

const { api } = foundry.applications;

export class EventClockSheet extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  constructor(options = {}) {
    super(options);
    this.clockId = options.clockId;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["trespasser", "sheet", "item", "event-clock-sheet"],
    position: { width: 480, height: 700 },
    window: {
      resizable: true,
      minimizable: true,
      title: "EventClocks.EditTitle"
    },
    actions: {
        clickSegment: "onClockSegmentClick"
    },
    form: {
      handler: EventClockSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/event-clock-sheet.hbs"
    }
  };

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const settingJson = game.settings.get("trespasser", "eventClocks") || "[]";
    const clocks = JSON.parse(settingJson);
    const clock = clocks.find(c => c.id === this.clockId);
    
    if (!clock) {
        ui.notifications.error("Event Clock not found.");
        this.close();
        return context;
    }

    context.clock = clock;
    context.isGM = game.user.isGM;
    
    const total = Math.max(2, clock.target || 4);
    const filled = Math.min(clock.current || 0, total);
    context.clockSegments = this._buildClockSegments(total, filled);
    context.clockTotal = total;
    context.clockFilled = filled;

    // Enrich description HTML
    context.descriptionHTML = await TextEditor.enrichHTML(clock.description || "", {
        async: true,
        secrets: true
    });

    return context;
  }

  /**
   * Helper to build SVG segments
   */
  _buildClockSegments(total, filled) {
    const cx = 50, cy = 50, r = 44;
    const segments = [];
    const angleStep = (2 * Math.PI) / total;
    const startOffset = -Math.PI / 2;

    for (let i = 0; i < total; i++) {
        const a1 = startOffset + i * angleStep;
        const a2 = startOffset + (i + 1) * angleStep;

        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);

        const x3 = cx + r * Math.cos(a2);
        const y3 = cy + r * Math.sin(a2);
        const x4 = cx + r * Math.cos(a1);
        const y4 = cy + r * Math.sin(a1);

        const largeArc = (a2 - a1) > Math.PI ? 1 : 0;
        const path = `M ${cx} ${cy} L ${x4.toFixed(2)} ${y4.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;

        segments.push({ path, filled: i < filled });
    }
    return segments;
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  async onClockSegmentClick(event, target) {
    if (!game.user.isGM) return;
    const idx = parseInt(target.dataset.index);
    const settingJson = game.settings.get("trespasser", "eventClocks") || "[]";
    const clocks = JSON.parse(settingJson);
    const clock = clocks.find(c => c.id === this.clockId);
    
    if (clock) {
        const newVal = (clock.current === idx + 1) ? idx : idx + 1;
        clock.current = Math.min(newVal, clock.target);
        await game.settings.set("trespasser", "eventClocks", JSON.stringify(clocks));
        this.render();
    }
  }

  /**
   * Manual form submission handler for AppV2.
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    if (!game.user.isGM) {
        ui.notifications.warn("You do not have permission to edit Event Clocks.");
        return;
    }
    
    const settingJson = game.settings.get("trespasser", "eventClocks") || "[]";
    const clocks = JSON.parse(settingJson);
    
    // Use the native formData.object mapped by ApplicationV2
    const data = formData.object;
    
    // Use ID from form or options
    const clockId = data.id || this.clockId;
    const clockIndex = clocks.findIndex(c => c.id === clockId);
    
    if (clockIndex !== -1) {
        // Manual fallback for prose-mirror content if needed
        const description = form.querySelector("prose-mirror[name='description']")?.value || data.description;
        
        const target = parseInt(data.target) || clocks[clockIndex].target || 4;
        const current = Math.min(parseInt(data.current) || 0, target);
        
        clocks[clockIndex] = {
            ...clocks[clockIndex],
            name: data.name,
            playerName: data.playerName,
            description: description,
            target: target,
            current: current,
            gmOnly: !!data.gmOnly
        };
        await game.settings.set("trespasser", "eventClocks", JSON.stringify(clocks));
        
        // Immediate re-render for feedback
        this.render();
        
        // Also refresh the tracker if it is open
        if ( game.trespasser.EventClocks ) {
            game.trespasser.EventClocks.getInstance().render();
        }
    }
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
  }
}
