/**
 * Oil Application Dialog
 * Usage: showOilDialog(weapons, oilItem) → Promise<string|null>
 *
 * Returns the selected weapon item ID, or null if cancelled.
 */

export function showOilDialog(weapons, oilItem) {
  return new Promise((resolve) => {
    const options = weapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
    new Dialog({
      title: game.i18n.localize("TRESPASSER.Dialog.ApplyOil.Title"),
      content: `
        <div class="trespasser-dialog-content">
          <p>${game.i18n.format("TRESPASSER.Dialog.ApplyOil.ChooseRef", { name: oilItem.name })}</p>
          <div class="form-group" style="margin-top:10px;">
            <label>${game.i18n.localize("TRESPASSER.Dialog.ApplyOil.Weapon")}</label>
            <select id="weapon-select">${options}</select>
          </div>
        </div>`,
      buttons: {
        apply: {
          label:    game.i18n.localize("TRESPASSER.Dialog.ApplyOil.Apply"),
          callback: (html) => resolve(html.find("#weapon-select").val())
        },
        cancel: {
          label:    game.i18n.localize("TRESPASSER.Dialog.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "apply",
      close: () => resolve(null)
    }, { classes: ["trespasser", "dialog"] }).render(true);
  });
}
