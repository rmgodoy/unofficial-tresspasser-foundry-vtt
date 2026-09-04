/**
 * Character Sheet — activateListeners
 * Exports: activateCharacterListeners(html, sheet)
 */

export function activateCharacterListeners(html, sheet) {
  const actor = sheet.actor;

  // Attribute and combat stat labels
  if (sheet._onAttributeRoll)  html.find(".attribute-roll").on("click",  sheet._onAttributeRoll.bind(sheet));
  if (sheet._onCombatStatRoll) html.find(".combat-stat-roll").on("click", sheet._onCombatStatRoll.bind(sheet));
  if (sheet._onEquipRoll)      html.find(".equip-rollable").on("click",   sheet._onEquipRoll.bind(sheet));
  if (sheet._onRestDialog)     html.find(".rest-btn").on("click",         sheet._onRestDialog.bind(sheet));
  if (sheet._onSpendRDHeader)  html.find('[data-action="spend-rd"] label.rollable').on("click", sheet._onSpendRDHeader.bind(sheet));
  if (sheet._onCallingEdit)    html.find(".calling-edit").on("click",      sheet._onCallingEdit.bind(sheet));
  if (sheet._onCallingDelete)  html.find(".calling-delete").on("click",    sheet._onCallingDelete.bind(sheet));

  // Effect listeners
  if (sheet._onPrevailRoll)     html.find(".effect-prevail").on("click",           sheet._onPrevailRoll.bind(sheet));
  if (sheet._onIntensityChange) html.find(".effect-intensity-input").on("change",  sheet._onIntensityChange.bind(sheet));
  if (sheet._onEffectRemove)    html.find(".effect-remove").on("click",            sheet._onEffectRemove.bind(sheet));
  if (sheet._onEffectInfo)      html.find(".effect-info").on("click",              sheet._onEffectInfo.bind(sheet));
  if (sheet._onEffectEdit)      html.find(".effect-edit").on("click",              sheet._onEffectEdit.bind(sheet));
  if (sheet._onEffectInfo)      html.find(".feature-info, .talent-info, .incantation-info").on("click", sheet._onEffectInfo.bind(sheet));
  if (sheet._onDurationChange)  html.find(".effect-duration-input").on("change",  sheet._onDurationChange.bind(sheet));

  // Plight / Lasting State listeners
  if (sheet._onPlightAdd)       html.find(".plight-add").on("click",              sheet._onPlightAdd.bind(sheet));
  if (sheet._onLastingStateAdd) html.find(".lasting-state-add").on("click",       sheet._onLastingStateAdd.bind(sheet));

  // Equip / Unequip / Recover Thrown
  html.find(".item-equip").on("click", (ev) => {
    const li = ev.currentTarget.closest(".inventory-card");
    actor?.equipItem(li.dataset.itemId);
  });
  html.find(".item-unequip").on("click", (ev) => {
    const itemId = ev.currentTarget.dataset.itemId || ev.currentTarget.closest(".inventory-card")?.dataset.itemId;
    if (itemId) actor?.unequipItem(itemId);
  });
  html.find(".item-recover-thrown").on("click", async (ev) => {
    const itemId = ev.currentTarget.dataset.itemId || ev.currentTarget.closest(".inventory-card")?.dataset.itemId;
    const item = actor?.items.get(itemId);
    if (item) await item.update({ "system.isThrown": false });
  });
  html.find(".item-broken-toggle").on("change", async (ev) => {
    const li   = ev.currentTarget.closest("[data-item-id]");
    const item = actor?.items.get(li.dataset.itemId);
    if (item) await item.update({ "system.broken": ev.currentTarget.checked });
  });

  if (sheet._onDepletionRoll) html.find(".item-deplete").on("click",      sheet._onDepletionRoll.bind(sheet));
  if (sheet._onItemConsume)   html.find(".item-consume").on("click",      sheet._onItemConsume.bind(sheet));
  if (sheet._onItemTransfer)  html.find(".item-transfer").on("click",     sheet._onItemTransfer.bind(sheet));
  if (sheet._onToggleLight)   html.find(".item-toggle-light").on("click", sheet._onToggleLight.bind(sheet));

  if (!sheet.isEditable) return;

  // Injury clock mini segments
  if (sheet._onInjuryClockClick) html.find(".clock-segment").on("click", sheet._onInjuryClockClick.bind(sheet));

  // Key attribute star
  html.find(".key-attr-btn").on("click", (ev) => {
    ev.preventDefault();
    const attr = ev.currentTarget.dataset.attribute;
    actor?.update({ "system.key_attribute": attr });
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
    const isTrained = actor?.system?.skills?.[skillKey] ?? false;
    sheet._onSkillRoll?.(skillKey, isTrained);
  });

  if (sheet._onDeedRoll)        html.find(".deed-rollable").on("click",           sheet._onDeedRoll.bind(sheet));
  if (sheet._onTalentRoll)      html.find(".talent-rollable").on("click",         sheet._onTalentRoll.bind(sheet));
  if (sheet._onIncantationRoll) html.find(".incantation-rollable").on("click",    sheet._onIncantationRoll.bind(sheet));
  if (sheet._onFeatureRoll)     html.find(".feature-name.rollable").on("click",   sheet._onFeatureRoll.bind(sheet));

  html.find(".item-name:not(.rollable)").on("click", (ev) => {
    const el   = ev.currentTarget.closest("[data-item-id]");
    const item = actor?.items.get(el.dataset.itemId);
    item?.sheet.render(true);
  });

  // Item CRUD
  if (sheet._onItemCreate) html.find(".item-create").on("click", sheet._onItemCreate.bind(sheet));
  html.find(".item-delete").on("click", (ev) => {
    const el   = ev.currentTarget.closest("[data-item-id]");
    const item = actor?.items.get(el.dataset.itemId);
    item?.delete();
  });
  html.find(".item-edit").on("click", (ev) => {
    const el   = ev.currentTarget.closest("[data-item-id]");
    const item = actor?.items.get(el.dataset.itemId);
    item?.sheet.render(true);
  });
}
