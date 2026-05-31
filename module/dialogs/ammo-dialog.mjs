/**
 * Ammo Selection Dialog
 * Usage: showAmmoDialog(ammoItems, weapon) → Promise<string|null>
 *
 * Returns the selected ammo item ID, or null if cancelled.
 */

export async function showAmmoDialog(ammoItems, weapon) {
  const options = ammoItems.map(a => `<option value="${a.id}">${a.name} (Qty: ${a.system.quantity ?? 1})</option>`).join("");
  const content = `
    <div class="trespasser-dialog-content">
      <p>${game.i18n.format("TRESPASSER.Dialog.Ammo.Prompt", { name: weapon.name })}</p>
      <div class="form-group" style="margin-top:10px;">
        <select name="ammo-select">${options}</select>
      </div>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Dialog.Ammo.Title") },
    classes: ["trespasser", "dialog"],
    content,
    buttons: [
      {
        action: "use",
        label: game.i18n.localize("TRESPASSER.Dialog.Ammo.Use"),
        default: true,
        callback: (event, button) => button.form.elements["ammo-select"].value
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
        callback: () => null
      }
    ],
    rejectClose: false,
    close: () => null
  });

  return result;
}
