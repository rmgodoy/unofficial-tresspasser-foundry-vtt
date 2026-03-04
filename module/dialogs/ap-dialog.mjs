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
        <select id="ap-spent" style="width: 100%;">
          ${Array.from({ length: availableAP }, (_, i) => i + 1).map(val => {
            const bonus = (val - 1) * 2;
            const label = val === 1 
              ? game.i18n.localize("TRESPASSER.Dialog.SpendAP.DefaultOption") 
              : game.i18n.format("TRESPASSER.Dialog.SpendAP.AdditionalOption", { count: val, bonus: bonus });
            return `<option value="${val}">${label}</option>`;
          }).join("")}
        </select>
      </div>
      <p id="ap-bonus-preview" style="margin-top: 5px; font-style: italic; font-size: 0.9em; color: var(--trp-gold-bright);">
        ${game.i18n.format("TRESPASSER.Dialog.SpendAP.Bonus", { bonus: 0 })}
      </p>
    </div>
    <script>
      document.getElementById("ap-spent").addEventListener("change", (ev) => {
        const val = parseInt(ev.target.value);
        const bonus = (val - 1) * 2;
        document.getElementById("ap-bonus-preview").innerText = game.i18n.format("TRESPASSER.Dialog.SpendAP.Bonus", { bonus: bonus });
      });
    </script>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize("TRESPASSER.Dialog.SpendAP.Title"),
      content,
      buttons: {
        confirm: {
          label: game.i18n.localize("TRESPASSER.Dialog.SpendAP.Confirm"),
          callback: (html) => resolve(parseInt(html.find("#ap-spent").val()))
        },
        cancel: {
          label: game.i18n.localize("TRESPASSER.Dialog.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm"
    }, { classes: ["trespasser", "dialog"] }).render(true);
  });
}
