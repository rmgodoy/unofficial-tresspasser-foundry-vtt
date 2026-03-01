import { esc } from "./utils.mjs";

export function buildGenericContent(item) {
  const desc = item.system?.description?.trim() || "";
  return `
    <div class="item-info-card">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Item.NoDescription")}</div>`}
    </div>`;
}
