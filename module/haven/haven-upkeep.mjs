import { handleRestAction } from "../sheets/character/handlers-rest.mjs";
import { processHirelingProduction } from "./haven-production.mjs";

/**
 * Step 1: Week's Rest.
 * Automatically applies rest benefits to characters whose owners also own this Haven.
 * @param {TrespasserHavenData} data
 */
export async function weeksRest(data) {
  const actor = data.parent;
  const havenOwnership = actor.ownership;
  
  const havenOwners = Object.entries(havenOwnership)
    .filter(([id, level]) => id !== "default" && level === 3)
    .map(([id]) => id);

  const characters = game.actors.filter(a => a.type === "character");
  const affected = characters.filter(char => {
    return havenOwners.some(uid => char.ownership[uid] === 3);
  });

  const results = [];
  for (const char of affected) {
    await handleRestAction("week", {}, char, { chat: false });
    results.push(char.name);
  }

  await ChatMessage.create({
    content: `<div class="trespasser-chat-card haven-report">
      <h3>${game.i18n.localize("TRESPASSER.Terms.HavenUpkeepWeeksRest")}</h3>
      <p>${game.i18n.localize("TRESPASSER.Chat.Haven.WeeksRestFlavor")}</p>
      <p><strong>${game.i18n.localize("TRESPASSER.Terms.CharactersRested")}:</strong> ${results.length ? results.join(", ") : game.i18n.localize("TRESPASSER.Global.Status.None")}</p>
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor })
  });
}

/**
 * Combined Step 2 & 3: Resolve Hirelings (includes paying expenses).
 * @param {TrespasserHavenData} data
 */
export async function resolveHirelings(data) {
  const actor = data.parent;
  const hirelings = actor.items.filter(i => i.type === "hireling");
  
  const balance = data.weeklyBalance;
  const expenses = data.totalWeeklyExpenses;
  const income = data.totalWeeklyIncome;

  if (data.treasury + balance < 0) {
    ui.notifications.error(game.i18n.format("TRESPASSER.Notification.Haven.InsufficientFunds", { cost: expenses - income, treasury: data.treasury }));
    return false;
  }
  
  const newTreasury = Math.max(0, data.treasury + balance);
  const updates = { "system.treasury": newTreasury };

  const assignedHirelingIds = new Set();
  for (const chain of data.productionChains) {
    if (!chain.active) continue;
    for (const hid of chain.hirelings) assignedHirelingIds.add(hid);
  }

  const messages = [];
  messages.push(`<h3>${game.i18n.localize("TRESPASSER.Terms.HavenUpkeepResolveProduction")}</h3>`);
  messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Terms.HavenWeeklyExpenses")}:</strong> ${expenses}</p>`);
  messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Terms.HavenWeeklyIncome")}:</strong> ${income}</p>`);
  messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Terms.HavenWeeklyBalance")}:</strong> ${balance >= 0 ? "+" : ""}${balance}</p>`);

  let currentInventory = foundry.utils.duplicate(data.inventory);

  for (const chain of data.productionChains) {
    if (!chain.active) continue;
    messages.push(`<h4>${chain.name}</h4>`);
    for (const hid of chain.hirelings) {
      const hireling = actor.items.get(hid);
      if (hireling && hireling.system.active) {
        const { result, newInventory } = await processHirelingProduction(data, hireling, currentInventory);
        messages.push(result);
        currentInventory = newInventory;
      }
    }
  }

  messages.push(`<h4>${game.i18n.localize("TRESPASSER.Terms.HavenUnassignedHirelings")}</h4>`);
  for (const h of hirelings) {
    if (h.system.active && !assignedHirelingIds.has(h.id)) {
      const { result, newInventory } = await processHirelingProduction(data, h, currentInventory);
      messages.push(result);
      currentInventory = newInventory;
    }
  }

  updates["system.inventory"] = currentInventory;
  
  const strongholds = actor.items.filter(i => i.type === "stronghold");
  if (strongholds.length > 0) {
    messages.push(`<h4>${game.i18n.localize("TRESPASSER.Terms.HavenStrongholds")}</h4>`);
    for (const s of strongholds) {
      if (s.system.isCompleted) continue;
      
      const oldProgress = s.system.progress;
      const newProgress = Math.min(s.system.buildClock, oldProgress + 1);
      await s.update({ "system.progress": newProgress });
      
      if (newProgress === s.system.buildClock) {
        messages.push(`<p style="color:var(--trp-green-bright);"><strong>${s.name} ${game.i18n.localize("TRESPASSER.Global.Completed")}!</strong></p>`);
        if (s.system.ownerId) {
          const owner = game.actors.get(s.system.ownerId);
          if (owner && s.system.features?.length > 0) {
            await owner._applyLinkedItems(s.system.features);
            ui.notifications.info(`Stronghold ${s.name} features applied to ${owner.name}.`);
          }
        }
      } else {
        messages.push(`<p>${s.name}: ${game.i18n.localize("TRESPASSER.Global.Progress")} ${newProgress}/${s.system.buildClock}</p>`);
      }
    }
  }

  await actor.update(updates);

  await ChatMessage.create({
    content: `<div class="trespasser-chat-card haven-report">${messages.join("")}</div>`,
    speaker: ChatMessage.getSpeaker({ actor })
  });
}

/**
 * Step 4: Population Check
 * @param {TrespasserHavenData} data
 */
export async function populationCheck(data) {
  const actor = data.parent;
  const state = data.populationState || "growth";
  const messages = [];
  messages.push(`<h3>${game.i18n.localize("TRESPASSER.Terms.HavenUpkeepPopulationCheck")}</h3>`);
  
  const oldRank = data.populationRank || 0;
  let newRank = oldRank;
  const updates = {};
  
  if (state === "growth") {
    const appeal = data.totalAttributes.appeal ?? 0;
    const isHospitality = data.trainedSkills.has("hospitality");
    const bonus = isHospitality ? data.skillBonus : 0;
    const formula = `1d20 + ${appeal} + ${bonus}`;

    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const total = roll.total;
    const diceResult = roll.dice[0].results[0].result;
    const cd = 10;
    const isSuccess = total >= cd;

    let sparks = 0;
    if (isSuccess) {
      const diff = total - cd;
      sparks = Math.floor(diff / 5);
      if (diceResult === 20) sparks += 1;
    }

    let increase = isSuccess ? (1 + sparks) : 0;
    const nextThreshold = (data.level < 9) ? data.populationThresholds[data.level + 1] : Infinity;
    
    if (oldRank >= nextThreshold && increase > 0) {
      messages.push(`<p class="warning" style="color:var(--trp-gold); font-weight:bold; margin-bottom:4px;">${game.i18n.localize("TRESPASSER.Terms.HavenStagnant")}</p>`);
      messages.push(`<p style="font-size:var(--fs-11); font-style:italic;">${game.i18n.localize("TRESPASSER.Chat.Haven.GrowthBlocked")}</p>`);
      increase = 0;
    } else if (oldRank + increase > nextThreshold) {
      increase = nextThreshold - oldRank;
      messages.push(`<p class="warning" style="font-size:var(--fs-11); font-style:italic; color:var(--trp-gold);">${game.i18n.format("TRESPASSER.Chat.Haven.GrowthCapped", { threshold: nextThreshold })}</p>`);
    }
    
    newRank = oldRank + increase;
    updates["system.populationRank"] = newRank;

    if (isSuccess) {
      messages.push(`<p class="success" style="color:var(--trp-green-bright);font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Common.Success")}</p>`);
      if (increase > 0) messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Terms.HavenPopulationIncrease")}:</strong> +${increase} (Rank: ${newRank})</p>`);
      
      if (sparks > 0) {
        messages.push(`<p style="color:var(--trp-spark);"><i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: sparks })}</p>`);
        messages.push(`<p style="color:var(--trp-spark); font-weight:bold;"><i class="fas fa-walking"></i> ${game.i18n.localize("TRESPASSER.Chat.Haven.Arrivals")}</p>`);
        messages.push(`<p style="font-size:var(--fs-11); font-style:italic;">${game.i18n.localize("TRESPASSER.Chat.Haven.ArrivalsInstruction")}</p>`);
      }
    } else {
      messages.push(`<p class="failure" style="color:var(--trp-red);font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Common.Failure")}</p>`);
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="trespasser-chat-card haven-report">${messages.join("")}</div>`
    });
  } else {
    // DECLINE
    const allegiance = data.totalAttributes.allegiance ?? 0;
    const isFaith = data.trainedSkills.has("faith");
    const bonus = isFaith ? data.skillBonus : 0;
    const formula = `1d20 + ${allegiance} + ${bonus}`;

    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const total = roll.total;
    const isSuccess = total >= 20;
    
    if (isSuccess) {
      messages.push(`<p class="success" style="color:var(--trp-green-bright);font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Common.Success")} ${game.i18n.localize("TRESPASSER.Chat.Haven.DeclineHalted")}</p>`);
      messages.push(`<p>${game.i18n.format("TRESPASSER.Chat.Haven.PopulationStable", { rank: oldRank })}</p>`);
    } else {
      messages.push(`<p class="failure" style="color:var(--trp-shadow);font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Common.Failure")} ${game.i18n.localize("TRESPASSER.Chat.Haven.PopulationDecline")}</p>`);
      newRank = Math.max(0, oldRank - 1);
      updates["system.populationRank"] = newRank;
      messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Terms.PopulationRank")}:</strong> -1 ${game.i18n.format("TRESPASSER.Chat.Haven.NewRank", { rank: newRank })}</p>`);
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="trespasser-chat-card haven-report">${messages.join("")}</div>`
    });
  }

  const currentLevel = data.level || 0;
  if (currentLevel < 9) {
    const nextLevel = currentLevel + 1;
    const thresholds = data.populationThresholds;
    const requiredRank = thresholds[nextLevel];
    const characters = game.actors.filter(a => a.type === "character");
    const partyLevel = characters.length ? Math.max(...characters.map(c => c.system.level ?? 0)) : 0;
    
    if (newRank >= requiredRank && partyLevel >= nextLevel) {
      updates["system.level"] = nextLevel;
      ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Haven.LevelUp", { name: actor.name, level: nextLevel }));
    }
  }

  if (Object.keys(updates).length) await actor.update(updates);
}

/**
 * Step 5: Event Check
 * @param {TrespasserHavenData} data
 */
export async function eventCheck(data) {
  const actor = data.parent;
  const event = data.event;
  const isActive = !!event.title?.trim();
  
  if (isActive) {
    const nextValue = Math.min(event.current + 1, event.clock);
    await actor.update({ "system.event.current": nextValue });
    
    const isComplete = nextValue >= event.clock;
    
    await ChatMessage.create({
      content: `<div class="trespasser-chat-card haven-report">
        <h3>${game.i18n.localize("TRESPASSER.Terms.HavenUpkeepEventCheck")}</h3>
        <p><strong>${event.title}</strong> ${game.i18n.localize("TRESPASSER.Chat.Haven.EventAdvances")}</p>
        <div class="haven-event-status">
          <span class="label">${game.i18n.localize("TRESPASSER.Terms.ThreatClock")}:</span>
          <span class="value">${nextValue} / ${event.clock}</span>
        </div>
        ${isComplete ? `<p class="critical" style="color:var(--trp-red); font-weight:bold; margin-top:10px; border:2px solid var(--trp-red); padding:5px; text-align:center;">${game.i18n.localize("TRESPASSER.Chat.Haven.EventComplete")}</p>` : ""}
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  } else {
    const skillBonus = data.skillBonus;
    const roll = new foundry.dice.Roll("1d10");
    await roll.evaluate();
    
    const starts = roll.total <= skillBonus;
    
    let content = `<div class="trespasser-chat-card haven-report">
      <h3>${game.i18n.localize("TRESPASSER.Terms.HavenUpkeepEventCheck")}</h3>
      <p>${game.i18n.localize("TRESPASSER.Chat.Haven.RollingThreat")}</p>
      <div class="haven-check-details">
        <span>${game.i18n.localize("TRESPASSER.Terms.HavenDCSkillBonus")}: <strong>${skillBonus}</strong></span>
      </div>`;
    
    if (starts) {
      content += `<p class="success" style="color:var(--trp-green-bright); font-weight:bold; margin-top:8px;">${game.i18n.localize("TRESPASSER.Chat.Haven.NewEventStarts")}</p>
                 <p style="font-size:var(--fs-11); font-style:italic;">${game.i18n.localize("TRESPASSER.Chat.Haven.DefineEventInstruction")}</p>`;
      await actor.update({ "system.event.current": 1 });
    } else {
      content += `<p class="failure" style="color:var(--trp-text-dim); font-style:italic; margin-top:8px;">${game.i18n.localize("TRESPASSER.Chat.Haven.QuietWeek")}</p>`;
    }
    content += `</div>`;
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: content
    });
  }
}
