import { CanvasSelectionRenderer } from "../canvas/canvas-selection-renderer.mjs";
import { TargetPreviewHUD } from "../hud/target-preview-hud.mjs";

/**
 * TargetingPreviewSyncer — Coordinates real-time canvas targeting previews across connected Foundry VTT clients.
 * Broadcaster throttles pointer updates and sends them via WebSocket.
 * Receivers render range perimeter, area squares, path, and token overlays in a muted spectator gray tone.
 */
export class TargetingPreviewSyncer {
  /** @type {Map<string, PIXI.Graphics>} Remote graphics layers keyed by sender userId */
  static _remoteLayers = new Map();

  /** @type {Map<string, Array<object>>} Remote target outcomes keyed by sender userId */
  static _remoteOutcomes = new Map();

  /** @type {number|null} Broadcast throttle timer ID */
  static _throttleTimer = null;

  /** @type {object|null} Pending payload waiting to be broadcast */
  static _pendingPayload = null;

  /** @type {number} Throttle interval in milliseconds (~30fps) */
  static THROTTLE_MS = 35;

  // Spectator gray palette
  static SPECTATOR_COLOR_RANGE     = 0x999999;
  static SPECTATOR_COLOR_HALO      = 0x222222;
  static SPECTATOR_COLOR_PLACED    = 0x777777;
  static SPECTATOR_COLOR_CANDIDATE = 0x666666;
  static SPECTATOR_COLOR_PATH      = 0x888888;
  static SPECTATOR_COLOR_TOKEN     = 0xAAAAAA;

  /**
   * Convert an arbitrary RGB color number into its luminance-matched grayscale hex value.
   * @param {number} color
   * @returns {number}
   */
  static toGrayscaleColor(color) {
    if (typeof color !== "number" || isNaN(color)) return this.SPECTATOR_COLOR_TOKEN;
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const gray = Math.max(90, Math.min(210, lum));
    return (gray << 16) | (gray << 8) | gray;
  }

  /**
   * Initialize canvas and session event hooks.
   */
  static init() {
    Hooks.on("canvasReady", () => this.clearAllRemote());
    Hooks.on("canvasTearDown", () => this.clearAllRemote());
  }

  /* -------------------------------------------- */
  /* Broadcaster Methods (Active Caster Client)   */
  /* -------------------------------------------- */

  /**
   * Broadcast targeting preview data to all other connected clients.
   * Pointermove updates are throttled; clicks and state updates can set immediate: true.
   * @param {object} previewData
   * @param {object} [options]
   * @param {boolean} [options.immediate=false]
   */
  static sync(previewData = {}, { immediate = false } = {}) {
    if (!game.user || !canvas.ready) return;

    const payload = {
      ...previewData,
      sceneId: canvas.scene?.id
    };

    if (immediate) {
      if (this._throttleTimer) {
        clearTimeout(this._throttleTimer);
        this._throttleTimer = null;
      }
      this._pendingPayload = null;
      this._emitSocketUpdate(payload);
      return;
    }

    this._pendingPayload = payload;
    if (!this._throttleTimer) {
      this._throttleTimer = setTimeout(() => {
        this._throttleTimer = null;
        if (this._pendingPayload) {
          const toSend = this._pendingPayload;
          this._pendingPayload = null;
          this._emitSocketUpdate(toSend);
        }
      }, this.THROTTLE_MS);
    }
  }

  /**
   * Broadcast a clear message to remove remote previews on other clients.
   */
  static clear() {
    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer);
      this._throttleTimer = null;
    }
    this._pendingPayload = null;

    if (!game.user || !canvas.ready) return;
    this._emitSocketClear();
  }

  /**
   * Internal helper to emit TARGETING_PREVIEW_UPDATE.
   * @private
   */
  static _emitSocketUpdate(payload) {
    const { TrespasserSocket } = game.trespasser || {};
    if (TrespasserSocket) {
      TrespasserSocket.emit("TARGETING_PREVIEW_UPDATE", payload);
    }
  }

  /**
   * Internal helper to emit TARGETING_PREVIEW_CLEAR.
   * @private
   */
  static _emitSocketClear() {
    const { TrespasserSocket } = game.trespasser || {};
    if (TrespasserSocket) {
      TrespasserSocket.emit("TARGETING_PREVIEW_CLEAR", { sceneId: canvas.scene?.id });
    }
  }

  /* -------------------------------------------- */
  /* Receiver Methods (Spectator Clients)         */
  /* -------------------------------------------- */

  /**
   * Handle incoming preview update from another client.
   * @param {object} data
   * @param {string} senderId
   */
  static handleRemoteUpdate(data, senderId) {
    if (!senderId || senderId === game.user.id) return;
    if (!canvas.ready || !canvas.interface) return;
    if (data.sceneId && canvas.scene?.id && data.sceneId !== canvas.scene.id) return;

    const gridPx = canvas.grid?.size ?? 100;

    // 1. Get or create dedicated PIXI graphics layer for this sender
    let gfx = this._remoteLayers.get(senderId);
    if (!gfx || gfx.destroyed) {
      gfx = new PIXI.Graphics();
      canvas.interface.addChild(gfx);
      this._remoteLayers.set(senderId, gfx);
    }
    gfx.clear();

    // 2. Draw Range Perimeter (in spectator gray)
    if (data.rangePerimeter && data.rangePerimeter.rangeSq > 0) {
      const { tokenId, rangeSq, originOverride } = data.rangePerimeter;
      const token = tokenId ? canvas.tokens?.get(tokenId) : null;
      if (token || originOverride) {
        CanvasSelectionRenderer.drawRangePerimeter(gfx, token, rangeSq, gridPx, {
          originOverride,
          color: this.SPECTATOR_COLOR_RANGE,
          haloColor: this.SPECTATOR_COLOR_HALO,
          fillAlpha: 0.05,
          alpha: 0.85
        });
      }
    }

    // 3. Draw Placed / Area Squares (in spectator gray)
    if (Array.isArray(data.placedSquares) && data.placedSquares.length > 0) {
      CanvasSelectionRenderer.drawPlacedOrigin(gfx, data.placedSquares, gridPx, {
        color: this.SPECTATOR_COLOR_PLACED,
        fillAlpha: data.placedOptions?.fillAlpha ?? 0.30,
        lineWeight: data.placedOptions?.lineWeight ?? 3
      });
    }

    // 4. Draw Path Squares (in spectator gray)
    if (Array.isArray(data.pathSquares) && data.pathSquares.length > 0) {
      CanvasSelectionRenderer.drawPath(gfx, data.pathSquares, gridPx, {
        color: this.SPECTATOR_COLOR_PATH,
        drawArrows: data.pathOptions?.drawArrows ?? true
      });
    }

    // 5. Draw Candidate / Hovered Squares (in spectator gray)
    if (Array.isArray(data.candidateSquares) && data.candidateSquares.length > 0) {
      const hovered = data.hoveredSquare;
      for (const sq of data.candidateSquares) {
        const isHovered = hovered && hovered.x === sq.x && hovered.y === sq.y;
        const fillAlpha = isHovered ? 0.35 : 0.18;
        const lineWeight = isHovered ? 3 : 2;
        const lineAlpha = isHovered ? 0.9 : 0.6;

        gfx.beginFill(this.SPECTATOR_COLOR_CANDIDATE, fillAlpha);
        gfx.lineStyle(lineWeight, this.SPECTATOR_COLOR_CANDIDATE, lineAlpha);
        gfx.drawRect(sq.x, sq.y, gridPx, gridPx);
        gfx.endFill();
      }
    }

    // 6. Draw Token Target Overlays (in spectator gray)
    if (Array.isArray(data.targetTokens) && data.targetTokens.length > 0) {
      for (const target of data.targetTokens) {
        const token = canvas.tokens?.get(target.tokenId);
        if (!token) continue;
        const rawColor = target.style?.color ?? this.SPECTATOR_COLOR_TOKEN;
        const grayColor = this.toGrayscaleColor(rawColor);
        const grayStyle = {
          ...target.style,
          color: grayColor,
          fillAlpha: Math.min(0.25, (target.style?.fillAlpha ?? 0.25)),
          lineAlpha: 0.85
        };
        CanvasSelectionRenderer.drawTokenTargetOverlay(gfx, token, grayStyle, gridPx);
      }
    }

    // 7. Update Spectator TargetPreviewHUD
    if (Array.isArray(data.targetOutcomes) && data.targetOutcomes.length > 0) {
      this._remoteOutcomes.set(senderId, data.targetOutcomes);
      TargetPreviewHUD.updateSpectator(this._getAllRemoteOutcomes());
    } else {
      this._remoteOutcomes.delete(senderId);
      if (this._remoteOutcomes.size === 0) {
        TargetPreviewHUD.clearSpectator();
      } else {
        TargetPreviewHUD.updateSpectator(this._getAllRemoteOutcomes());
      }
    }
  }

  /**
   * Handle incoming preview clear message from another client.
   * @param {object} data
   * @param {string} senderId
   */
  static handleRemoteClear(data, senderId) {
    if (!senderId || senderId === game.user.id) return;

    const gfx = this._remoteLayers.get(senderId);
    if (gfx) {
      if (gfx.parent) gfx.parent.removeChild(gfx);
      gfx.destroy();
      this._remoteLayers.delete(senderId);
    }

    this._remoteOutcomes.delete(senderId);
    if (this._remoteOutcomes.size === 0) {
      TargetPreviewHUD.clearSpectator();
    } else {
      TargetPreviewHUD.updateSpectator(this._getAllRemoteOutcomes());
    }
  }

  /**
   * Clear all remote graphics and spectator HUD instances.
   */
  static clearAllRemote() {
    for (const [userId, gfx] of this._remoteLayers.entries()) {
      if (gfx && !gfx.destroyed) {
        if (gfx.parent) gfx.parent.removeChild(gfx);
        gfx.destroy();
      }
    }
    this._remoteLayers.clear();
    this._remoteOutcomes.clear();
    TargetPreviewHUD.clearSpectator();
  }

  /**
   * Collect all active remote target outcomes across all senders.
   * @private
   * @returns {Array<object>}
   */
  static _getAllRemoteOutcomes() {
    const all = [];
    for (const outcomes of this._remoteOutcomes.values()) {
      all.push(...outcomes);
    }
    return all;
  }
}
