import { esc } from "./utils.mjs";

const DEED_PHASES = ["start", "before", "base", "hit", "spark", "after", "end"];

const PHASE_LABELS = {
  start:  "TRESPASSER.Item.Start",
  before: "TRESPASSER.Item.Before",
  base:   "TRESPASSER.Item.Base",
  hit:    "TRESPASSER.Item.Hit",
  spark:  "TRESPASSER.Item.Spark",
  after:  "TRESPASSER.Item.After",
  end:    "TRESPASSER.Item.End",
};

export function buildDeedContent(item) {
  const sys = item.system;

  // Subtitle: "TYPE ATTACK vs. ACCURACY | TARGET"
  const typeLabel    = game.i18n.localize(`TRESPASSER.Item.DeedTypeChoices.${sys.type?.charAt(0).toUpperCase() + sys.type?.slice(1)}`) || sys.type || "";
  const actionLabel  = game.i18n.localize(`TRESPASSER.Item.DeedActionTypeChoices.${sys.actionType?.charAt(0).toUpperCase() + sys.actionType?.slice(1)}`) || sys.actionType || "";
  const accuracyTest = sys.actionType === "support" ? "10" : (sys.accuracyTest || "");
  const target       = esc(sys.target || "");

  const subtitleParts = [];
  if (typeLabel) subtitleParts.push(typeLabel.toUpperCase());
  if (actionLabel) subtitleParts.push(actionLabel.toUpperCase());
  if (accuracyTest) subtitleParts.push(`vs. ${accuracyTest}`);
  const subtitle = [subtitleParts.join(" "), target].filter(Boolean).join(" | ");

  // Focus cost line
  const baseCost    = sys.focusCost != null ? sys.focusCost : null;
  const bonusCost   = sys.bonusCost != null ? `+${sys.bonusCost}` : null;
  const focusLine   = baseCost != null
    ? `<div class="info-dlg-meta">${game.i18n.localize("TRESPASSER.Item.FocusCost")}: ${baseCost}${bonusCost ? " " + bonusCost : ""}</div>`
    : "";

  // Phase rows
  const phases = DEED_PHASES.map(phase => {
    const fx   = sys.effects?.[phase];
    const desc = fx?.description?.trim();
    const dmg  = fx?.damage?.trim();
    const weap = fx?.appliesWeaponEffects;
    if (!desc && !dmg && !weap) return "";

    const label = game.i18n.localize(PHASE_LABELS[phase]) || phase;
    let body = "";
    if (desc) body += `<span class="info-dlg-desc">${esc(desc)}</span>`;
    if (dmg)  body += `<span class="info-dlg-sub"> — ${esc(dmg)}</span>`;
    if (weap) body += `<span class="info-dlg-sub"> (${game.i18n.localize("TRESPASSER.Item.WeaponEffects")})</span>`;
    return `<div class="info-dlg-phase"><span class="info-dlg-phase-label">${esc(label)}:</span> ${body}</div>`;
  }).filter(Boolean).join("");

  return `
    <div class="item-info-card deed">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${subtitle ? `<div class="info-dlg-subtitle">${esc(subtitle)}</div>` : ""}
      ${focusLine}
      ${phases ? `<div class="info-dlg-phases">${phases}</div>` : ""}
    </div>`;
}
