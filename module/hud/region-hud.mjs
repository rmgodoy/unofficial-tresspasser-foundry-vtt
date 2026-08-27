const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Floating Region HUD for selecting Region Config vs Terrain Config.
 * Built using ApplicationsV2.
 */
export class TrespasserRegionHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.object = null;
    this._clickPosition = null;
  }

  static DEFAULT_OPTIONS = {
    id: "trespasser-region-hud",
    classes: ["trespasser", "trespasser-region-hud"],
    tag: "div",
    window: {
      frame: false,
      title: "",
      resizable: false,
      minimizable: false
    },
    position: {
      width: "auto",
      height: "auto"
    },
    actions: {
      openRegionConfig: TrespasserRegionHUD.#onOpenRegionConfig,
      openTerrainConfig: TrespasserRegionHUD.#onOpenTerrainConfig
    }
  };

  static PARTS = {
    hud: {
      template: "systems/trespasser/templates/hud/region-hud.hbs"
    }
  };

  /**
   * Bind a Region placeable or document to this HUD and render it.
   * @param {PlaceableObject|RegionDocument} object - The Region placeable or document.
   * @param {Object} [clickPosition] - Optional { screenX, screenY, x, y } click coordinates.
   */
  async bind(object, clickPosition = null) {
    if (!object) return;
    this.object = object;
    this._clickPosition = clickPosition;
    await this.render({ force: true });
  }

  /**
   * Clear and close the HUD instantly without delay.
   */
  async clear() {
    this.object = null;
    this._clickPosition = null;
    if (this.rendered) {
      await this.close({ animate: false });
    }
  }

  /** @override */
  async _prepareContext(options) {
    if (!this.object) return {};
    const doc = this.object.document ?? this.object;
    const isTerrain = Boolean(doc.flags?.trespasser?.terrain);

    return {
      name: doc.name || game.i18n.localize("TRESPASSER.HUD.Region.DefaultTitle"),
      isTerrain: isTerrain,
      isGM: game.user.isGM,
      region: doc
    };
  }

  /** @override */
  _onRender(context, options) {
    if (this.element) {
      this.element.style.display = "";
    }
    this.setPosition(this._clickPosition);
  }

  /**
   * Position the HUD near the region on canvas or at mouse click position.
   * @param {Object} [clickPosition]
   */
  setPosition(clickPosition = null) {
    if (!this.element) return;
    const pos = clickPosition || this._clickPosition;

    let screenX = null;
    let screenY = null;

    if (pos && typeof pos.screenX === "number" && typeof pos.screenY === "number") {
      screenX = pos.screenX;
      screenY = pos.screenY;
    } else if (pos && typeof pos.x === "number" && typeof pos.y === "number" && canvas.ready) {
      if (typeof canvas.clientCoordinatesFromCanvas === "function") {
        try {
          const cl = canvas.clientCoordinatesFromCanvas(pos);
          screenX = cl.x;
          screenY = cl.y;
        } catch {}
      }
      if (screenX === null && canvas.stage) {
        try {
          const p = canvas.stage.worldTransform.apply(pos);
          screenX = p.x;
          screenY = p.y;
        } catch {}
      }
    } else if (this.object && canvas.ready) {
      let center = { x: 0, y: 0 };
      const gridSize = canvas.grid?.size || 100;
      const doc = this.object.document ?? this.object;
      const pathSquares = doc.flags?.trespasser?.pathSquares;

      if (pathSquares && Array.isArray(pathSquares) && pathSquares.length > 0) {
        const sq = pathSquares[0];
        center = { x: (sq.x + 0.5) * gridSize, y: (sq.y + 0.5) * gridSize };
      } else if (typeof this.object.center === "object" && this.object.center !== null) {
        center = this.object.center;
      } else if (this.object.bounds) {
        center = {
          x: this.object.bounds.x + (this.object.bounds.width / 2),
          y: this.object.bounds.y + (this.object.bounds.height / 2)
        };
      } else if (doc.shapes?.[0]) {
        const s = doc.shapes[0];
        center = { x: (s.x || 0) + ((s.width || gridSize) / 2), y: (s.y || 0) + ((s.height || gridSize) / 2) };
      }

      if (typeof canvas.clientCoordinatesFromCanvas === "function") {
        try {
          const cl = canvas.clientCoordinatesFromCanvas(center);
          screenX = cl.x;
          screenY = cl.y;
        } catch {}
      }
      if (screenX === null && canvas.stage) {
        try {
          const p = canvas.stage.worldTransform.apply(center);
          screenX = p.x;
          screenY = p.y;
        } catch {}
      }
    }

    if (screenX === null || screenY === null) return;

    const hudW = this.element.offsetWidth || 180;
    const hudH = this.element.offsetHeight || 60;

    const left = Math.max(10, Math.min(window.innerWidth - hudW - 10, screenX - (hudW / 2)));
    const top = Math.max(10, Math.min(window.innerHeight - hudH - 10, screenY - hudH - 15));

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
    this.element.style.position = "fixed";
    this.element.style.zIndex = "1000";
    this.element.style.pointerEvents = "auto";
  }

  static #onOpenRegionConfig(event, target) {
    event.preventDefault();
    if (!this.object) return;
    const doc = this.object.document ?? this.object;
    doc.sheet?.render(true);
    this.clear();
  }

  static #onOpenTerrainConfig(event, target) {
    event.preventDefault();
    if (!this.object) return;
    const doc = this.object.document ?? this.object;
    if (game.trespasser?.TerrainHelper) {
      game.trespasser.TerrainHelper.editTerrainRegion(doc);
    }
    this.clear();
  }
}

