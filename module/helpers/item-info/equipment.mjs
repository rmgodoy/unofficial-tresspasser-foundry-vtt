import { esc } from "./utils.mjs";

export function buildEquipmentContent(item) {
  const sys = item.system;
  let meta = `<div class="info-dlg-meta">${item.type.toUpperCase()}`;
  
  if (item.type === "weapon") {
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Common.WD")}: ${sys.weaponDie}`;
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Item.Details.WeaponType")}: ${sys.type}`;
    if (sys.range) meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Common.Range")}: ${sys.range}`;
  } else if (item.type === "armor") {
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Common.AR")}: ${sys.armorRating}`;
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Common.DIE")}: ${sys.armorDie}`;
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Character.Equipments." + sys.placement?.charAt(0).toUpperCase() + sys.placement?.slice(1)) || sys.placement}`;
  }
  
  meta += `</div>`;

  const desc = sys.description?.trim() || "";

  return `
    <div class="item-info-card equipment">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${meta}
      <hr style="border: 0; border-top: 1px solid var(--trp-border-light); margin: 8px 0;" />
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Sheet.Item.Placeholder.Description")}</div>`}
    </div>`;
}
