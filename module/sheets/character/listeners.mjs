/**
 * Character Sheet — activateListeners
 * Exports: activateCharacterListeners(html, sheet)
 */

export function activateCharacterListeners(html, sheet) {
  const actor = sheet.actor;

  // Attribute and combat stat labels
  html.find(".attribute-roll").on("click",  sheet._onAttributeRoll.bind(sheet));
  html.find(".combat-stat-roll").on("click", sheet._onCombatStatRoll.bind(sheet));
  html.find(".equip-rollable").on("click",   sheet._onEquipRoll.bind(sheet));
  html.find(".rest-btn").on("click",         sheet._onRestDialog.bind(sheet));
  html.find('[data-action="spend-rd"] label.rollable').on("click", sheet._onSpendRDHeader.bind(sheet));
  html.find(".calling-edit").on("click",      sheet._onCallingEdit.bind(sheet));
  html.find(".calling-delete").on("click",    sheet._onCallingDelete.bind(sheet));

  // Effect listeners
  html.find(".effect-prevail").on("click",           sheet._onPrevailRoll.bind(sheet));
  html.find(".effect-intensity-input").on("change",  sheet._onIntensityChange.bind(sheet));
  html.find(".effect-remove").on("click",            sheet._onEffectRemove.bind(sheet));
  html.find(".effect-info").on("click",              sheet._onEffectInfo.bind(sheet));
  html.find(".effect-edit").on("click",              sheet._onEffectEdit.bind(sheet));
  html.find(".feature-info, .talent-info, .incantation-info").on("click", sheet._onEffectInfo.bind(sheet));
  html.find(".effect-duration-input").on("change",  sheet._onDurationChange.bind(sheet));

  // Equip / Unequip
  html.find(".item-equip").on("click", (ev) => {
    const li = ev.currentTarget.closest(".inventory-card");
    actor.equipItem(li.dataset.itemId);
  });
  html.find(".item-unequip").on("click", (ev) => {
    const itemId = ev.currentTarget.dataset.itemId || ev.currentTarget.closest(".inventory-card")?.dataset.itemId;
    if (itemId) actor.unequipItem(itemId);
  });
  html.find(".item-broken-toggle").on("change", async (ev) => {
    const li   = ev.currentTarget.closest("[data-item-id]");
    const item = actor.items.get(li.dataset.itemId);
    if (item) await item.update({ "system.broken": ev.currentTarget.checked });
  });

  html.find(".item-deplete").on("click",      sheet._onDepletionRoll.bind(sheet));
  html.find(".item-consume").on("click",      sheet._onItemConsume.bind(sheet));
  html.find(".item-transfer").on("click",     sheet._onItemTransfer.bind(sheet));
  html.find(".item-toggle-light").on("click", sheet._onToggleLight.bind(sheet));

  html.find(".weapon-mode-select").on("change", async (ev) => {
    await actor.update({ "system.combat.weaponMode": ev.currentTarget.value });
    sheet.render();
  });

  if (!sheet.isEditable) return;

  // Injury clock mini segments
  html.find(".clock-segment-mini").on("click", sheet._onInjuryClockClick.bind(sheet));

  // Key attribute star
  html.find(".key-attr-btn").on("click", (ev) => {
    ev.preventDefault();
    const attr = ev.currentTarget.dataset.attribute;
    actor.update({ "system.key_attribute": attr });
  });

  // Collapsible deed rows
  html.find(".deed-row .deed-header").on("click", (ev) => {
    if (ev.target.closest(".deed-controls")) return;
    const row = ev.currentTarget.closest(".deed-row");
    row.classList.toggle("expanded");
  });

  // Skill click → attribute dialog → roll
  html.find(".skill-label.rollable").on("click", (ev) => {
    const skillKey  = ev.currentTarget.dataset.skill;
    const isTrained = actor.system.skills[skillKey] ?? false;
    sheet._onSkillRoll(skillKey, isTrained);
  });

  html.find(".deed-rollable").on("click",           sheet._onDeedRoll.bind(sheet));
  html.find(".talent-rollable").on("click",         sheet._onTalentRoll.bind(sheet));
  html.find(".incantation-rollable").on("click",    sheet._onIncantationRoll.bind(sheet));
  html.find(".feature-name.rollable").on("click",   sheet._onFeatureRoll.bind(sheet));

  html.find(".item-name:not(.rollable)").on("click", (ev) => {
    const el   = ev.currentTarget.closest("[data-item-id]");
    const item = actor.items.get(el.dataset.itemId);
    item?.sheet.render(true);
  });

  // Item CRUD
  html.find(".item-create").on("click", sheet._onItemCreate.bind(sheet));
  html.find(".item-delete").on("click", (ev) => {
    const el   = ev.currentTarget.closest("[data-item-id]");
    const item = actor.items.get(el.dataset.itemId);
    item?.delete();
  });
  html.find(".item-edit").on("click", (ev) => {
    const el   = ev.currentTarget.closest("[data-item-id]");
    const item = actor.items.get(el.dataset.itemId);
    item?.sheet.render(true);
  });
}
