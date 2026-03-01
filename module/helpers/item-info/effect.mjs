import { esc } from "./utils.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";

export function buildEffectContent(item) {
  const sys = item.system;
  const triggerLabel = TrespasserEffectsHelper.TRIGGER_LABELS[sys.triggerWhen] 
    ? game.i18n.localize(TrespasserEffectsHelper.TRIGGER_LABELS[sys.triggerWhen]) 
    : sys.triggerWhen;

  const typeLabel = item.type.toUpperCase();
  const intensity = sys.intensity || 0;
  
  const metaParts = [
    typeLabel,
    `${game.i18n.localize("TRESPASSER.Item.int")}: ${intensity}`
  ];

  if (triggerLabel && triggerLabel !== "immediate" && triggerLabel !== "undefined") {
    metaParts.push(`${game.i18n.localize("TRESPASSER.Item.triggerWhen")}: ${triggerLabel}`);
  }

  if (sys.gmOnly) {
    metaParts.push(`<span style="color: var(--trp-red-dim);">${game.i18n.localize("TRESPASSER.Item.gmOnly")}</span>`);
  }

  if (sys.duration && sys.duration !== "indefinite") {
    const durLabel = game.i18n.localize(TrespasserEffectsHelper.DURATION_LABELS[sys.duration]) || sys.duration;
    const durPart = sys.duration === "rounds" ? `${durLabel}: ${sys.durationValue}` : durLabel;
    metaParts.push(`${game.i18n.localize("TRESPASSER.Item.duration")}: ${durPart}`);
  }

  let meta = `<div class="info-dlg-meta">${metaParts.join(" | ")}</div>`;
  
  
  if (!sys.isOnlyReminder) {
    const targetLookup = TrespasserEffectsHelper.TARGET_ATTRIBUTES[sys.targetAttribute];
    const targetLabel = targetLookup ? game.i18n.localize(targetLookup) : sys.targetAttribute;
    
    meta += `<div class="info-dlg-meta">${game.i18n.localize("TRESPASSER.Item.modifier")}: ${targetLabel}: ${sys.modifier}</div>`;
  }

  const desc = sys.description?.trim() || "";

  return `
    <div class="item-info-card effect">
      <div class="info-dlg-title">${esc(item.name)}</div>
      ${meta}
      <hr style="border: 0; border-top: 1px solid var(--trp-border-light); margin: 8px 0;" />
      ${desc ? `<div class="info-dlg-html">${desc}</div>` : `<div class="info-dlg-empty">${game.i18n.localize("TRESPASSER.Item.NoDescription")}</div>`}
    </div>`;
}
