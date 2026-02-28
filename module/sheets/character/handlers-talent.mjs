/**
 * Character Sheet — Talent, Feature, Incantation roll handlers
 */

export async function onTalentRoll(event, sheet) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const el = event.currentTarget.closest("[data-item-id]");
  if (!el) return;
  const item = sheet.actor.items.get(el.dataset.itemId);
  if (!item) return;

  const isUsable = item.system.usable;
  let totalCost  = 0;

  if (isUsable) {
    const baseCost      = item.system.focusCost  || 0;
    const currentBonusCost = item.system.bonusCost || 0;
    const costIncrease  = item.system.focusIncrease || 0;
    totalCost = baseCost + currentBonusCost;

    if (totalCost > 0) {
      const currentFocus = sheet.actor.system.combat.focus || 0;
      if (currentFocus < totalCost) {
        ui.notifications.error(game.i18n.format("TRESPASSER.Notifications.NotEnoughFocus", { name: item.name, cost: totalCost, current: currentFocus }));
        return;
      }
      await sheet.actor.update({ "system.combat.focus": currentFocus - totalCost });
    }

    await item.update({
      "system.uses":      (item.system.uses || 0) + 1,
      "system.bonusCost": currentBonusCost + costIncrease
    });
  }

  const enrichedDescription = await TextEditor.enrichHTML(item.system.description, {
    async: true, secrets: item.isOwner, relativeTo: item
  });

  let cardHtml = `<div class="trespasser-chat-card talent-card">
    <h3>Talent: ${item.name}</h3>
    ${totalCost > 0 ? `<p class="cost-note">${game.i18n.format("TRESPASSER.Chat.SpentFocus", { count: totalCost })}</p>` : ""}
    <details>
      <summary style="cursor:pointer;color:var(--trp-gold-bright);font-family:var(--trp-font-header);font-size:11px;margin-bottom:5px;">
        <i class="fas fa-info-circle"></i> ${game.i18n.localize("TRESPASSER.Chat.DescriptionExpand")}
      </summary>
      <div class="collapsible-content" style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;border:1px solid var(--trp-border);margin-bottom:10px;font-size:12px;">
        ${enrichedDescription}
      </div>
    </details>`;

  if (item.system.effects?.length > 0) {
    cardHtml += `<div class="applied-effects"><strong>${game.i18n.localize("TRESPASSER.Chat.EffectsStates")}</strong>`;
    for (const eff of item.system.effects) {
      cardHtml += `<a class="apply-effect-btn" data-uuid="${eff.uuid}" data-intensity="${eff.intensity || 1}">
        <img src="${eff.img}" width="20" height="20" /><span>${eff.name}</span><i class="fas fa-hand-sparkles"></i>
      </a>`;
    }
    cardHtml += `</div>`;
  }
  cardHtml += `</div>`;

  let formula = isUsable ? (item.system.rollDice || "") : "";
  if (formula.trim() !== "") {
    const skillDie = sheet.actor.system.skill_die || "d6";
    formula = formula.replace(/<sd>/gi, skillDie);

    let weaponDie = "d4";
    const mainHandId = sheet.actor.system.equipment?.main_hand;
    if (mainHandId) {
      const weapon = sheet.actor.items.get(mainHandId);
      if (weapon?.system.weaponDie) weaponDie = weapon.system.weaponDie;
    }
    formula = formula.replace(/<wd>/gi, weaponDie);

    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const applyHealBtns = `<div class="trp-damage-actions" style="display:flex;gap:6px;margin-top:8px;">
      <button class="apply-damage-btn" data-damage="${roll.total}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #c0392b;color:#e74c3c;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;">
        <i class="fas fa-heart-broken"></i> Apply Damage
      </button>
      <button class="heal-damage-btn" data-damage="${roll.total}" style="flex:1;background:var(--trp-bg-dark);border:1px solid #27ae60;color:#2ecc71;border-radius:4px;padding:3px 6px;cursor:pointer;font-size:11px;">
        <i class="fas fa-heart"></i> Heal
      </button>
    </div>`;

    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor: cardHtml + applyHealBtns });

    if (item.system.rollDice?.includes("<wd>")) {
      if (mainHandId) {
        const weapon = sheet.actor.items.get(mainHandId);
        if (weapon?.system.properties?.fragile) await sheet._runDepletionCheck(weapon);
      }
    }
  } else {
    await foundry.documents.BaseChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), content: cardHtml
    });
  }
}

export async function onFeatureRoll(event, sheet) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const li   = event.currentTarget.closest("[data-item-id]");
  const item = sheet.actor.items.get(li.dataset.itemId);
  if (!item) return;

  const enrichedRef = await TextEditor.enrichHTML(item.system.description, {
    async: true, secrets: item.isOwner, relativeTo: item
  });

  const content = `
    <div class="trespasser-chat-card feature-card">
      <h3>Feature: ${item.name}</h3>
      <details>
        <summary style="cursor:pointer;color:var(--trp-gold-bright);font-family:var(--trp-font-header);font-size:11px;margin-bottom:5px;">
          <i class="fas fa-info-circle"></i> ${game.i18n.localize("TRESPASSER.Chat.DescriptionExpand")}
        </summary>
        <div class="collapsible-content" style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;border:1px solid var(--trp-border);margin-bottom:10px;font-size:12px;">
          ${enrichedRef}
        </div>
      </details>
    </div>`;

  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), content });
}

export async function onIncantationRoll(event, sheet) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const el = event.currentTarget.closest("[data-item-id]");
  if (!el) return;
  const item = sheet.actor.items.get(el.dataset.itemId);
  if (!item) return;

  const cost             = item.system.enduranceCost || 0;
  const currentEndurance = sheet.actor.system.endurance || 0;

  if (currentEndurance < cost) {
    ui.notifications.error(game.i18n.format("TRESPASSER.Notifications.NotEnoughEndurance", { name: item.name, cost, current: currentEndurance }));
    return;
  }

  await sheet.actor.update({ "system.endurance": currentEndurance - cost });

  const keyAttr   = sheet.actor.system.key_attribute || "mighty";
  const attrValue = sheet.actor.system.attributes[keyAttr] ?? 0;
  const hasMagic  = sheet.actor.system.skills?.magic || false;
  const skillBonus = sheet.actor.system.skill || 0;

  let formula = `1d20 + ${attrValue}`;
  if (hasMagic) formula += ` + ${skillBonus}`;

  const roll = new foundry.dice.Roll(formula);
  await roll.evaluate();

  const target    = 15;
  const diff      = roll.total - target;
  const isSuccess = roll.total >= target;
  let sparks = 0, shadows = 0;

  if (diff >= 0) sparks  = Math.floor(diff / 5);
  else           shadows = Math.floor(Math.abs(diff) / 5);

  const diceResult = roll.dice[0].results[0].result;
  if (diceResult === 20) sparks  += 1;
  if (diceResult === 1)  shadows += 1;

  const enrichedDescription = await TextEditor.enrichHTML(item.system.description, {
    async: true, secrets: item.isOwner, relativeTo: item
  });

  const resultText = isSuccess
    ? `<span class="hit-text"  style="font-weight:bold;color:#4caf50;">${game.i18n.localize("TRESPASSER.Chat.Success")}</span>`
    : `<span class="miss-text" style="font-weight:bold;color:#f44336;">${game.i18n.localize("TRESPASSER.Chat.Failure")}</span>`;

  const flavor = `
    <div class="trespasser-chat-card incantation-card">
      <h3>Incantation: ${item.name}</h3>
      <p><strong>${game.i18n.localize("TRESPASSER.Chat.ResultVs").split(" ")[0]}:</strong> ${roll.total} vs ${target} — ${resultText}</p>
      <div class="incantation-metrics" style="display:flex;gap:10px;margin:10px 0;font-weight:bold;">
        <div class="metric spark"  style="color:#64b5f6;"><i class="fas fa-sun"></i>  ${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</div>
        <div class="metric shadow" style="color:#9575cd;"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</div>
      </div>
      <details>
        <summary style="cursor:pointer;color:var(--trp-gold-bright);font-family:var(--trp-font-header);font-size:11px;margin-bottom:5px;">
          <i class="fas fa-info-circle"></i> Description (Click to Expand)
        </summary>
        <div class="collapsible-content" style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;border:1px solid var(--trp-border);margin-bottom:10px;font-size:12px;">
          ${enrichedDescription}
        </div>
      </details>
    </div>`;

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: sheet.actor }), flavor });
}
