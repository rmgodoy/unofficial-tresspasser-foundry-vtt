import { esc } from "./utils.mjs";

export function buildEquipmentContent(item) {
  const sys = item.system;
  let meta = `<div class="info-dlg-meta">${item.type.toUpperCase()}`;
  
  if (item.type === "weapon") {
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Equipments.WD")}: ${sys.weaponDie}`;
    meta += ` | ${game.i18n.localize("TRESPASSER.Item.Type")}: ${sys.type}`;
    if (sys.range) meta += ` | ${game.i18n.localize("TRESPASSER.Item.Range")}: ${sys.range}`;
  } else if (item.type === "armor") {
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Equipments.AR")}: ${sys.armorRating}`;
    meta += ` | ${game.i18n.localize("TRESPASSER.Sheet.Equipments.DIE")}: ${sys.armorDie}`;
    meta += ` | ${game.i18n.localize("TRESPASSER.Item.ArmorPlacementChoices." + sys.placement?.charAt(0).toUpperCase() + sys.placement?.slice(1)) || sys.placement}`;
  }
  
  meta += `</div>`;

  const desc = sys.description?.trim() || "";

  return `
    <div class="item-info-card equipment">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${meta}
      <hr style="border: 0; border-top: 1px solid var(--trp-border-light); margin: 8px 0;" />
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Item.NoDescription")}</div>`}
    </div>`;
}
