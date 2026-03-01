import { esc } from "./utils.mjs";

export function buildTalentContent(item) {
  const sys  = item.system;
  const desc = sys?.description?.trim() || "";
  const baseCost  = sys?.focusCost != null ? sys.focusCost : null;
  const bonusCost = sys?.bonusCost != null ? `+${sys.bonusCost}` : null;
  const focusLine = baseCost != null
    ? `<div class="info-dlg-meta">${game.i18n.localize("TRESPASSER.Item.FocusCost")}: ${baseCost}${bonusCost ? " " + bonusCost : ""}</div>`
    : "";
  return `
    <div class="item-info-card talent">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${focusLine}
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Item.NoDescription")}</div>`}
    </div>`;
}
