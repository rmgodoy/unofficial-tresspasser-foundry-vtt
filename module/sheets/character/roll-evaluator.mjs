/**
 * roll-evaluator.mjs
 * Evaluation and chat card rendering for non-combat checks and combat stat checks.
 */

/**
 * Evaluates a roll against CD and displays the chat card with sparks, shadows, and fate options.
 * @param {Roll} roll
 * @param {string} flavor
 * @param {number} cd
 * @param {object} sheet
 * @param {object} [options={}]
 * @returns {Promise<Roll>}
 */
export async function evaluateAndShowRoll(roll, flavor, cd, sheet, options = {}) {
  await roll.evaluate();
  const total = roll.total;
  let diff  = total - cd;
  let sparks = 0, shadows = 0;

  const dieResult = roll.dice[0]?.results[0]?.result;
  const isNatural20 = dieResult === 20;
  const isNatural1 = dieResult === 1;

  if (options.isNonCombat) {
    // Determine sparks and shadows count
    if (isNatural20) {
      diff = Math.max(0, diff);
      sparks = Math.floor(diff / 5) + 1;
      shadows = 0;
    } else {
      if (diff >= 0) {
        sparks = Math.floor(diff / 5);
        shadows = 0;
      } else {
        sparks = 0;
        shadows = Math.floor(Math.abs(diff) / 5);
        if (isNatural1) shadows += 1;
      }
    }

    // Cap at 5 unique sparks/shadows
    sparks = Math.min(5, sparks);
    shadows = Math.min(5, shadows);

    // Plight shadows in Dungeon Frame (non-group checks only)
    const plightShadows = [];
    const hasActiveDungeon = game.actors.some(a => a.type === "dungeon" && a.system.sessionState === "active");
    const isGroupCheck = options.isGroupCheck || sheet.actor?.type === "party";
    if (hasActiveDungeon && !isGroupCheck) {
      if (sheet.actor?.system?.hasPlight?.("clumsy")) {
        plightShadows.push("costly");
      }
      if (sheet.actor?.system?.hasPlight?.("conspicuous")) {
        plightShadows.push("loud");
      }
    }

    const messageData = buildRollMessageFlavor(flavor, cd, diff, sheet, options, {
      sparks, shadows, chosenSparks: [], chosenShadows: [], plightShadows
    });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      flavor: messageData.flavorHtml,
      flags: {
        trespasser: messageData.flags
      }
    });

    return roll;
  } else {
    // Combat / other rolls fallback
    if (diff >= 0) sparks  = Math.floor(diff / 5);
    else           shadows = Math.floor(Math.abs(diff) / 5);

    if (dieResult === 20) sparks  += 1;
    if (dieResult === 1)  shadows += 1;

    const isSuccess = diff >= 0;
    const outcomeLabel = isSuccess
      ? (game.i18n.localize("TRESPASSER.Chat.Common.Success") || "SUCESSO")
      : (game.i18n.localize("TRESPASSER.Chat.Common.Failure") || "FALHA");
    const outcomeColor = isSuccess ? "var(--trp-green-bright, #4fc3f7)" : "var(--trp-red, #ff5252)";
    const outcomeClass = isSuccess ? "hit-text" : "miss-text";

    const metrics = `
      <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
        <div class="metric spark"  style="color:var(--trp-spark);"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</div>
        <div class="metric shadow" style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
      </div>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
      flavor: `${flavor}
        <div style="display:flex; justify-content:space-between; align-items:center; margin: 4px 0;">
          <span>${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd })}</span>
          <span class="${outcomeClass}" style="font-weight:bold; color:${outcomeColor}; font-size:var(--fs-12);">${outcomeLabel}</span>
        </div>
        ${metrics}`
    });

    return roll;
  }
}

/**
 * Builds HTML and flags for non-combat roll chat messages.
 * @param {string} baseFlavor
 * @param {number} cd
 * @param {number} diff
 * @param {object} sheet
 * @param {object} options
 * @param {object} metricsData
 * @returns {{ flavorHtml: string, flags: object }}
 */
export function buildRollMessageFlavor(baseFlavor, cd, diff, sheet, options, metricsData) {
  const { sparks, shadows, chosenSparks, chosenShadows, plightShadows } = metricsData;
  const allShadows = [...chosenShadows, ...plightShadows];

  let metrics = `<div class="non-combat-roll-details">`;
  
  if (options.isTemptFate && options.temptShadow) {
    metrics += `
      <div class="tempt-fate-shadow-results" style="margin-bottom: 5px;">
        <strong>${game.i18n.localize("TRESPASSER.Chat.Check.TemptFateShadow")}</strong>
        <ul>
          <li><span style="color:var(--trp-shadow); font-weight:bold;"><i class="fas fa-moon"></i> ${game.i18n.localize("TRESPASSER.Dialog.NonCombat.Shadow" + options.temptShadow.capitalize() + "Label").toUpperCase()}</span></li>
        </ul>
      </div>`;
  }

  // Always show spark/shadow counts
  if (sparks > 0 || shadows > 0) {
    metrics += `
      <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
        <div class="metric spark"  style="color:var(--trp-spark);"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks",  { count: sparks  })}</div>
        <div class="metric shadow" style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: shadows })}</div>
      </div>`;
  }

  // Show chosen sparks if already selected
  if (chosenSparks.length > 0) {
    metrics += `<div class="spark-results"><strong>${game.i18n.localize("TRESPASSER.Chat.Combat.SparksLabel")}</strong><ul>`;
    for (const spark of chosenSparks) {
      metrics += `<li><span style="color:var(--trp-spark);"><i class="fas fa-sun"></i> ${game.i18n.localize("TRESPASSER.Dialog.NonCombat.Spark" + spark.capitalize() + "Label")}</span></li>`;
    }
    metrics += `</ul></div>`;
  } else if (sparks > 0) {
    // Show distribute sparks button
    metrics += `
      <button type="button" class="distribute-sparks-btn" data-spark-count="${sparks}" data-actor-id="${sheet.actor?.id ?? ""}" style="width:100%;cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;font-weight:bold;padding:6px;background:var(--trp-bg-panel);border:1px solid var(--trp-spark);color:var(--trp-spark);margin-bottom:4px;">
        <i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.DistributeSparks", { count: sparks })}
      </button>`;
  }

  // Show chosen shadows if already selected
  if (allShadows.length > 0) {
    metrics += `<div class="shadow-results"><strong>${game.i18n.localize("TRESPASSER.Chat.Combat.ShadowsLabel")}</strong><ul>`;
    for (const shadow of allShadows) {
      metrics += `<li><span style="color:var(--trp-shadow);"><i class="fas fa-moon"></i> ${game.i18n.localize("TRESPASSER.Dialog.NonCombat.Shadow" + shadow.capitalize() + "Label")}</span></li>`;
    }
    metrics += `</ul></div>`;
  } else if (shadows > 0) {
    // Show distribute shadows button (GM only, hidden via renderChatMessageHTML hook)
    metrics += `
      <button type="button" class="distribute-shadows-btn" data-shadow-count="${shadows}" style="width:100%;cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;font-weight:bold;padding:6px;background:var(--trp-bg-panel);border:1px solid var(--trp-shadow);color:var(--trp-shadow);margin-bottom:4px;">
        <i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.DistributeShadows", { count: shadows })}
      </button>`;
  }

  metrics += `</div>`;

  // Append Tempt Fate button if failed skill check, and not already a Tempt Fate reroll
  let temptFateButton = "";
  const isDiscouraged = sheet.actor?.system?.hasPlight?.("discouraged");
  if (options.skillKey && diff < 0 && !options.isTemptFate && !isDiscouraged) {
    temptFateButton = `
      <div class="tempt-fate-container" style="margin-top:8px;">
        <button type="button" class="tempt-fate-btn" data-skill-key="${options.skillKey}" data-actor-id="${sheet.actor.id}" data-cd="${cd}" style="width:100%;cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;font-weight:bold;padding:6px;background:var(--trp-gold);color:var(--trp-bg-dark);border:none;border-radius:4px;">
          <i class="fas fa-dice"></i> ${game.i18n.localize("TRESPASSER.Dialog.TemptFate.Tempt")}
        </button>
      </div>`;
  }

  let finalFlavor = baseFlavor;
  if (options.isTemptFate) {
    finalFlavor = `<div class="tempt-fate-header" style="border-bottom:1px solid var(--trp-border);margin-bottom:6px;padding-bottom:4px;"><strong style="font-family:var(--trp-font-header);color:var(--trp-gold-bright);text-transform:uppercase;font-size:var(--fs-12);"><i class="fas fa-dice"></i> ${game.i18n.format("TRESPASSER.Chat.Check.TemptFateHeader", { name: sheet.actor.name })}</strong></div>${baseFlavor}`;
  }

  const isSuccess = diff >= 0;
  const outcomeLabel = isSuccess
    ? (game.i18n.localize("TRESPASSER.Chat.Common.Success") || "SUCESSO")
    : (game.i18n.localize("TRESPASSER.Chat.Common.Failure") || "FALHA");
  const outcomeColor = isSuccess ? "var(--trp-green-bright, #4fc3f7)" : "var(--trp-red, #ff5252)";
  const outcomeClass = isSuccess ? "hit-text" : "miss-text";

  const outcomeHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin: 4px 0;">
      <span>${game.i18n.format("TRESPASSER.Chat.Check.VsCD", { cd })}</span>
      <span class="${outcomeClass}" style="font-weight:bold; color:${outcomeColor}; font-size:var(--fs-12);">${outcomeLabel}</span>
    </div>`;

  const flavorHtml = `${finalFlavor}${outcomeHtml}${metrics}${temptFateButton}`;
  const flags = {
    isNonCombatRoll: true,
    isTemptFate: !!options.isTemptFate,
    temptShadow: options.temptShadow || null,
    skillKey: options.skillKey || null,
    actorId: sheet.actor?.id,
    cd: cd,
    sparksCount: sparks,
    shadowsCount: shadows,
    chosenSparks,
    chosenShadows: allShadows,
    plightShadows
  };

  return { flavorHtml, flags };
}
