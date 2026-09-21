const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications?.api || {};
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * TargetPreviewHUD — Floating canvas HUD overlay for previewing deed outcome
 * (damage, healing, spark bonuses) right above targeted/hovered tokens.
 * Built using ApplicationsV2.
 */
export class TargetPreviewHUD extends (HandlebarsApplicationMixin ? HandlebarsApplicationMixin(ApplicationV2) : class {}) {
  /** @type {TargetPreviewHUD|null} Singleton active preview HUD for local caster */
  static activeHUD = null;

  /** @type {TargetPreviewHUD|null} Singleton active preview HUD for spectators */
  static spectatorHUD = null;

  static DEFAULT_OPTIONS = {
    id: "trespasser-target-preview-hud",
    classes: ["trespasser", "target-preview-hud-layer"],
    tag: "div",
    window: {
      frame: false,
      resizable: false,
      minimizable: false
    },
    position: {
      width: "100%",
      height: "100%",
      top: 0,
      left: 0
    }
  };

  static PARTS = {
    hud: {
      template: "systems/trespasser/templates/hud/target-preview-hud.hbs"
    }
  };

  constructor(options = {}) {
    super(options);
    this.isSpectator = Boolean(options.isSpectator);
    /** @type {Array<object>} List of TokenDeedOutcomePreview */
    this.targets = [];
    this._onCanvasPanBound = this._repositionAllPills.bind(this);
  }

  /**
   * Show or update the TargetPreviewHUD with a list of target outcomes for the active caster.
   * @param {Array<object>} targetOutcomes
   */
  static async update(targetOutcomes = []) {
    const showInfo = Boolean(game.settings?.get(SYSTEM_ID, "showTargetPreviewInfo") ?? true);
    if (!showInfo) {
      if (this.activeHUD) {
        this.activeHUD.clear();
      }
      return;
    }

    const validOutcomes = (targetOutcomes || []).filter(t => t.role !== "unaffected" && t.hasAnyOutcome);
    if (!validOutcomes || validOutcomes.length === 0) {
      if (this.activeHUD) {
        this.activeHUD.clear();
      }
      return;
    }

    if (!this.activeHUD) {
      this.activeHUD = new TargetPreviewHUD();
      await this.activeHUD.render(true);
    }

    this.activeHUD.setTargets(validOutcomes);
  }

  /**
   * Hide and clear active preview HUD for the local caster.
   */
  static clear() {
    if (this.activeHUD) {
      this.activeHUD.clear();
    }
  }

  /**
   * Show or update the spectator TargetPreviewHUD for remote targeting.
   * @param {Array<object>} targetOutcomes
   */
  static async updateSpectator(targetOutcomes = []) {
    const showInfo = Boolean(game.settings?.get("trespasser", "showTargetPreviewInfo") ?? true);
    if (!showInfo) {
      if (this.spectatorHUD) {
        this.spectatorHUD.clear();
      }
      return;
    }

    const validOutcomes = (targetOutcomes || []).filter(t => t.role !== "unaffected" && t.hasAnyOutcome);
    if (!validOutcomes || validOutcomes.length === 0) {
      if (this.spectatorHUD) {
        this.spectatorHUD.clear();
      }
      return;
    }

    if (!this.spectatorHUD) {
      this.spectatorHUD = new TargetPreviewHUD({
        id: "trespasser-spectator-preview-hud",
        classes: ["trespasser", "target-preview-hud-layer", "is-spectator"],
        isSpectator: true
      });
      await this.spectatorHUD.render(true);
    }

    this.spectatorHUD.setTargets(validOutcomes);
  }

  /**
   * Hide and clear spectator preview HUD.
   */
  static clearSpectator() {
    if (this.spectatorHUD) {
      this.spectatorHUD.clear();
    }
  }

  setTargets(targets) {
    const showInfo = Boolean(game.settings?.get("trespasser", "showTargetPreviewInfo") ?? true);
    if (!showInfo) {
      this.targets = [];
    } else {
      this.targets = targets.filter(t => t.role !== "unaffected" && t.hasAnyOutcome);
    }
    this.render(false);
  }

  clear() {
    this.targets = [];
    if (this.rendered) {
      this.render(false);
    }
  }

  /** @override */
  async _prepareContext() {
    return {
      targets: this.targets,
      isSpectator: this.isSpectator
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this._repositionAllPills();

    if (!this._hasPanHook) {
      Hooks.on("canvasPan", this._onCanvasPanBound);
      this._hasPanHook = true;
    }
  }

  /** @override */
  async close(options = {}) {
    if (this._hasPanHook) {
      Hooks.off("canvasPan", this._onCanvasPanBound);
      this._hasPanHook = false;
    }
    if (TargetPreviewHUD.activeHUD === this) {
      TargetPreviewHUD.activeHUD = null;
    }
    return super.close(options);
  }

  _repositionAllPills() {
    if (!this.element || !canvas.ready) return;

    const tokenEntries = [];

    // 1. Gather coordinates and token positions
    for (const target of this.targets) {
      const card = this.element.querySelector(`#target-pill-${target.tokenId}`);
      if (!card) continue;

      const tokenObj = canvas.tokens?.get(target.tokenId);
      if (!tokenObj) continue;

      const doc = tokenObj.document ?? tokenObj;
      const gridPx = canvas.grid?.size ?? 100;
      const tW = (doc.width ?? 1) * gridPx;
      const tH = (doc.height ?? 1) * gridPx;
      const center = tokenObj.center || { x: doc.x + tW / 2, y: doc.y + tH / 2 };

      const topCanvas = { x: center.x, y: doc.y };
      const bottomCanvas = { x: center.x, y: doc.y + tH };

      const topScreen = this._getScreenPos(topCanvas);
      const bottomScreen = this._getScreenPos(bottomCanvas);
      if (!topScreen || !bottomScreen) continue;

      tokenEntries.push({
        target,
        card,
        doc,
        tW,
        tH,
        topScreen,
        bottomScreen
      });
    }

    if (tokenEntries.length === 0) return;

    // 2. Determine base placement: Top vs Bottom
    // If another target token is immediately above this token, place pill BELOW to prevent vertical crowding
    for (const entry of tokenEntries) {
      const hasNeighborAbove = tokenEntries.some(other => {
        if (other.target.tokenId === entry.target.tokenId) return false;
        const dy = entry.doc.y - other.doc.y;
        const dx = Math.abs(entry.doc.x - other.doc.x);
        return dy > 0 && dy <= entry.tH * 1.5 && dx < entry.tW * 0.9;
      });

      entry.placeBelow = hasNeighborAbove;
      const anchor = entry.placeBelow ? entry.bottomScreen : entry.topScreen;
      entry.baseX = anchor.x;
      entry.baseY = entry.placeBelow ? (anchor.y + 4) : (anchor.y - 4);
      entry.transformY = entry.placeBelow ? "0%" : "-100%";
    }

    // 3. Measure bounding boxes and resolve overlaps
    // Render initial placement to obtain card dimensions
    for (const entry of tokenEntries) {
      entry.card.style.position = "fixed";
      entry.card.style.left = `${entry.baseX}px`;
      entry.card.style.top = `${entry.baseY}px`;
      entry.card.style.transform = `translate(-50%, ${entry.transformY})`;
      entry.card.style.pointerEvents = "none";
    }

    // 4. Collision resolution pass between card rectangles
    const rects = tokenEntries.map(e => {
      const r = e.card.getBoundingClientRect();
      return {
        entry: e,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width || 80,
        height: r.height || 34,
        offsetX: 0,
        offsetY: 0
      };
    });

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];

        const aLeft = a.left + a.offsetX;
        const aRight = a.right + a.offsetX;
        const aTop = a.top + a.offsetY;
        const aBottom = a.bottom + a.offsetY;

        const bLeft = b.left + b.offsetX;
        const bRight = b.right + b.offsetX;
        const bTop = b.top + b.offsetY;
        const bBottom = b.bottom + b.offsetY;

        const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
        const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

        if (overlapX > 0 && overlapY > 0) {
          // Cards collide!
          if (overlapX < overlapY) {
            // Horizontal nudge
            const shift = (overlapX / 2) + 3;
            if (aLeft < bLeft) {
              a.offsetX -= shift;
              b.offsetX += shift;
            } else {
              a.offsetX += shift;
              b.offsetX -= shift;
            }
          } else {
            // Vertical nudge
            const shift = (overlapY / 2) + 3;
            if (aTop < bTop) {
              a.offsetY -= shift;
              b.offsetY += shift;
            } else {
              a.offsetY += shift;
              b.offsetY -= shift;
            }
          }
        }
      }
    }

    // Apply nudged coordinates
    for (const r of rects) {
      const finalX = r.entry.baseX + r.offsetX;
      const finalY = r.entry.baseY + r.offsetY;
      r.entry.card.style.left = `${finalX}px`;
      r.entry.card.style.top = `${finalY}px`;
    }
  }

  _getScreenPos(canvasPoint) {
    if (typeof canvas.clientCoordinatesFromCanvas === "function") {
      try {
        const pt = canvas.clientCoordinatesFromCanvas(canvasPoint);
        if (pt) return pt;
      } catch {}
    }
    if (canvas.stage) {
      try {
        const pt = canvas.stage.worldTransform.apply(canvasPoint);
        if (pt) return { x: pt.x, y: pt.y };
      } catch {}
    }
    return null;
  }
}
