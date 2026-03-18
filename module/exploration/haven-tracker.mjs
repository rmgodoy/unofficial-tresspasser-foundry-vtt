/**
 * Haven Tracker Application for Trespasser RPG
 *
 * Singleton sheet that shows a list of Haven actors.
 */

const { api } = foundry.applications;

export class HavenTracker extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "haven-tracker",
    classes: ["trespasser", "haven-tracker"],
    position: { width: 300, height: "auto", top: 100 },
    window: {
      title: "TRESPASSER.Haven.Tracker.Title",
      resizable: true,
      minimizable: true
    },
    actions: {
      openHavenSheet: HavenTracker.#onOpenHavenSheet
    }
  };

  static PARTS = {
    tracker: {
      template: "systems/trespasser/templates/exploration/haven-tracker.hbs"
    }
  };

  /* -------------------------------------------- */
  /* Singleton Management                         */
  /* -------------------------------------------- */

  /** @type {HavenTracker|null} */
  static _instance = null;

  /**
   * Get or create the singleton tracker instance.
   * @returns {HavenTracker}
   */
  static getInstance() {
    if (!HavenTracker._instance) {
      HavenTracker._instance = new HavenTracker();
    }
    return HavenTracker._instance;
  }

  /**
   * Launch the tracker.
   */
  static async launch() {
    const tracker = HavenTracker.getInstance();
    tracker.render(true);
  }

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Collect all actors of type 'haven'
    const havens = game.actors.filter(a => a.type === "haven");
    
    context.havens = havens.map(h => ({
      id: h.id,
      name: h.name,
      img: h.img,
      level: h.system.level ?? 0,
    }));
    
    context.hasHavens = havens.length > 0;
    
    return context;
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  /**
   * Open a Haven actor's sheet.
   */
  static #onOpenHavenSheet(event, target) {
    const havenId = target.dataset.havenId;
    const actor = game.actors.get(havenId);
    if (actor) actor.sheet.render(true);
  }

  /* -------------------------------------------- */
  /* Lifecycle                                    */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    if (!this._updateHookId) {
      this._updateHookId = Hooks.on("updateActor", (actor) => {
        if (actor.type === "haven") this.render();
      });
      this._createActorHookId = Hooks.on("createActor", (actor) => {
        if (actor.type === "haven") this.render();
      });
      this._deleteActorHookId = Hooks.on("deleteActor", (actor) => {
        if (actor.type === "haven") this.render();
      });
    }
  }

  /** @override */
  async close(options = {}) {
    if (this._updateHookId) {
      Hooks.off("updateActor", this._updateHookId);
      this._updateHookId = null;
    }
    if (this._createActorHookId) {
      Hooks.off("createActor", this._createActorHookId);
      this._createActorHookId = null;
    }
    if (this._deleteActorHookId) {
      Hooks.off("deleteActor", this._deleteActorHookId);
      this._deleteActorHookId = null;
    }
    HavenTracker._instance = null;
    return super.close(options);
  }
}

/* -------------------------------------------- */
/* Registration                                 */
/* -------------------------------------------- */

/**
 * Register the haven tracker scene control button and hooks.
 */
export function registerHavenTrackerHooks() {
  Hooks.on("renderSceneControls", (controls, html) => {
    if (html.querySelector(".haven-tracker-control")) return;

    const layers = html.querySelector("#scene-controls-layers");
    if (!layers) return;

    const li = document.createElement("li");
    li.classList.add("control", "haven-tracker-control");
    li.innerHTML = `
      <button type="button" class="control ui-control tool icon button fas fa-castle" 
        data-action="tool" data-tool="havenTracker" 
        aria-label="${game.i18n.localize("TRESPASSER.Haven.Tracker.Button")}" 
        aria-pressed="false" data-tooltip="${game.i18n.localize("TRESPASSER.Haven.Tracker.Button")}">
      </button>
    `;

    li.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      HavenTracker.launch();
    });

    layers.appendChild(li);
  });
}
