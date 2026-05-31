/**
 * Rest Dialog
 * Usage: showRestDialog(actor, handleRestActionFn)
 *
 * Displays the rest type chooser (Moment / Night / Week) and delegates
 * the actual rest logic to the provided handler function.
 */

export async function showRestDialog(actor, handleRestActionFn) {
  const rations = actor.items.filter(i => i.type === "rations");
  const rationOptions = rations.map(i => `<option value="${i.id}">${i.name} (${i.system.depletionDie})</option>`).join("");

  const recoverableItems = actor.items.filter(i => ["deed", "talent"].includes(i.type) && (i.system.bonusCost || 0) > 0);
  const itemOptions = recoverableItems.map(i => `<option value="${i.id}">${i.name} (Cost: +${i.system.bonusCost})</option>`).join("");

  const content = `
    <div class="rest-dialog-form">
      <p style="text-align:center;margin-bottom:12px;">${game.i18n.format("TRESPASSER.Sheet.Rest.ApplyFor", { name: actor.name })}</p>

      <div class="rest-grid">
        <div class="rest-col">
          <div class="form-group">
            <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.FoodEat")}</label>
            <select name="rest-food-id">
              <option value="">${game.i18n.localize("TRESPASSER.Sheet.Rest.NoneNoFood")}</option>
              ${rationOptions}
            </select>
            <p class="notes">${game.i18n.localize("TRESPASSER.Sheet.Rest.IfNoneEndurance")}</p>
          </div>

          <div class="form-group">
            <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.RDSpendMoment")}</label>
            <input type="number" name="rest-rd-spend" value="0" min="0" max="${actor.system.recovery_dice}" />
            <p class="notes">${game.i18n.localize("TRESPASSER.Sheet.Rest.RDRecoverNote")}</p>
          </div>
        </div>

        <div class="rest-col">
          <div class="form-group">
            <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.ReduceRecoverChoice1")}</label>
            <select name="rest-recover-1">
              <option value="">${game.i18n.localize("TRESPASSER.Sheet.Rest.NoneChoice")}</option>
              ${itemOptions}
            </select>
          </div>

          <div class="form-group">
            <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.ReduceRecoverChoice2")}</label>
            <select name="rest-recover-2">
              <option value="">${game.i18n.localize("TRESPASSER.Sheet.Rest.NoneChoice")}</option>
              ${itemOptions}
            </select>
            <p class="notes">${game.i18n.localize("TRESPASSER.Sheet.Rest.ChoiceTwiceNote")}</p>
          </div>
        </div>
      </div>
    </div>`;

  await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("TRESPASSER.Sheet.Rest.Title"),
      width: 650
    },
    classes: ["trespasser", "dialog", "rest-dialog"],
    content,
    buttons: [
      {
        action: "moment",
        label: game.i18n.localize("TRESPASSER.Sheet.Rest.Moment"),
        icon: "fas fa-hourglass-start",
        callback: async (event, button) => {
          const form = button.form;
          const foodId   = form.elements["rest-food-id"].value;
          const rdSpend  = parseInt(form.elements["rest-rd-spend"].value) || 0;
          const recover1 = form.elements["rest-recover-1"].value;
          const recover2 = form.elements["rest-recover-2"].value;
          await handleRestActionFn("moment", { foodId, rdSpend, recover1, recover2 });
        }
      },
      {
        action: "night",
        label: game.i18n.localize("TRESPASSER.Sheet.Rest.Night"),
        icon: "fas fa-moon",
        callback: async (event, button) => {
          const form = button.form;
          const foodId = form.elements["rest-food-id"].value;
          await handleRestActionFn("night", { foodId });
        }
      },
      {
        action: "week",
        label: game.i18n.localize("TRESPASSER.Sheet.Rest.Week"),
        icon: "fas fa-calendar-week",
        callback: async () => {
          await handleRestActionFn("week", {});
        }
      }
    ],
    rejectClose: false
  });
}
