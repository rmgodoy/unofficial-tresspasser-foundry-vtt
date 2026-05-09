import { esc } from "./utils.mjs";

export function buildFeatureContent(item) {
  const desc = item.system?.description?.trim() || "";
  return `
    <div class="item-info-card feature">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Sheet.Item.Placeholder.Description")}</div>`}
    </div>`;
}
