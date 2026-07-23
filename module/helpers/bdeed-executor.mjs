/**
 * BDeedExecutor — Runtime pipeline executor for Behavior-Driven Deeds (BDeed) in Trespasser TTRPG.
 *
 * Handles sequential execution across 7 phases:
 *   Start → Before → Base → [Hit] → [Spark] → After → End
 */
export class BDeedExecutor {
  /**
   * @param {Item} bdeedItem - The BDeed Item document.
   * @param {Actor} [actor]  - The owning Actor document.
   */
  constructor(bdeedItem, actor) {
    this.item = bdeedItem;
    this.actor = actor || bdeedItem.actor;
    this.system = bdeedItem.system;

    /**
     * Shared runtime context passed across all phases.
     */
    this.context = {
      targets: [],
      spawnedTerrains: [],
      activePhases: [],
      modifications: [],
      rollResult: null,
      isHit: false,
      isSpark: false
    };
  }

  /**
   * Execute the full BDeed pipeline sequentially.
   */
  async execute() {
    // Deep clone phase data so mutations don't alter the database document
    this.phases = foundry.utils.deepClone(this.system.phases ?? {});

    // Step 1: Scan and collect all "modifyBehavior" instances across all phases
    this._collectModifications();

    // Step 2: Resolve modifications against target behaviors in memory
    this._applyModifications();

    // Step 3: Sequential phase processing
    const phaseOrder = ["start", "before", "base", "hit", "spark", "after", "end"];
    for (const phaseKey of phaseOrder) {
      if (this._shouldSkipPhase(phaseKey)) continue;
      this.context.activePhases.push(phaseKey);
      await this._executePhase(phaseKey);
    }
  }

  /**
   * Collect all "modifyBehavior" behaviors from all phases into context.modifications
   * and remove them from their parent phase's behavior list.
   * @protected
   */
  _collectModifications() {
    const phaseOrder = ["start", "before", "base", "hit", "spark", "after", "end"];
    for (const phaseKey of phaseOrder) {
      const phase = this.phases[phaseKey];
      if (!phase || !phase.behaviors) continue;

      const remainingBehaviors = [];
      for (const behavior of phase.behaviors) {
        if (behavior.type === "modifyBehavior") {
          this.context.modifications.push({
            sourcePhase: phaseKey,
            id: behavior.id,
            params: behavior.params ?? {}
          });
        } else {
          remainingBehaviors.push(behavior);
        }
      }
      phase.behaviors = remainingBehaviors;
    }
  }

  /**
   * Apply collected modifications to target behaviors across phases in memory.
   * @protected
   */
  _applyModifications() {
    for (const mod of this.context.modifications) {
      const { targetPhase, targetBehaviorId, property, modifier } = mod.params;
      if (!targetBehaviorId || !modifier) continue;

      // Find target behavior
      const targetBehavior = this._findBehavior(targetBehaviorId, targetPhase);
      if (!targetBehavior) continue;

      targetBehavior.params = targetBehavior.params || {};

      switch (property) {
        case "damage": {
          const currentExpr = targetBehavior.params.expression ?? "";
          targetBehavior.params.expression = currentExpr
            ? `${currentExpr} + ${modifier}`
            : modifier;
          break;
        }
        case "intensity": {
          if (Array.isArray(targetBehavior.params.effects)) {
            const num = parseFloat(modifier) || 0;
            for (const eff of targetBehavior.params.effects) {
              eff.intensity = (eff.intensity || 1) + num;
            }
          } else {
            const currentInt = parseFloat(targetBehavior.params.intensity) || 1;
            const num = parseFloat(modifier) || 0;
            targetBehavior.params.intensity = currentInt + num;
          }
          break;
        }
        case "size": {
          const currentSize = parseFloat(targetBehavior.params.aoeSize) || 1;
          const num = parseFloat(modifier) || 0;
          targetBehavior.params.aoeSize = Math.max(1, currentSize + num);
          break;
        }
        case "distance": {
          const currentDist = parseFloat(targetBehavior.params.distance) || 1;
          const num = parseFloat(modifier) || 0;
          targetBehavior.params.distance = Math.max(0, currentDist + num);
          break;
        }
      }
    }
  }

  /**
   * Search for a behavior by ID across all phases or within a specific target phase.
   * @param {string} behaviorId
   * @param {string} [targetPhaseKey]
   * @returns {object|null}
   * @protected
   */
  _findBehavior(behaviorId, targetPhaseKey) {
    const phasesToSearch = targetPhaseKey && this.phases[targetPhaseKey]
      ? [targetPhaseKey]
      : ["start", "before", "base", "hit", "spark", "after", "end"];

    for (const pKey of phasesToSearch) {
      const phase = this.phases[pKey];
      if (!phase || !phase.behaviors) continue;
      const found = phase.behaviors.find(b => b.id === behaviorId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Determine if a phase should be skipped during pipeline execution.
   * @param {string} phaseKey
   * @returns {boolean}
   * @protected
   */
  _shouldSkipPhase(phaseKey) {
    if (phaseKey === "hit" && !this.context.isHit) return true;
    if (phaseKey === "spark" && !this.context.isSpark) return true;

    const phase = this.phases[phaseKey];
    if (!phase) return true;

    const hasDesc = Boolean(phase.description && phase.description.trim());
    const hasBehaviors = Boolean(phase.behaviors && phase.behaviors.length > 0);

    // Skip empty phases (no description AND no behaviors)
    if (!hasDesc && !hasBehaviors) return true;

    return false;
  }

  /**
   * Execute a single phase.
   * @param {string} phaseKey
   * @protected
   */
  async _executePhase(phaseKey) {
    const phase = this.phases[phaseKey];

    // Base phase triggers accuracy check
    if (phaseKey === "base") {
      await this._resolveAccuracyCheck();
    }

    // Execute each behavior in order
    for (const behavior of phase.behaviors || []) {
      await this._executeBehavior(behavior, phaseKey);
    }

    // Post dedicated chat card for this active phase
    await this._postPhaseCard(phaseKey, phase);
  }

  /**
   * Perform Base phase accuracy check.
   * @protected
   */
  async _resolveAccuracyCheck() {
    const versus = this.system.versus ?? "Guard";
    let dc = 10;

    // Resolve DC from selected targets if versus Guard/Resist
    const targets = Array.from(game.user.targets);
    if (targets.length > 0) {
      const targetActor = targets[0].actor;
      if (targetActor) {
        if (versus === "Guard") {
          dc = targetActor.system.guard ?? 10;
        } else if (versus === "Resist") {
          dc = targetActor.system.resist ?? 10;
        }
      }
    }

    const roll = new Roll("1d20");
    await roll.evaluate();

    const total = roll.total;
    const isHit = total >= dc;
    const isSpark = roll.dice[0]?.results[0]?.result === 20 || total >= dc + 5;

    this.context.rollResult = roll;
    this.context.isHit = isHit;
    this.context.isSpark = isSpark;
    this.context.dc = dc;
  }

  /**
   * Execute an individual behavior (stub for Task 6 — full dispatch in Task 7).
   * @param {object} behavior
   * @param {string} phaseKey
   * @protected
   */
  async _executeBehavior(behavior, phaseKey) {
    console.log(`[BDeedExecutor] Phase "${phaseKey}" — Executing behavior "${behavior.type}" (${behavior.id}):`, behavior.params);
  }

  /**
   * Post a dedicated chat card for an active phase.
   * @param {string} phaseKey
   * @param {object} phase
   * @protected
   */
  async _postPhaseCard(phaseKey, phase) {
    const phaseLabel = game.i18n.localize(`TRESPASSER.Sheet.BDeed.Phase.${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}`);
    let content = `<div class="bdeed-phase-card" style="border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px; padding: 10px; background: var(--trp-bg-panel, #23201c); color: var(--trp-text, #ddd0aa);">
      <h3 style="margin: 0 0 6px 0; color: var(--trp-gold-bright, #e8c96b); font-family: var(--trp-font-header, 'Cinzel', serif); font-size: 14px; border-bottom: 1px solid var(--trp-gold-dim, #a88840); padding-bottom: 4px;">
        ${this.item.name} — ${phaseLabel}
      </h3>`;

    if (phase.description) {
      content += `<p style="margin: 6px 0; font-size: 13px; font-style: italic;">${phase.description}</p>`;
    }

    if (phaseKey === "base" && this.context.rollResult) {
      content += `<div class="roll-result-box" style="margin-top: 8px; padding: 6px 8px; background: var(--trp-bg-dark, #1a1714); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 3px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
        <span><strong>${game.i18n.localize("TRESPASSER.Sheet.Combat.Accuracy") || "Accuracy"}:</strong> ${this.context.rollResult.total} (vs ${this.system.versus} ${this.context.dc})</span>
        <span>
          ${this.context.isHit ? "<strong style='color: #4fc3f7;'>HIT</strong>" : "<strong style='color: #ff5252;'>MISS</strong>"}
          ${this.context.isSpark ? " <strong style='color: #e8c96b;'>✨ SPARK!</strong>" : ""}
        </span>
      </div>`;
    }

    content += `</div>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      flags: { trespasser: { bdeedId: this.item.id, phase: phaseKey } }
    });
  }
}
