/**
 * Patches for Foundry V14 turn markers to support Trespasser's custom phased initiative system.
 */
export function registerTurnMarkerPatches() {
  // Disable Foundry V14 default turn marker setting if present,
  // since Trespasser provides its own phased initiative turn marker system
  if (CONFIG.Combat?.settings?.turnMarker) {
    CONFIG.Combat.settings.turnMarker.enabled = false;
  }

  // Prevent default turn marker from being added to tokens in Foundry V14,
  // since Trespasser implements its own phased turn marker system (see Combat.updateTurnMarkers).
  const TokenClass = CONFIG.Token?.objectClass || globalThis.Token;

  if (TokenClass?.prototype?._refreshTurnMarker) {
    TokenClass.prototype._refreshTurnMarker = function() {
      if (this.turnMarker) {
        canvas.tokens?.turnMarkers?.delete(this);
        try {
          this.turnMarker.destroy();
        } catch (_) {}
        this.turnMarker = null;
      }
    };
  }

  // Defensively protect _refreshSize against uninitialized turnMarker.mesh in Foundry V14
  if (TokenClass?.prototype?._refreshSize) {
    const origRefreshSize = TokenClass.prototype._refreshSize;
    TokenClass.prototype._refreshSize = function() {
      if (this.turnMarker && !this.turnMarker.mesh) {
        const tm = this.turnMarker;
        this.turnMarker = null;
        try {
          return origRefreshSize.call(this);
        } finally {
          this.turnMarker = tm;
        }
      }
      return origRefreshSize.call(this);
    };
  }

  if (foundry.canvas.placeables.tokens?.TokenTurnMarker) {
    foundry.canvas.placeables.tokens.TokenTurnMarker.prototype.draw = async function() {
      if (!this.mesh) {
        this.mesh = new PIXI.Container();
        this.mesh.visible = false;
      }
      return;
    };
  }
}
