/**
 * Ammo Selection Dialog
 * Usage: showAmmoDialog(ammoItems, weapon) → Promise<string|null>
 *
 * Returns the selected ammo item ID, or null if cancelled.
 */

export function showAmmoDialog(ammoItems, weapon) {
  return new Promise((resolve) => {
    const options = ammoItems.map(a => `<option value="${a.id}">${a.name} (Qty: ${a.system.quantity ?? 1})</option>`).join("");
    new Dialog({
      title: game.i18n.localize("TRESPASSER.Dialog.Ammo.SelectTitle"),
      content: `
        <div class="trespasser-dialog-content">
          <p>${game.i18n.format("TRESPASSER.Dialog.Ammo.ChooseRef", { name: weapon.name })}</p>
          <div class="form-group" style="margin-top:10px;">
            <select id="ammo-select">${options}</select>
          </div>
        </div>`,
      buttons: {
        use: {
          label:    game.i18n.localize("TRESPASSER.Dialog.Ammo.Use"),
          callback: (html) => resolve(html.find("#ammo-select").val())
        },
        cancel: {
          label:    game.i18n.localize("TRESPASSER.Dialog.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "use",
      close: () => resolve(null)
    }, { classes: ["trespasser", "dialog"] }).render(true);
  });
}
