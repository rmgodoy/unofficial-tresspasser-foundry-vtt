/**
 * Encounter Resolution for Trespasser RPG
 *
 * End-of-round automation:
 *   1. Increment alarm
 *   2. Roll d10 vs alarm — if encounter triggered:
 *      a. Draw from linked RollTable to determine encounter
 *      b. Roll 2d6 reaction (hostile/wary/curious/friendly)
 *      c. Post surprise check prompt
 *      d. Present approach options
 *      e. Post results as chat cards
 *      f. Reset alarm to 0
 *   3. If no encounter, log the round and continue
 */

/**
 * Run the full end-of-round encounter check sequence.
 * Works for both dungeon (d10 vs alarm) and travel (d10 vs hostility tier) contexts.
 *
 * @param {Actor} actor - The dungeon or region actor
 * @param {Object} [options={}]
 * @param {string} [options.context="dungeon"] - "dungeon" or "travel"
 * @param {number} [options.checkTarget] - Override: the value to roll against.
 *        Defaults to actor.system.alarm for dungeons, or the hostility tier number for travel.
 * @param {string} [options.checkLabel] - Override: label for the check target in the chat card.
 * @returns {Promise<{encountered: boolean, result: Object|null}>}
 */
export async function resolveEndOfRound(actor, options = {}) {
  const system = actor.system;
  const context = options.context ?? "dungeon";

  let encountered = false;

  if (options.forceEncounter) {
    encountered = true;
  } else {
    let checkTarget;
    let checkLabel;

    if (context === "travel") {
      // Travel: d10 vs hostility tier number
      checkTarget = options.checkTarget ?? (system.hostilityTier ?? 1);
      const tierConfig = CONFIG.TRESPASSER.dungeon.hostilityTiers[checkTarget];
      checkLabel = options.checkLabel ?? `${game.i18n.localize("TRESPASSER.Dungeon.Hostility")}: ${game.i18n.localize(tierConfig?.label ?? "")}`;
    } else {
      // Dungeon: d10 vs alarm
      checkTarget = options.checkTarget ?? (system.alarm ?? 0);
      checkLabel = options.checkLabel ?? `${game.i18n.localize("TRESPASSER.Dungeon.Alarm")}: ${checkTarget}`;
    }

    // Roll d10 vs checkTarget
    const encounterRoll = await new Roll("1d10").evaluate();
    encountered = encounterRoll.total <= checkTarget;

    // Build the encounter check chat card
    let checkContent = `<div class="trespasser-encounter-check">`;
    checkContent += `<strong>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Check")}</strong>`;
    checkContent += `<div class="encounter-roll-result">`;
    checkContent += `<span class="encounter-die">d10: ${encounterRoll.total}</span>`;
    checkContent += ` vs `;
    checkContent += `<span class="encounter-alarm">${checkLabel}</span>`;
    checkContent += `</div>`;

    if (encountered) {
      checkContent += `<div class="encounter-triggered">${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Triggered")}</div>`;
    } else {
      const clearKey = context === "travel" ? "TRESPASSER.Chat.Travel.NoEncounter" : "TRESPASSER.Chat.Dungeon.Encounter.NoEncounter";
      checkContent += `<div class="encounter-clear">${game.i18n.localize(clearKey)}</div>`;
    }
    checkContent += `</div>`;

    // Post the encounter check result
    await ChatMessage.create({
      content: checkContent,
      speaker: ChatMessage.getSpeaker({ alias: actor.name }),
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });
  }

  if (!encountered) {
    return { encountered: false, result: null };
  }

  // --- Encounter triggered! ---

  // 1. Draw from linked RollTable
  let encounterDescription = game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.RandomDesc");
  const tableId = system.encounterTableId;
  if (tableId) {
    const table = game.tables.get(tableId);
    if (table) {
      const draw = await table.draw({ displayChat: false });
      if (draw.results.length > 0) {
        encounterDescription = draw.results.map(r => r.getChatText()).join(", ");
      }
    }
  }

  // 2. Roll 2d6 reaction
  const reactionRoll = await new Roll("2d6").evaluate();
  const reactionTotal = reactionRoll.total;
  const reaction = resolveReaction(reactionTotal);
  const reactionLabel = game.i18n.localize(reaction.label);

  // 3. Determine valid approaches based on reaction
  const approachConfig = CONFIG.TRESPASSER.dungeon.approaches;
  const validApproaches = reaction.approaches.map(key => ({
    key,
    label: game.i18n.localize(approachConfig[key]?.label ?? key),
    description: game.i18n.localize(approachConfig[key]?.description ?? ""),
    icon: approachConfig[key]?.icon ?? "fa-solid fa-question"
  }));

  // 4. Build the full encounter card
  const dc = getHostilityDC(actor);

  let encounterContent = `<div class="trespasser-encounter-card">`;
  encounterContent += `<h3>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Title")}</h3>`;
  encounterContent += `<div class="encounter-description"><strong>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Label")}:</strong> ${encounterDescription}</div>`;
  encounterContent += `<div class="encounter-reaction"><strong>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Reaction")}:</strong> ${reactionLabel} (2d6: ${reactionTotal})</div>`;
  encounterContent += `<div class="encounter-surprise"><strong>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Surprise")}:</strong> ${game.i18n.format("TRESPASSER.Dialog.SkillCheckTitle", {skill: "AGILITY | STEALTH"})} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</div>`;

  // Distance suggestion
  encounterContent += `<div class="encounter-distance"><strong>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Distance")}</strong> ${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.DistanceRollHint")}</div>`;

  // Available approaches
  encounterContent += `<div class="encounter-approaches">`;
  encounterContent += `<strong>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.Approach")}:</strong>`;
  encounterContent += `<div class="approach-options">`;
  for (const approach of validApproaches) {
    encounterContent += `<span class="approach-option"><i class="${approach.icon}"></i> ${approach.label}</span>`;
  }
  encounterContent += `</div></div>`;

  encounterContent += `</div>`;

  // Post encounter card (GM only)
  await ChatMessage.create({
    content: encounterContent,
    speaker: ChatMessage.getSpeaker({ alias: actor.name }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });

  // 5. Reset alarm (Dungeon context only)
  if (context === "dungeon") {
    await actor.update({ "system.alarm": 0 });

    // Post alarm reset notification
    await ChatMessage.create({
      content: `<div class="trespasser-dungeon-action"><em>${game.i18n.localize("TRESPASSER.Chat.Dungeon.Encounter.AlarmReset")}</em></div>`,
      speaker: ChatMessage.getSpeaker({ alias: actor.name }),
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });
  }

  return {
    encountered: true,
    result: {
      description: encounterDescription,
      reaction: reaction,
      reactionRoll: reactionTotal,
      dc
    }
  };
}

/* -------------------------------------------- */
/* Reaction Resolution                          */
/* -------------------------------------------- */

/**
 * Resolve the reaction table result from a 2d6 roll.
 * @param {number} total - The 2d6 total
 * @returns {Object} The matching reaction entry from config
 */
function resolveReaction(total) {
  const table = CONFIG.TRESPASSER.dungeon.reactionTable;
  for (const [key, entry] of Object.entries(table)) {
    const [min, max] = entry.range;
    if (total >= min && total <= max) {
      return { key, ...entry };
    }
  }
  // Fallback to hostile
  return { key: "hostile", ...table.hostile };
}

/* -------------------------------------------- */
/* Utility                                      */
/* -------------------------------------------- */

/**
 * Get the hostility DC for this actor.
 * @param {Actor} actor
 * @returns {number}
 */
function getHostilityDC(actor) {
  const tier = actor.system.hostilityTier ?? 1;
  return CONFIG.TRESPASSER.dungeon.hostilityTiers[tier]?.dc ?? 10;
}

/**
 * Run a standalone encounter check.
 * @param {Actor} actor - The dungeon or region actor
 * @param {Object} [options={}] - Same options as resolveEndOfRound
 */
export async function runEncounterCheck(actor, options = {}) {
  return resolveEndOfRound(actor, options);
}

/**
 * Run a hostility check for travel (d10 vs hostility tier).
 * @param {Actor} region - The region actor
 * @returns {Promise<{encountered: boolean, result: Object|null}>}
 */
export async function runTravelHostilityCheck(region) {
  return resolveEndOfRound(region, { context: "travel" });
}
