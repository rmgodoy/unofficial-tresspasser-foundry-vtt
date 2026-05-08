/**
 * GM-only dialog to choose between continuing the round or attempting a retreat.
 */
export async function showRetreatDialog(combatInfo) {
  const label = game.i18n.localize(combatInfo.perilLabel);
  const content = `
    <div class="trespasser-dialog retreat-dialog">
      <p>${game.i18n.localize("TRESPASSER.Dialog.Retreat.Prompt")}</p>
      <div class="peril-display" style="background:var(--trp-bg-header); border:1px solid var(--trp-gold-dim); border-radius:4px; padding:10px; margin:10px 0; text-align:center;">
        <h3 style="color:var(--trp-gold-bright); margin:0;">${game.i18n.format("TRESPASSER.Dialog.Retreat.PerilDisplay", {
          total: combatInfo.perilTotal,
          label: label,
          heavy: combatInfo.heavy,
          mighty: combatInfo.mighty
        })}</h3>
      </div>
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Dialog.Retreat.Title") },
    content: content,
    buttons: [
      {
        action: "retreat",
        label: game.i18n.localize("TRESPASSER.Dialog.Retreat.ActionRetreat"),
        callback: () => "retreat"
      },
      {
        action: "continue",
        label: game.i18n.localize("TRESPASSER.Dialog.Retreat.ActionContinue"),
        default: true,
        callback: () => "continue"
      }
    ],
    classes: ["trespasser", "dialog"]
  });
}
