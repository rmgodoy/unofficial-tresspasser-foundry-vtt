/**
 * Shared dialog for spending extra Action Points for a bonus.
 * @param {number} availableAP - The number of AP currently available.
 * @returns {Promise<number|null>} - Resolves to the number of AP spent, or null if cancelled.
 */
export async function askAPDialog(availableAP) {
  const content = `
    <div class="trespasser-dialog ap-dialog">
      <p>${game.i18n.localize("TRESPASSER.Dialog.SpendAP.Question")}</p>
      <div class="form-group" style="margin-top: 10px;">
        <label>${game.i18n.format("TRESPASSER.Dialog.SpendAP.Available", { count: availableAP })}</label>
        <select name="ap-spent" style="width: 100%;">
          ${Array.from({ length: availableAP }, (_, i) => i + 1).map(val => {
            const bonus = (val - 1) * 2;
            const label = val === 1 
              ? game.i18n.localize("TRESPASSER.Dialog.SpendAP.DefaultOption")
              : game.i18n.format("TRESPASSER.Dialog.SpendAP.AdditionalOption", { count: val, bonus: bonus });
            return `<option value="${val}">${label}</option>`;
          }).join("")}
        </select>
      </div>
      <p class="ap-bonus-preview" style="margin-top: 5px; font-style: italic; font-size: var(--fs-13); color: var(--trp-gold-bright);">
        ${game.i18n.format("TRESPASSER.Dialog.SpendAP.Bonus", { bonus: 0 })}
      </p>
    </div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("TRESPASSER.Dialog.SpendAP.Title") },
    classes: ["trespasser", "dialog"],
    content,
    render: (event, dialog) => {
      const el = dialog.element;
      const select = el.querySelector('[name="ap-spent"]');
      const preview = el.querySelector(".ap-bonus-preview");
      if (select && preview) {
        select.addEventListener("change", () => {
          const val = parseInt(select.value);
          const bonus = (val - 1) * 2;
          preview.textContent = game.i18n.format("TRESPASSER.Dialog.SpendAP.Bonus", { bonus });
        });
      }
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm"),
        default: true,
        callback: (event, button) => parseInt(button.form.elements["ap-spent"].value)
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
