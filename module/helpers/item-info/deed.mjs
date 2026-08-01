import { esc } from "./utils.mjs";
import { formatBDeedTarget } from "../deed-display-helper.mjs";

const DEED_PHASES = ["start", "before", "base", "hit", "spark", "after", "end"];

const PHASE_LABELS = {
  start:  "TRESPASSER.Sheet.Deed.Phase.Start",
  before: "TRESPASSER.Sheet.Deed.Phase.Before",
  base:   "TRESPASSER.Sheet.Deed.Phase.Base",
  hit:    "TRESPASSER.Sheet.Deed.Phase.Hit",
  spark:  "TRESPASSER.Sheet.Deed.Phase.Spark",
  after:  "TRESPASSER.Sheet.Deed.Phase.After",
  end:    "TRESPASSER.Sheet.Deed.Phase.End",
};

export function buildDeedContent(item) {
  const sys = item.system;

  // Subtitle: "TYPE ATTACK vs. ACCURACY | TARGET"
  const typeRaw     = sys.abilityType || sys.type || "";
  const typeKey     = typeRaw ? typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1) : "";
  const typeLabel   = typeKey ? (game.i18n.localize(`TRESPASSER.Sheet.Item.Details.TypeChoices.${typeKey}`) || typeRaw) : "";

  const actionRaw   = sys.actionType || "";
  const actionKey   = actionRaw ? actionRaw.charAt(0).toUpperCase() + actionRaw.slice(1) : "";
  const actionLabel = actionKey ? (game.i18n.localize(`TRESPASSER.Sheet.Item.Details.ActionTypeChoices.${actionKey}`) || actionRaw) : "";

  const versusRaw   = sys.versus || (sys.actionType === "support" ? "10" : (sys.accuracyTest || "Guard"));
  const versusLabel = versusRaw === "10" ? "10" : (game.i18n.localize(`TRESPASSER.Sheet.Combat.${versusRaw}`) || versusRaw);
  const vsText      = game.i18n.localize("TRESPASSER.Sheet.Combat.Vs");

  const targetLabel = formatBDeedTarget(sys);

  const subtitleParts = [];
  if (typeLabel) subtitleParts.push(typeLabel.toUpperCase());
  if (actionLabel) subtitleParts.push(actionLabel.toUpperCase());
  if (versusLabel) subtitleParts.push(`${vsText} ${versusLabel}`);
  const subtitle = [subtitleParts.join(" "), targetLabel].filter(Boolean).join(" | ");

  // Focus cost line
  const baseCost    = sys.focusCost != null ? sys.focusCost : null;
  const bonusCost   = sys.bonusCost != null ? `+${sys.bonusCost}` : null;
  const focusLine   = baseCost != null
    ? `<div class="info-dlg-meta">${game.i18n.localize("TRESPASSER.Sheet.Item.Details.FocusCost")}: ${baseCost}${bonusCost ? " " + bonusCost : ""}</div>`
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
    if (weap) body += `<span class="info-dlg-sub"> (${game.i18n.localize("TRESPASSER.Sheet.Item.Sections.WeaponEffects")})</span>`;
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
