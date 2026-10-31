/**
 * Rest Dialog
 * Usage: showRestDialog(actor, handleRestActionFn)
 *
 * Displays three separated rest columns (Moment / Night / Week), each with its
 * own inputs and resource summary, and delegates the rest logic to the handler.
 */

export async function showRestDialog(actor, handleRestActionFn) {
  const rations = actor.items.filter(i => i.type === "rations");
  const rationOptions = rations
    .map(i => `<option value="${i.id}">${i.name} (${i.system.depletionDie})</option>`)
    .join("");

  const recoverableItems = actor.items.filter(
    i => ["deed", "talent"].includes(i.type) && ((i.system.bonusCost || 0) > 0 || (i.system.uses || 0) > 0)
  );
  const itemOptions = recoverableItems
    .map(i => `<option value="${i.id}">${i.name} (+${i.system.bonusCost || 0})</option>`)
    .join("");

  const noFoodLabel = game.i18n.localize("TRESPASSER.Sheet.Rest.NoFoodPenalty");
  const noneChoiceLabel = game.i18n.localize("TRESPASSER.Sheet.Rest.NoneChoice");
  const foodLabel = game.i18n.localize("TRESPASSER.Sheet.Rest.FoodEat");

  const content = `
    <div class="rest-dialog-form">
      <div class="rest-sections">
        <div class="rest-card-section">
          <h4 class="rest-card-title">${game.i18n.localize("TRESPASSER.Sheet.Rest.Moment")}</h4>
          <div class="rest-card-body">
            <div class="form-group">
              <label>${foodLabel}</label>
              <select name="moment-food-id">
                <option value="">${noFoodLabel}</option>
                ${rationOptions}
              </select>
            </div>

            <div class="form-group">
              <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.RDSpend")}</label>
              <input type="number" name="moment-rd-spend" value="0" min="0" max="${actor.system.recovery_dice}" />
            </div>

            <div class="form-group">
              <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.RecoverItem1")}</label>
              <select name="moment-recover-1">
                <option value="">${noneChoiceLabel}</option>
                ${itemOptions}
              </select>
            </div>

            <div class="form-group">
              <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.RecoverItem2")}</label>
              <select name="moment-recover-2">
                <option value="">${noneChoiceLabel}</option>
                ${itemOptions}
              </select>
            </div>
          </div>
        </div>

        <div class="rest-card-section">
          <h4 class="rest-card-title">${game.i18n.localize("TRESPASSER.Sheet.Rest.Night")}</h4>
          <div class="rest-card-body">
            <div class="form-group">
              <label>${foodLabel}</label>
              <select name="night-food-id">
                <option value="">${noFoodLabel}</option>
                ${rationOptions}
              </select>
            </div>

            <div class="rest-effects-summary">
              <div class="rest-effect-tag">${game.i18n.localize("TRESPASSER.Sheet.Rest.EffectHPFull")}</div>
              <div class="rest-effect-tag">${game.i18n.localize("TRESPASSER.Sheet.Rest.EffectRDEndurance")}</div>
              <div class="rest-effect-tag">${game.i18n.localize("TRESPASSER.Sheet.Rest.EffectResetDeeds")}</div>
            </div>
          </div>
        </div>

        <div class="rest-card-section">
          <h4 class="rest-card-title">${game.i18n.localize("TRESPASSER.Sheet.Rest.Week")}</h4>
          <div class="rest-card-body">
            <div class="rest-effects-summary">
              <div class="rest-effect-tag">${game.i18n.localize("TRESPASSER.Sheet.Rest.EffectEnduranceFull")}</div>
              <div class="rest-effect-tag">${game.i18n.localize("TRESPASSER.Sheet.Rest.EffectHPFull")}</div>
              <div class="rest-effect-tag">${game.i18n.localize("TRESPASSER.Sheet.Rest.EffectRDFull")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  await foundry.applications.api.DialogV2.wait({
    window: {
      title: `${game.i18n.localize("TRESPASSER.Sheet.Rest.Title")} — ${actor.name}`,
      width: 720
    },
    classes: ["trespasser", "dialog", "rest-dialog"],
    content,
    buttons: [
      {
        action: "moment",
        label: game.i18n.localize("TRESPASSER.Sheet.Rest.Moment"),
        callback: async (event, button) => {
          const form = button.form;
          const foodId   = form.elements["moment-food-id"]?.value || "";
          const rdSpend  = parseInt(form.elements["moment-rd-spend"]?.value) || 0;
          const recover1 = form.elements["moment-recover-1"]?.value || "";
          const recover2 = form.elements["moment-recover-2"]?.value || "";
          await handleRestActionFn("moment", { foodId, rdSpend, recover1, recover2 });
        }
      },
      {
        action: "night",
        label: game.i18n.localize("TRESPASSER.Sheet.Rest.Night"),
        callback: async (event, button) => {
          const form = button.form;
          const foodId = form.elements["night-food-id"]?.value || "";
          await handleRestActionFn("night", { foodId });
        }
      },
      {
        action: "week",
        label: game.i18n.localize("TRESPASSER.Sheet.Rest.Week"),
        callback: async () => {
          await handleRestActionFn("week", {});
        }
      }
    ],
    rejectClose: false
  });
}
