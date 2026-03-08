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
 * @param {Actor} dungeon - The dungeon actor
 * @returns {Promise<{encountered: boolean, result: Object|null}>}
 */
export async function resolveEndOfRound(dungeon) {
  const system = dungeon.system;
  const alarm = system.alarm ?? 0;

  // Roll d10 vs alarm
  const encounterRoll = await new Roll("1d10").evaluate();
  const encountered = encounterRoll.total <= alarm;

  // Build the encounter check chat card
  let checkContent = `<div class="trespasser-encounter-check">`;
  checkContent += `<strong>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Check")}</strong>`;
  checkContent += `<div class="encounter-roll-result">`;
  checkContent += `<span class="encounter-die">d10: ${encounterRoll.total}</span>`;
  checkContent += ` vs `;
  checkContent += `<span class="encounter-alarm">${game.i18n.localize("TRESPASSER.Dungeon.Alarm")}: ${alarm}</span>`;
  checkContent += `</div>`;

  if (encountered) {
    checkContent += `<div class="encounter-triggered">${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Triggered")}</div>`;
  } else {
    checkContent += `<div class="encounter-clear">${game.i18n.localize("TRESPASSER.Dungeon.Encounter.NoEncounter")}</div>`;
  }
  checkContent += `</div>`;

  // Post the encounter check result
  await ChatMessage.create({
    content: checkContent,
    speaker: ChatMessage.getSpeaker({ alias: dungeon.name }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });

  if (!encountered) {
    return { encountered: false, result: null };
  }

  // --- Encounter triggered! ---

  // 1. Draw from linked RollTable
  let encounterDescription = game.i18n.localize("TRESPASSER.Dungeon.Encounter.RandomDesc");
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
  const dc = getDungeonDC(dungeon);

  let encounterContent = `<div class="trespasser-encounter-card">`;
  encounterContent += `<h3>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Title")}</h3>`;
  encounterContent += `<div class="encounter-description"><strong>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Label")}:</strong> ${encounterDescription}</div>`;
  encounterContent += `<div class="encounter-reaction"><strong>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Reaction")}:</strong> ${reactionLabel} (2d6: ${reactionTotal})</div>`;
  encounterContent += `<div class="encounter-surprise"><strong>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Surprise")}:</strong> ${game.i18n.format("TRESPASSER.Dialog.SkillCheckTitle", {skill: "AGILITY | STEALTH"})} vs ${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</div>`;

  // Distance suggestion
  encounterContent += `<div class="encounter-distance"><strong>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Distance")}:</strong> ${game.i18n.localize("TRESPASSER.Dungeon.Encounter.DistanceRollHint")}</div>`;

  // Available approaches
  encounterContent += `<div class="encounter-approaches">`;
  encounterContent += `<strong>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.Approach")}:</strong>`;
  encounterContent += `<div class="approach-options">`;
  for (const approach of validApproaches) {
    encounterContent += `<span class="approach-option"><i class="${approach.icon}"></i> ${approach.label}</span>`;
  }
  encounterContent += `</div></div>`;

  encounterContent += `</div>`;

  // Post encounter card (GM only)
  await ChatMessage.create({
    content: encounterContent,
    speaker: ChatMessage.getSpeaker({ alias: dungeon.name }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });

  // 5. Reset alarm to 0
  await dungeon.update({ "system.alarm": 0 });

  // Post alarm reset notification
  await ChatMessage.create({
    content: `<div class="trespasser-dungeon-action"><em>${game.i18n.localize("TRESPASSER.Dungeon.Encounter.AlarmReset")}</em></div>`,
    speaker: ChatMessage.getSpeaker({ alias: dungeon.name }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });

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
 * Get the hostility DC for this dungeon.
 * @param {Actor} dungeon
 * @returns {number}
 */
function getDungeonDC(dungeon) {
  const tier = dungeon.system.hostilityTier ?? 1;
  return CONFIG.TRESPASSER.dungeon.hostilityTiers[tier]?.dc ?? 10;
}

/**
 * Run a standalone encounter check (e.g., for fleeing the dungeon).
 * Same as end-of-round but doesn't increment alarm first.
 * @param {Actor} dungeon
 * @returns {Promise<{encountered: boolean, result: Object|null}>}
 */
export async function runEncounterCheck(dungeon) {
  return resolveEndOfRound(dungeon);
}
