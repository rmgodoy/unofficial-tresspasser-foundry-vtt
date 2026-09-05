import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";
import { evaluateAndShowRoll } from "../sheets/character/handlers-rolls.mjs";
import { TrespasserPartyHelper } from "../helpers/party-helper.mjs";

/**
 * Prompt user to select a character from a list using DialogV2.
 * @param {Actor[]} characters
 * @returns {Promise<Actor|null>}
 */
export async function promptCharacterSelection(characters) {
  let content = `<div class="trespasser-dialog character-select-dialog">`;
  content += `<p style="font-size:var(--fs-12);color:var(--trp-text-dim);margin-bottom:10px;">${game.i18n.localize("TRESPASSER.Dialog.Dungeon.SelectCharacterPrompt")}</p>`;
  content += `<div class="character-select-grid" style="display:flex;flex-direction:column;gap:6px;">`;
  for (const char of characters) {
    content += `
      <button type="button" class="char-select-btn" data-actor-id="${char.id}" style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:var(--trp-bg-panel);border:1px solid var(--trp-border);border-radius:var(--trp-radius);color:var(--trp-text-bright);cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-13);text-align:left;">
        <img src="${char.img}" style="width:28px;height:28px;border-radius:2px;border:1px solid var(--trp-border-light);object-fit:cover;" />
        <span style="font-weight:bold;">${char.name}</span>
      </button>`;
  }
  content += `</div></div>`;

  return new Promise((resolve) => {
    let resolved = false;
    foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize("TRESPASSER.Dialog.Dungeon.SelectCharacterTitle"),
        width: 320
      },
      classes: ["trespasser", "dialog"],
      content,
      buttons: [
        {
          action: "cancel",
          label: game.i18n.localize("TRESPASSER.Dialog.Common.Cancel") || "Cancel",
          callback: () => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }
        }
      ],
      render: (event, dialog) => {
        const el = dialog.element;
        el.querySelectorAll(".char-select-btn").forEach(btn => {
          btn.addEventListener("click", (ev) => {
            if (resolved) return;
            resolved = true;
            const actorId = ev.currentTarget.dataset.actorId;
            dialog.close();
            resolve(game.actors.get(actorId) || null);
          });
        });
      },
      rejectClose: false
    }).then(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

/**
 * Resolve which character actor should perform a dungeon check.
 * @returns {Promise<Actor|null>}
 */
export async function resolveActingCharacter() {
  const controlledChars = canvas.tokens?.controlled
    .map(t => t.actor)
    .filter(a => a?.type === "character" && (game.user.isGM || a.isOwner)) || [];

  if (controlledChars.length === 1) return controlledChars[0];
  if (controlledChars.length > 1) {
    return promptCharacterSelection(controlledChars);
  }

  if (game.user.character && game.user.character.type === "character" && (game.user.isGM || game.user.character.isOwner)) {
    return game.user.character;
  }

  if (!game.user.isGM) {
    const ownedChars = game.actors.filter(a => a.type === "character" && a.isOwner);
    if (ownedChars.length === 1) return ownedChars[0];
    if (ownedChars.length > 1) {
      return promptCharacterSelection(ownedChars);
    }
  } else {
    const activeParty = TrespasserPartyHelper.getActiveParty();
    const partyMembers = (activeParty?.system?.members ?? [])
      .map(id => game.actors.get(id))
      .filter(a => a && a.type === "character");

    const pool = partyMembers.length > 0
      ? partyMembers
      : game.actors.filter(a => a.type === "character");

    if (pool.length === 1) return pool[0];
    if (pool.length > 1) {
      return promptCharacterSelection(pool);
    }
  }

  ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Dungeon.NoCharacterForRoll"));
  return null;
}

/**
 * Perform a dungeon action roll check for a character actor.
 * @param {Actor} actor - The character actor rolling
 * @param {string} attribute - Attribute key (mighty, agility, intellect, spirit)
 * @param {string} skill - Skill key (athletics, perception, stealth, tinkering, magic, etc.)
 * @param {number} dc - Target DC
 * @returns {Promise<Roll|null>}
 */
export async function rollDungeonActionCheck(actor, attribute, skill, dc) {
  if (!actor || actor.type !== "character") return null;

  const attr = actor.system.attributes ?? {};
  const bonuses = actor.system.bonuses ?? {};
  const skillVal = actor.system.skill ?? 0;
  const isTrained = actor.system.skills?.[skill] ?? false;
  const skillBonus = isTrained ? skillVal : 0;
  const trainedLabel = isTrained ? ` (${game.i18n.localize("TRESPASSER.Chat.Common.Trained")})` : "";

  const attrLabelKey = attribute.charAt(0).toUpperCase() + attribute.slice(1);
  const skillLabelKey = skill.charAt(0).toUpperCase() + skill.slice(1);
  const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${attrLabelKey}`) || attrLabelKey;
  const skillLabel = game.i18n.localize(`TRESPASSER.Terms.Skill.${skillLabelKey}`) || skillLabelKey;
  const checkLabel = `${attrLabel} | ${skillLabel}`;

  let attrVal = attr[attribute] ?? 0;
  let attrBonus = bonuses[attribute] ?? 0;
  let effectBonus = TrespasserEffectsHelper.getAttributeBonus(actor, attribute, "use");

  let plightName = "";
  if ((attribute === "intellect" || attribute === "spirit") && actor.system.hasPlight?.("befuddled")) {
    plightName = "Befuddled";
  } else if ((attribute === "mighty" || attribute === "agility") && actor.system.hasPlight?.("sickly")) {
    plightName = "Sickly";
  }

  if (plightName) {
    attrVal = 0;
    attrBonus = 0;
    effectBonus = 0;
    ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.AttributeSuppressed", { plight: plightName, attr: attrLabel }));
  }

  const isAdv = TrespasserEffectsHelper.hasAdvantage(actor, attribute);
  const diceFormula = isAdv ? "2d20kh" : "1d20";

  const rollBonuses = [
    { label: attrLabel, value: attrVal },
    { label: game.i18n.localize("TRESPASSER.Dialog.Roll.SkillBonus"), value: skillBonus },
    { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus"), value: effectBonus }
  ];
  if (attrBonus !== 0) {
    rollBonuses.push({ label: game.i18n.localize("TRESPASSER.Dialog.Roll.PermanentBonus") || "Permanent Bonus", value: attrBonus });
  }

  const result = await TrespasserRollDialog.wait({
    dice: diceFormula,
    bonuses: rollBonuses,
    showCD: true,
    cd: dc,
    isNonCombat: true
  }, { title: `${actor.name} — ${checkLabel}` });

  if (!result) return null;

  let formula = `${diceFormula} + ${attrVal} + ${result.modifier}`;
  if (attrBonus !== 0) formula += ` + ${attrBonus}`;
  if (effectBonus !== 0) formula += ` + ${effectBonus}`;
  if (skillBonus > 0) formula += ` + ${skillBonus}`;

  const roll = new foundry.dice.Roll(formula);
  const flavor = isAdv
    ? game.i18n.format("TRESPASSER.Chat.Check.SkillCheckAdv", { name: actor.name, skill: checkLabel }) + trainedLabel
    : game.i18n.format("TRESPASSER.Chat.Check.SkillCheck", { name: actor.name, skill: checkLabel }) + trainedLabel;

  const finalCD = result.cd ?? dc;
  const rollRes = await evaluateAndShowRoll(roll, flavor, finalCD, actor.sheet, { skillKey: skill, isNonCombat: true });
  if (rollRes) {
    await TrespasserEffectsHelper.triggerEffects(actor, "use", { filterTarget: attribute });
  }

  return roll;
}

/**
 * Handle clicking a roll button on a dungeon action chat card.
 * @param {HTMLElement} btn
 */
export async function handleDungeonRollButtonClick(btn) {
  const attribute = btn.dataset.attribute;
  const skill = btn.dataset.skill;
  const dc = parseInt(btn.dataset.dc) || 10;

  if (!attribute || !skill) return;

  const actor = await resolveActingCharacter();
  if (!actor) return;

  await rollDungeonActionCheck(actor, attribute, skill, dc);
}
