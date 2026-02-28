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

      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.FoodEat")}</label>
        <select id="rest-food-id">
          <option value="">${game.i18n.localize("TRESPASSER.Sheet.Rest.NoneNoFood")}</option>
          ${rationOptions}
        </select>
        <p class="notes">${game.i18n.localize("TRESPASSER.Sheet.Rest.IfNoneEndurance")}</p>
      </div>

      <div class="rest-type-specifics" id="moment-rest-extra" style="margin-top:10px;border-top:1px solid var(--trp-border);padding-top:10px;">
        <div class="form-group">
          <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.RDSpendMoment")}</label>
          <input type="number" id="rest-rd-spend" value="0" min="0" max="${actor.system.recovery_dice}" />
          <p class="notes">${game.i18n.localize("TRESPASSER.Sheet.Rest.RDRecoverNote")}</p>
        </div>

        <div class="form-group" style="margin-top:8px;">
          <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.ReduceRecoverChoice1")}</label>
          <select id="rest-recover-1">
            <option value="">${game.i18n.localize("TRESPASSER.Sheet.Rest.NoneChoice")}</option>
            ${itemOptions}
          </select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.ReduceRecoverChoice2")}</label>
          <select id="rest-recover-2">
            <option value="">${game.i18n.localize("TRESPASSER.Sheet.Rest.NoneChoice")}</option>
            ${itemOptions}
          </select>
          <p class="notes">${game.i18n.localize("TRESPASSER.Sheet.Rest.ChoiceTwiceNote")}</p>
        </div>
      </div>
    </div>`;

  new Dialog({
    title: game.i18n.localize("TRESPASSER.Sheet.Rest.TitleActions"),
    content,
    buttons: {
      moment: {
        label: `<i class="fas fa-hourglass-start"></i> ${game.i18n.localize("TRESPASSER.Sheet.Rest.Moment")}`,
        callback: async (html) => {
          const foodId   = html.find("#rest-food-id").val();
          const rdSpend  = parseInt(html.find("#rest-rd-spend").val()) || 0;
          const recover1 = html.find("#rest-recover-1").val();
          const recover2 = html.find("#rest-recover-2").val();
          await handleRestActionFn("moment", { foodId, rdSpend, recover1, recover2 });
        }
      },
      night: {
        label: `<i class="fas fa-moon"></i> ${game.i18n.localize("TRESPASSER.Sheet.Rest.Night")}`,
        callback: async (html) => {
          const foodId = html.find("#rest-food-id").val();
          await handleRestActionFn("night", { foodId });
        }
      },
      week: {
        label: `<i class="fas fa-calendar-week"></i> ${game.i18n.localize("TRESPASSER.Sheet.Rest.Week")}`,
        callback: async () => {
          await handleRestActionFn("week", {});
        }
      }
    },
    default: "moment"
  }, { classes: ["trespasser", "dialog"] }).render(true);
}
