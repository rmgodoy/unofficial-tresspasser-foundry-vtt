/**
 * Event Clocks Tracker Application for Trespasser RPG
 *
 * Singleton sheet that shows a list of Event Clocks stored in game.settings.
 */

const { api } = foundry.applications;

export class EventClocksTracker extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "event-clocks-tracker",
    classes: ["trespasser", "event-clocks-tracker"],
    position: { width: 350, height: 400, top: 120, left: 150 },
    window: {
      title: "EventClocks.TrackerTitle",
      resizable: true,
      minimizable: true
    },
    actions: {
      addClock: EventClocksTracker.#onAddClock,
      editClock: EventClocksTracker.#onEditClock,
      deleteClock: EventClocksTracker.#onDeleteClock,
      toggleClock: EventClocksTracker.#onToggleClock
    }
  };

  static PARTS = {
    tracker: {
      template: "systems/trespasser/templates/exploration/event-clocks-tracker.hbs",
      scrollable: [".event-clocks-content"]
    }
  };

  /* -------------------------------------------- */
  /* Singleton Management                         */
  /* -------------------------------------------- */

  /** @type {EventClocksTracker|null} */
  static _instance = null;

  /**
   * Get or create the singleton tracker instance.
   * @returns {EventClocksTracker}
   */
  static getInstance() {
    if (!EventClocksTracker._instance) {
      EventClocksTracker._instance = new EventClocksTracker();
    }
    return EventClocksTracker._instance;
  }

  /**
   * Launch the tracker.
   */
  static async launch() {
    const tracker = EventClocksTracker.getInstance();
    tracker.render(true);
  }

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const settingJson = game.settings.get("trespasser", "eventClocks") || "[]";
    let clocks = [];
    try {
        clocks = JSON.parse(settingJson);
    } catch(e) {
        console.error("Trespasser | Failed to parse eventClocks setting", e);
    }
    
    context.isGM = game.user.isGM;
    context.clockSize = game.settings.get("trespasser", "clockSize") || 40;

    // Filter and prepare clocks
    context.clocks = clocks
        .filter(c => context.isGM || !c.gmOnly)
        .map(c => {
            const displayName = (context.isGM || !c.playerName) ? c.name : c.playerName;
            
            // Build simple clock segments for the list view
            const total = Math.max(2, c.target || 4);
            const filled = Math.min(c.current || 0, total);
            
            return {
                ...c,
                displayName,
                clockSegments: this._buildClockSegments(total, filled, 44), // Full radius, scale with size
                total,
                filled
            };
        });

    context.hasClocks = context.clocks.length > 0;
    
    return context;
  }

  /**
   * Helper to build SVG segments (reused from injury sheet logic)
   */
  _buildClockSegments(total, filled, r = 44) {
    const cx = 50, cy = 50;
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

  static async #onAddClock(event, target) {
    if (!game.user.isGM) return;
    
    const settingJson = game.settings.get("trespasser", "eventClocks") || "[]";
    const clocks = JSON.parse(settingJson);
    
    const newClock = {
        id: foundry.utils.randomID(),
        name: game.i18n.localize("EventClocks.Name"),
        playerName: "",
        description: "",
        target: 4,
        current: 0,
        gmOnly: true
    };
    
    clocks.push(newClock);
    await game.settings.set("trespasser", "eventClocks", JSON.stringify(clocks));
    // The hook will trigger re-render
  }

  static async #onEditClock(event, target) {
    if (!game.user.isGM) return;
    const clockId = target.dataset.clockId;
    const { EventClockSheet } = await import("../sheets/event-clock-sheet.mjs");
    new EventClockSheet({ clockId }).render(true);
  }

  static async #onDeleteClock(event, target) {
    if (!game.user.isGM) return;
    const clockId = target.dataset.clockId;
    
    const confirm = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("EventClocks.DeleteConfirmTitle") },
        content: `<p>${game.i18n.localize("EventClocks.DeleteConfirmContent")}</p>`,
        rejectClose: false
    });

    if (!confirm) return;

    const settingJson = game.settings.get("trespasser", "eventClocks") || "[]";
    const clocks = JSON.parse(settingJson).filter(c => c.id !== clockId);
    await game.settings.set("trespasser", "eventClocks", JSON.stringify(clocks));
  }

  /**
   * Advance or retreat the clock by clicking a segment
   */
  static async #onToggleClock(event, target) {
    if (!game.user.isGM) return;
    const clockId = target.dataset.clockId;
    const idx = parseInt(target.dataset.index);
    if (isNaN(idx)) return;

    const settingJson = game.settings.get("trespasser", "eventClocks") || "[]";
    const clocks = JSON.parse(settingJson);
    const clock = clocks.find(c => c.id === clockId);
    
    if (clock) {
        // If clicking the current segment index, set to that index (decreasing by 1 segment)
        // If clicking a different segment, set to that number (index + 1)
        const newVal = (clock.current === idx + 1) ? idx : idx + 1;
        clock.current = Math.min(Math.max(0, newVal), clock.target);
        await game.settings.set("trespasser", "eventClocks", JSON.stringify(clocks));
    }
  }

  /* -------------------------------------------- */
  /* Lifecycle                                    */
  /* -------------------------------------------- */

  async render(options, _options) {
      // Capture the current scroll position before the render logic destroys the content
      const scrollEl = this.element ? this.element.querySelector(".event-clocks-content") : null;
      const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
      
      // Perform the actual render
      await super.render(options, _options);
      
      // Restore the scroll position on the newly rendered content
      const newEl = this.element ? this.element.querySelector(".event-clocks-content") : null;
      if (newEl) {
          newEl.scrollTop = Math.min(scrollTop, newEl.scrollHeight - newEl.clientHeight);
      }
      
      return this;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // No need for a custom hook if we use the generic "updateSetting" or similar if it exists,
    // but usually we can just hook into the specific setting change.
    if (!this._settingHookId) {
        // Foundry doesn't have a direct "updateSetting" hook for specific keys that triggers on all clients easily 
        // without custom socket work, but world settings synced via core should trigger a refresh or we can use a hook.
        // Actually, game.settings.set syncs to all clients.
        // Let's use a custom hook we'll trigger or just rely on the fact that world settings sync.
        // For ApplicationV2, we might need to manually listen for the change if we want instant reaction.
    }
  }
}

/**
 * Register the event clocks tracker scene control button and hooks.
 */
export function registerEventClocksHooks() {
  Hooks.on("renderSceneControls", (controls, html) => {
    if (html.querySelector(".event-clocks-control")) return;

    const layers = html.querySelector("#scene-controls-layers");
    if (!layers) return;

    const li = document.createElement("li");
    li.classList.add("control", "event-clocks-control");
    li.innerHTML = `
      <button type="button" class="control ui-control tool icon button fas fa-clock" 
        data-action="tool" data-tool="eventClocks" 
        aria-label="${game.i18n.localize("EventClocks.Button")}" 
        aria-pressed="false" data-tooltip="${game.i18n.localize("EventClocks.Button")}">
      </button>
    `;

    li.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      EventClocksTracker.launch();
    });

    layers.appendChild(li);
  });
  
  // Re-render all open trackers and sheets when settings change
  Hooks.on("updateSetting", (setting) => {
      if (setting.key === "trespasser.eventClocks") {
          // Re-render tracker
          EventClocksTracker.getInstance().render();
          
          // Re-render any open EventClockSheet instances
          for ( const app of foundry.applications.instances.values() ) {
            if ( app.constructor.name === "EventClockSheet" ) app.render();
          }
      }
  });
}
