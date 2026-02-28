/**
 * Item Info Dialog — read-only preview of any item.
 *
 * Usage: showItemInfoDialog(uuid)
 *
 * Renders a styled, non-editable view of an item so users can read
 * what it does without opening the full editable sheet.
 * The appearance mirrors the in-game card style (matching the deed card look).
 */

// ── Phase labels for deeds ────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildDeedContent(item) {
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

function buildFeatureContent(item) {
  const desc = item.system?.description?.trim() || "";
  return `
    <div class="item-info-card feature">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Item.NoDescription")}</div>`}
    </div>`;
}

function buildTalentContent(item) {
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

function buildGenericContent(item) {
  const desc = item.system?.description?.trim() || "";
  return `
    <div class="item-info-card">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Item.NoDescription")}</div>`}
    </div>`;
}

// ── Shared CSS ────────────────────────────────────────────────────────────────
const INFO_STYLE = `<style>
  .item-info-card {
    font-family: var(--trp-font-body);
    color: var(--trp-text);
    background: var(--trp-bg-dark);
    padding: 4px 2px;
  }
  .info-dlg-title {
    font-family: var(--trp-font-header);
    font-size: 18px;
    font-weight: bold;
    color: var(--trp-gold-bright);
    text-transform: uppercase;
    border-bottom: 1px solid var(--trp-gold-dim);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .info-dlg-subtitle {
    font-size: 10px;
    color: var(--trp-text-dim);
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 6px;
  }
  .info-dlg-meta {
    font-size: 11px;
    color: var(--trp-text-dim);
    margin-bottom: 6px;
  }
  .info-dlg-phases {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 6px;
  }
  .info-dlg-phase {
    font-size: 13px;
    line-height: 1.4;
  }
  .info-dlg-phase-label {
    font-weight: bold;
    color: var(--trp-gold-dim);
    text-transform: uppercase;
    font-size: 11px;
  }
  .info-dlg-desc {
    color: var(--trp-text-bright);
  }
  .info-dlg-sub {
    color: var(--trp-text-dim);
    font-size: 12px;
  }
  .info-dlg-html {
    font-size: 13px;
    color: var(--trp-text);
    line-height: 1.5;
    margin-top: 6px;
  }
  .info-dlg-empty {
    font-size: 12px;
    font-style: italic;
    color: var(--trp-text-dim);
    margin-top: 8px;
  }
</style>`;

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Show a read-only info dialog for any item by UUID.
 * @param {string} uuid  The item's UUID
 */
export async function showItemInfoDialog(uuid) {
  if (!uuid) return;
  const item = await fromUuid(uuid);
  if (!item) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Dialog.ItemNotFound"));
    return;
  }

  let bodyHTML;
  switch (item.type) {
    case "deed":    bodyHTML = buildDeedContent(item);    break;
    case "feature": bodyHTML = buildFeatureContent(item); break;
    case "talent":  bodyHTML = buildTalentContent(item);  break;
    default:        bodyHTML = buildGenericContent(item); break;
  }

  new Dialog({
    title: item.name,
    content: `${INFO_STYLE}<div style="padding:6px 4px;">${bodyHTML}</div>`,
    buttons: {
      close: {
        label: `<i class="fas fa-times"></i> ${game.i18n.localize("TRESPASSER.Dialog.Close")}`,
        callback: () => {}
      }
    },
    default: "close"
  }, {
    classes: ["trespasser", "dialog", "item-info-dialog"],
    width: 400,
    height: "auto",
    resizable: true
  }).render(true);
}
