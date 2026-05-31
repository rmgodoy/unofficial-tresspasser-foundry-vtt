/**
 * Oil Application Dialog
 * Usage: showOilDialog(weapons, oilItem) → Promise<string|null>
 *
 * Returns the selected weapon item ID, or null if cancelled.
 */

export async function showOilDialog(weapons, oilItem) {
  const options = weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
  const content = `
    <div class="trespasser-dialog-content">
      <p>${game.i18n.format("TRESPASSER.Dialog.ApplyOil.Prompt", { name: oilItem.name })}</p>
      <div class="form-group" style="margin-top:10px;">
        <label>${game.i18n.localize("TRESPASSER.Terms.ItemType.Weapon")}:</label>
        <select name="weapon-select">${options}</select>
      </div>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Dialog.ApplyOil.Title") },
    classes: ["trespasser", "dialog"],
    content,
    buttons: [
      {
        action: "apply",
        label: game.i18n.localize("TRESPASSER.Dialog.Common.Apply"),
        default: true,
        callback: (event, button) => button.form.elements["weapon-select"].value
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
