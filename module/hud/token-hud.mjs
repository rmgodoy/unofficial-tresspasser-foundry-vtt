import { TrespasserCombat }        from "../documents/combat.mjs";
import { MovementOverlay }         from "../canvas/movement-overlay.mjs";
import {
  prepareHudContext,
  getCombatant,
  getNearbyAllies,
  getThrowOptions,
  getDeedOptions,
  getManeuverOptions,
  getInteractOptions,
  getSmashOptions,
  getTakeAimOptions,
  getVaultRange,
  getSortedDeeds,
  getAvailableConcoctions
} from "./hud-context.mjs";
import {
  handleMovePanelPreToggle,
  updateMovementOverlayForPanel,
  executeMove,
  undoMove,
  executeVault,
  executeWait,
  executeForceMove
} from "./hud-actions-movement.mjs";
import {
  executeDefend,
  executeHelp,
  executePrevail,
  executeTakeAim,
  executeThrow
} from "./hud-actions-combat.mjs";
import {
  executeAttemptDeed,
  executeUseConcoction,
  executeInteract,
  executeManeuver,
  executeSmash,
  executeRummage,
  modifyAP,
  onSpendAP
} from "./hud-actions-deeds-skills.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Token Action HUD for Trespasser TTRPG.
 * Provides quick actions (Defend, Help, Move, etc.) during combat.
 */
export class TrespasserTokenHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._token = null;
    this._activePanel = null;
    this._selectedDeedId = null;
    this._deedDropdownOpen = false;
    this._initHooks();
  }

  static DEFAULT_OPTIONS = {
    id: "trespasser-token-hud",
    tag: "div",
    classes: ["trespasser-token-hud"],
    window: {
      frame: false,
      resizable: false
    },
    position: {
      width: "auto",
      height: "auto",
      top: 60,
      left: 150
    }
  };

  static PARTS = {
    hud: {
      template: "systems/trespasser/templates/hud/token-hud.hbs"
    }
  };

  /** @override */
  _prepareContext(options) {
    return prepareHudContext(this);
  }

  /** @override */
  _onRender(context, options) {
    this._restorePanelState();
    const onRight = (this.position.left ?? 0) > window.innerWidth / 2;
    this.element.classList.toggle("hud-on-right", onRight);
  }

  _restorePanelState() {
    if (!this._activePanel) return;
    const panel = this.element.querySelector(`#panel-${this._activePanel}`);
    if (panel) panel.classList.remove("hidden");
  }

  _getNearbyAllies() { return getNearbyAllies(this._token); }
  _getCombatant() { return getCombatant(this._token); }
  _getThrowOptions(ap) { return getThrowOptions(this._token, ap); }
  _getDeedOptions(ap) { return getDeedOptions(ap); }
  _getManeuverOptions(ap) { return getManeuverOptions(ap); }
  _getInteractOptions(ap) { return getInteractOptions(ap); }
  _getSmashOptions(ap) { return getSmashOptions(ap); }
  _getTakeAimOptions(ap) { return getTakeAimOptions(ap); }
  _getVaultRange() { return getVaultRange(this._token); }
  _getSortedDeeds() { return getSortedDeeds(this._token); }
  _getAvailableConcoctions() { return getAvailableConcoctions(this._token); }

  _initHooks() {
    Hooks.on("controlToken", (token, controlled) => {
      this._selectedDeedId = null;
      this._deedDropdownOpen = false;
      if (controlled) {
        this._token = token;
        this.render({ force: true });
      } else {
        const activeToken = canvas.tokens.controlled[0];
        if (activeToken) {
          this._token = activeToken;
          this.render({ force: true });
        } else {
          if (this.state !== 0 && this.state !== -1) this.close();
          this._token = null;
        }
      }
    });

    Hooks.on("updateCombat", () => this._checkAndRenderForActiveToken());
    Hooks.on("createCombat", () => this._checkAndRenderForActiveToken());
    Hooks.on("deleteCombat", async () => {
      this.close();
      if (this._token?.actor) {
        await this._token.actor.unsetFlag("trespasser", "aimRangeBonus");
      }
    });
    Hooks.on("canvasReady", () => this._checkAndRenderForActiveToken());

    Hooks.on("updateCombatant", (combatant) => {
      if (this._token && combatant.tokenId === this._token.id) {
        this.render();
      }
    });

    Hooks.on("updateActor", (actor) => {
      if (this._token && actor.id === this._token.actor?.id) this.render();
    });
    Hooks.on("createItem", (item) => {
      if (this._token && item.parent?.id === this._token.actor?.id) this.render();
    });
    Hooks.on("updateItem", (item) => {
      if (this._token && item.parent?.id === this._token.actor?.id) this.render();
    });
    Hooks.on("deleteItem", (item) => {
      if (this._token && item.parent?.id === this._token.actor?.id) this.render();
    });

    if (game.ready) this._checkAndRenderForActiveToken();
    else Hooks.once("ready", () => this._checkAndRenderForActiveToken());
  }

  _checkAndRenderForActiveToken() {
    const activeToken = canvas.tokens?.controlled[0];
    if (activeToken) {
      this._token = activeToken;
      this.render({ force: true });
    } else {
      if (MovementOverlay) MovementOverlay.clearInformativeOverlay();
    }
  }

  /** @override */
  close(options) {
    if (MovementOverlay) MovementOverlay.clearInformativeOverlay();
    return super.close(options);
  }

  /** @override */
  _onFirstRender(context, options) {
    this.element.addEventListener("click", ev => {
      const deedOpt = ev.target.closest(".hud-deed-option");
      if (deedOpt) {
        const deedId = deedOpt.dataset.deedId;
        if (deedId) this._selectDeed(deedId);
        return;
      }

      const action = ev.target.closest("[data-action]")?.dataset.action;
      if (!action) {
        if (!ev.target.closest(".hud-deed-select")) this._closeDeedDropdown();
        return;
      }

      if (action !== "toggle-deed-dropdown") this._closeDeedDropdown();

      switch (action) {
        case "toggle-deed-dropdown":    this._toggleDeedDropdown(); break;
        case "toggle-panel":            this._togglePanel(ev.target.closest("[data-panel]").dataset.panel); break;
        case "execute-defend":          executeDefend(this); break;
        case "execute-help":            executeHelp(this); break;
        case "execute-move":            executeMove(this); break;
        case "execute-undo":            undoMove(this); break;
        case "execute-prevail":         executePrevail(this); break;
        case "execute-attempt-deed":    executeAttemptDeed(this); break;
        case "execute-use-concoction":  executeUseConcoction(this); break;
        case "execute-take-aim":        executeTakeAim(this); break;
        case "execute-interact":        executeInteract(this); break;
        case "execute-maneuver":        executeManeuver(this); break;
        case "execute-smash":           executeSmash(this); break;
        case "execute-rummage":         executeRummage(this); break;
        case "execute-throw":           executeThrow(this); break;
        case "execute-vault":           executeVault(this); break;
        case "execute-wait":            executeWait(this); break;
        case "execute-force-move":      executeForceMove(this); break;
        case "modify-ap":               modifyAP(this, ev); break;
        case "spend-ap":                onSpendAP(this); break;
      }
    });

    this.element.addEventListener("mousedown", ev => {
      if (ev.target.closest("header")) {
        if (ev.target.closest("button, [data-action], .ap-icon")) return;
        this._onHeaderMouseDown(ev);
      }
    });

    document.addEventListener("click", ev => {
      if (!this.element?.contains(ev.target)) {
        this._closeDeedDropdown();
      }
    });
  }

  _onHeaderMouseDown(ev) {
    if (ev.button !== 0) return;
    ev.preventDefault();

    const initialLeft = this.position.left || this.element.offsetLeft;
    const initialTop = this.position.top || this.element.offsetTop;
    const startX = ev.pageX;
    const startY = ev.pageY;

    const onMove = (moveEv) => {
      const dx = moveEv.pageX - startX;
      const dy = moveEv.pageY - startY;
      const newLeft = initialLeft + dx;
      this.setPosition({ left: newLeft, top: initialTop + dy });
      this.element.classList.toggle("hud-on-right", newLeft > window.innerWidth / 2);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  _togglePanel(panelId) {
    this._closeDeedDropdown();
    if (handleMovePanelPreToggle(this, panelId)) return;

    const panels = this.element.querySelectorAll(".hud-sub-panel");
    let panelNowOpen = false;
    panels.forEach(p => {
      if (p.id === `panel-${panelId}`) {
        const isHidden = p.classList.toggle("hidden");
        this._activePanel = isHidden ? null : panelId;
        if (!isHidden) panelNowOpen = true;
      } else {
        p.classList.add("hidden");
      }
    });

    updateMovementOverlayForPanel(this, panelId, panelNowOpen);
  }

  _toggleDeedDropdown() {
    this._deedDropdownOpen = !this._deedDropdownOpen;
    const menu = this.element.querySelector(".hud-deed-select .hud-custom-select-menu");
    const selectEl = this.element.querySelector(".hud-deed-select");
    if (menu) menu.classList.toggle("hidden", !this._deedDropdownOpen);
    if (selectEl) selectEl.classList.toggle("open", this._deedDropdownOpen);
  }

  _closeDeedDropdown() {
    if (!this._deedDropdownOpen) return;
    this._deedDropdownOpen = false;
    const menu = this.element.querySelector(".hud-deed-select .hud-custom-select-menu");
    const selectEl = this.element.querySelector(".hud-deed-select");
    if (menu) menu.classList.add("hidden");
    if (selectEl) selectEl.classList.remove("open");
  }

  _selectDeed(deedId) {
    this._selectedDeedId = deedId;
    this._deedDropdownOpen = false;
    const input = this.element.querySelector("[name='attempt-deed-id']");
    if (input) input.value = deedId;
    this.render();
  }

  // Delegated wrappers for external callers
  async _executeDefend() { return executeDefend(this); }
  async _executeHelp() { return executeHelp(this); }
  async _executeMove() { return executeMove(this); }
  async _undoMove() { return undoMove(this); }
  async _executePrevail() { return executePrevail(this); }
  async _executeAttemptDeed() { return executeAttemptDeed(this); }
  async _executeUseConcoction() { return executeUseConcoction(this); }
  async _executeTakeAim() { return executeTakeAim(this); }
  async _executeInteract() { return executeInteract(this); }
  async _executeManeuver() { return executeManeuver(this); }
  async _executeSmash() { return executeSmash(this); }
  async _executeRummage() { return executeRummage(this); }
  async _executeThrow() { return executeThrow(this); }
  async _executeVault() { return executeVault(this); }
  async _executeWait() { return executeWait(this); }
  async _modifyAP(ev) { return modifyAP(this, ev); }
  async _onSpendAP() { return onSpendAP(this); }
  async _executeForceMove() { return executeForceMove(this); }
}
