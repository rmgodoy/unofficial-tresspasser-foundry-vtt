import { postActionChat, consumeAction, getDungeonDC } from "./dungeon-actions-common.mjs";

/**
 * INTERACT (p.55): Engage with a feature of the current room in a complex way.
 */
export async function handleInteract(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Interact");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.InteractDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Terms.Party.GroupCheck")} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/**
 * VANDALIZE (p.55): Break open a locked door, chest, or destroy property.
 */
export async function handleVandalize(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Vandalize");
  const dc = getDungeonDC(dungeon);

  const newAlarm = (dungeon.system.alarm ?? 0) + 1;
  await dungeon.update({ "system.alarm": newAlarm });

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.VandalizeDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Athletics")} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;
  body += `<p>${game.i18n.localize("TRESPASSER.Sheet.Dungeon.Alarm")}: <strong>${newAlarm}</strong></p>`;
  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="mighty" data-skill="athletics" data-dc="${dc}">
      <i class="fas fa-dice"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.RollCheck", { skill: `${game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Athletics")}` })}
    </button>
  </div>`;

  await consumeAction(dungeon, label, game.i18n.format("TRESPASSER.Chat.Dungeon.Log.AlarmChange", { value: newAlarm }));
  await postActionChat(dungeon, label, body);
  return true;
}

/**
 * PICK LOCK (p.55): Attempt to pick a locked door or chest.
 */
export async function handlePickLock(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.PickLock");
  const dc = getDungeonDC(dungeon);

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.PickLockDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${game.i18n.localize("TRESPASSER.Terms.Attribute.Agility")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Tinkering")} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;
  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="agility" data-skill="tinkering" data-dc="${dc}">
      <i class="fas fa-dice"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.RollCheck", { skill: `${game.i18n.localize("TRESPASSER.Terms.Attribute.Agility")} | ${game.i18n.localize("TRESPASSER.Terms.Skill.Tinkering")}` })}
    </button>
  </div>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/**
 * DISARM (p.55): Attempt to disarm a trap.
 */
export async function handleDisarm(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Disarm");
  const dc = getDungeonDC(dungeon);
  const intellectLabel = game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect");
  const tinkeringLabel = game.i18n.localize("TRESPASSER.Terms.Skill.Tinkering");
  const magicLabel = game.i18n.localize("TRESPASSER.Terms.Skill.Magic");

  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.DisarmDesc")}</p>`;
  body += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Party.Roll")}:</strong> ${intellectLabel} | ${tinkeringLabel} / ${magicLabel} vs ${game.i18n.localize("TRESPASSER.Terms.DC")} ${dc}</p>`;
  body += `<div class="dungeon-action-buttons">
    <button type="button" class="dungeon-action-roll-btn" data-attribute="intellect" data-skill="tinkering" data-dc="${dc}">
      <i class="fas fa-wrench"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.DisarmNormal", { skill: `${intellectLabel} | ${tinkeringLabel}` })}
    </button>
    <button type="button" class="dungeon-action-roll-btn" data-attribute="intellect" data-skill="magic" data-dc="${dc}">
      <i class="fas fa-wand-magic-sparkles"></i> ${game.i18n.format("TRESPASSER.Chat.Dungeon.DisarmMagic", { skill: `${intellectLabel} | ${magicLabel}` })}
    </button>
  </div>`;

  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/**
 * CONVERSE (p.55): Spend a few minutes talking to a creature.
 */
export async function handleConverse(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Converse");
  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.ConverseDesc")}</p>`;
  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/**
 * MOMENT'S REST (p.55): Pause for 10 minutes.
 */
export async function handleMomentsRest(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.MomentsRest");
  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.MomentsRestDesc")}</p>`;
  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}

/**
 * INCANT (p.55): Cast an incantation while the rest of the party keeps watch.
 */
export async function handleIncant(dungeon, options) {
  const label = game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.Incant");
  let body = `<p>${game.i18n.localize("TRESPASSER.Terms.Dungeon.Actions.IncantDesc")}</p>`;
  await consumeAction(dungeon, label);
  await postActionChat(dungeon, label, body);
  return true;
}
