import {
  getPhaseCombatant,
  recordHUDAction,
  removeHUDAction,
  getFirstNonEmptyPhase,
  startCombatFlow,
  nextRoundFlow,
  nextPhaseFlow,
  checkEmptyPhaseAdvanceFlow,
  onStartOfCombat,
  onStartOfRound,
  onEndOfRound,
  onStartOfTurn,
  onEndOfTurn
} from "../combat/combat-phases.mjs";

import {
  createExtraCombatant,
  postPerilToChat,
  rollAllTrespasserInitiatives,
  rollPlayerInitiative,
  processInitiativeResult,
  checkAllInitiativesRolled,
  attemptRetreat,
  evaluateRetreat
} from "../combat/combat-initiative.mjs";

import {
  updateCombatTurnMarkers,
  updateTokenTurnMarker,
  getTurnMarkerTexture
} from "../combat/combat-markers.mjs";

/**
 * Custom Combat class for Trespasser TTRPG.
 */
export class TrespasserCombat extends Combat {

  /**
   * Phase constants for Trespasser.
   */
  static PHASES = {
    EARLY: 40,
    ENEMY: 30,
    LATE:  20,
    EXTRA: 10,
    END:    0 
  };

  /**
   * Mapping of phase values to localized labels.
   */
  static PHASE_LABELS = {
    [TrespasserCombat.PHASES.EARLY]: "TRESPASSER.Terms.Combat.Phase.Early",
    [TrespasserCombat.PHASES.ENEMY]: "TRESPASSER.Terms.Combat.Phase.Enemy",
    [TrespasserCombat.PHASES.LATE]:  "TRESPASSER.Terms.Combat.Phase.Late",
    [TrespasserCombat.PHASES.EXTRA]: "TRESPASSER.Terms.Combat.Phase.Extra",
    [TrespasserCombat.PHASES.END]:   "TRESPASSER.Terms.Combat.Phase.End"
  };

  static getPhaseCombatant(target, combat = game.combat) {
    return getPhaseCombatant(target, combat);
  }

  static async recordHUDAction(actorOrId, actionId, combat = game.combat) {
    return recordHUDAction(actorOrId, actionId, combat);
  }

  static async removeHUDAction(actorOrId, actionId, combat = game.combat) {
    return removeHUDAction(actorOrId, actionId, combat);
  }

  /** @override */
  async startCombat() {
    await startCombatFlow(this);
    return super.startCombat();
  }

  /** @override */
  async nextRound() {
    await nextRoundFlow(this);
    if (!game.combats.has(this.id)) return this;
    return super.nextRound();
  }

  _firstNonEmptyPhase() {
    return getFirstNonEmptyPhase(this);
  }

  async nextPhase() {
    return nextPhaseFlow(this);
  }

  async checkEmptyPhaseAdvance() {
    return checkEmptyPhaseAdvanceFlow(this);
  }

  async _onStartOfCombat() {
    return onStartOfCombat(this);
  }

  async _onStartOfRound() {
    return onStartOfRound(this);
  }

  async _onEndOfRound() {
    return onEndOfRound(this);
  }

  async _onStartOfTurn(phase) {
    return onStartOfTurn(this, phase);
  }

  async _onEndOfTurn(phase) {
    return onEndOfTurn(this, phase);
  }

  /** @deprecated Token highlighting removed by user request. */
  setupTokenHighlight() {}

  async rollPlayerInitiative(combatantId) {
    return rollPlayerInitiative(this, combatantId);
  }

  async _processInitiativeResult(combatantId, total, isNat20) {
    return processInitiativeResult(this, combatantId, total, isNat20);
  }

  async _checkAllInitiativesRolled() {
    return checkAllInitiativesRolled(this);
  }

  async _postPerilToChat(combatInfo) {
    return postPerilToChat(this, combatInfo);
  }

  async _attemptRetreat(enemyMaxInit) {
    return attemptRetreat(this, enemyMaxInit);
  }

  async _evaluateRetreat() {
    return evaluateRetreat(this);
  }

  async rollAllTrespasserInitiatives() {
    return rollAllTrespasserInitiatives(this);
  }

  createExtraCombatant(baseCombatant, initiative) {
    return createExtraCombatant(baseCombatant, initiative);
  }

  async updateTurnMarkers(activePhase) {
    return updateCombatTurnMarkers(this, activePhase);
  }

  _updateTokenMarker(token, active, phase) {
    return updateTokenTurnMarker(token, active, phase);
  }

  _getMarkerTexture(phase) {
    return getTurnMarkerTexture(phase);
  }
}