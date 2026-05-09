import { esc } from "./utils.mjs";

export function buildTalentContent(item) {
  const sys  = item.system;
  const baseCost  = sys.focusCost != null ? sys.focusCost : null;
  const bonusCost = sys.bonusCost != null ? `+${sys.bonusCost}` : null;
  const focusLine = baseCost != null
    ? `<div class="info-dlg-meta">${game.i18n.localize("TRESPASSER.Sheet.Item.Details.FocusCost")}: ${baseCost}${bonusCost ? " " + bonusCost : ""}</div>`
    : "";
  const desc = sys.description?.trim() || "";
  return `
    <div class="item-info-card talent">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${focusLine}
      <hr style="border: 0; border-top: 1px solid var(--trp-border-light); margin: 8px 0;" />
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Sheet.Item.Placeholder.Description")}</div>`}
    </div>`;
}
