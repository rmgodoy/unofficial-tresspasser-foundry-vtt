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
import { buildDeedContent }      from "../helpers/item-info/deed.mjs";
import { buildFeatureContent }   from "../helpers/item-info/feature.mjs";
import { buildTalentContent }    from "../helpers/item-info/talent.mjs";
import { buildGenericContent }   from "../helpers/item-info/generic.mjs";
import { buildEffectContent }    from "../helpers/item-info/effect.mjs";
import { buildEquipmentContent } from "../helpers/item-info/equipment.mjs";

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
    font-size: var(--fs-18);
    font-weight: bold;
    color: var(--trp-gold-bright);
    text-transform: uppercase;
    border-bottom: 1px solid var(--trp-gold-dim);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .info-dlg-subtitle {
    font-size: var(--fs-10);
    color: var(--trp-text-dim);
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 6px;
  }
  .info-dlg-meta {
    font-size: var(--fs-11);
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
    font-size: var(--fs-13);
    line-height: 1.4;
  }
  .info-dlg-phase-label {
    font-weight: bold;
    color: var(--trp-gold-dim);
    text-transform: uppercase;
    font-size: var(--fs-11);
  }
  .info-dlg-desc {
    color: var(--trp-text-bright);
  }
  .info-dlg-sub {
    color: var(--trp-text-dim);
    font-size: var(--fs-12);
  }
  .info-dlg-html {
    font-size: var(--fs-13);
    color: var(--trp-text);
    line-height: 1.5;
    margin-top: 6px;
  }
  .info-dlg-empty {
    font-size: var(--fs-12);
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
    case "effect":
    case "state":   bodyHTML = buildEffectContent(item);  break;
    case "weapon":
    case "armor":   bodyHTML = buildEquipmentContent(item); break;
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
