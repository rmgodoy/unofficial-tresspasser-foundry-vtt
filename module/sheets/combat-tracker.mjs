/**
 * Custom Combat Tracker for Trespasser TTRPG.
 * Compatible with Foundry V13 ApplicationV2 Sidebar.
 * Uses Hook-based rendering to inject custom UI into the combat tab.
 */
export class TrespasserCombatTracker extends (foundry.applications?.sidebar?.tabs?.CombatTracker ?? CombatTracker) {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "systems/trespasser/templates/combat/combat-tracker.hbs",
      id: "combat",
      title: "Combat Tracker",
      column: true
    });
  }

  /** @override */
  async getData(options) {
    const data = await super.getData(options);
    if (!data.combat) return data;
    return this._enrichTrespasserData(data);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!context.combat) return context;
    return this._enrichTrespasserData(context);
  }

  /**
   * Enrich the combat tracker data with phases and custom stats.
   * @private
   */
  _enrichTrespasserData(data) {
    const combat = data.combat;
    const activePhase = combat.getFlag("trespasser", "activePhase");
    const combatInfo = combat.getFlag("trespasser", "combatInfo") || {};

    const phases = [
      { id: 40, label: "TRESPASSER.Phase.Early", css: "early", combatants: [] },
      { id: 30, label: "TRESPASSER.Phase.Enemy", css: "enemy", combatants: [] },
      { id: 20, label: "TRESPASSER.Phase.Late", css: "late", combatants: [] },
      { id: 10, label: "TRESPASSER.Phase.Extra", css: "extra", combatants: [] },
      { id: 0,  label: "TRESPASSER.Phase.End", css: "end", combatants: [] }
    ];

    const turns = data.turns ?? [];
    for (const turn of turns) {
      const combatant = combat.combatants.get(turn.id);
      if (!combatant) continue;
      
      const phaseId = turn.initiative ?? 0;
      const phase = phases.find(p => p.id === phaseId);
      
      if (phase) {
        turn.focus      = combatant.actor?.system.combat?.focus ?? 0;
        turn.ap         = combatant.getFlag("trespasser", "actionPoints") ?? 3;
        
        // Prepare AP dots for rendering
        const maxApCount = Math.max(3, turn.ap);
        turn.apDots = Array.from({ length: maxApCount }, (_, i) => ({
            active: i < turn.ap
        }));

        turn.isActive   = (phaseId === activePhase) && (turn.ap > 0) && !turn.defeated;
        turn.isFinished = turn.ap <= 0 || turn.defeated;
        phase.combatants.push(turn);
      }
    }

    data.phases     = phases.filter(p => p.combatants.length > 0);
    data.combatInfo = combatInfo;
    data.activePhase = activePhase;
    data.isGM       = game.user.isGM;

    return data;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".ap-icon.active").click(this._onActionPointClick.bind(this));
    html.find(".next-phase-btn").click(ev => {
      ev.preventDefault();
      game.combat?.nextPhase();
    });
    html.find(".finish-turn-btn").click(this._onFinishTurnClick.bind(this));
  }

  /** @override (ApplicationV2-style) */
  _onRender(context, options) {
    if (super._onRender) super._onRender(context, options);
    const html = this.element;
    if (!html) return;
    html.querySelectorAll(".ap-icon.active").forEach(el => {
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        this._onActionPointClickEl(el);
      });
    });
    html.querySelectorAll(".next-phase-btn").forEach(el => {
      el.addEventListener("click", ev => {
        ev.preventDefault();
        game.combat?.nextPhase();
      });
    });
  }

  async _onActionPointClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    this._onActionPointClickEl(ev.currentTarget);
  }

  async _onActionPointClickEl(el) {
    const li = el.closest(".combatant");
    const combatant = game.combat?.combatants.get(li?.dataset.combatantId);
    if (!combatant || !combatant.testUserPermission(game.user, "OWNER")) return;

    const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
    const newAP = Math.max(0, currentAP - 1);
    await combatant.setFlag("trespasser", "actionPoints", newAP);
  }

  async _onFinishTurnClick(ev) {
    ev.preventDefault();
    const li = ev.currentTarget.closest(".combatant");
    const combatant = game.combat?.combatants.get(li?.dataset.combatantId);
    if (!combatant || !combatant.testUserPermission(game.user, "OWNER")) return;
    await combatant.setFlag("trespasser", "actionPoints", 0);
  }
}
