/**
 * Character Sheet — Misc handlers
 * buildClockSegments (re-exported from get-data), onInjuryClockClick, onToggleLight, onSpendRDHeader
 */

export { buildClockSegments } from "./get-data.mjs";

export async function onInjuryClockClick(event, sheet, target) {
  event.preventDefault();
  event.stopPropagation();
  const el     = target;
  const item   = sheet.actor.items.get(el.dataset.itemId);
  if (!item) return;

  const total  = item.system.injuryClock;
  const cur    = item.system.currentClock;
  const idx    = parseInt(el.dataset.index);
  const newVal = (cur === idx + 1) ? idx : Math.min(idx + 1, total);
  await item.update({ "system.currentClock": newVal });
}

export async function onToggleLight(event, sheet, target) {
  event.preventDefault();
  const el   = target.closest("[data-item-id]");
  const item = sheet.actor.items.get(el.dataset.itemId);
  if (!item) return;

  const newState = !item.system.active;

  if (newState && item.system.usesFuel) {
    const fuels = sheet.actor.items.filter(i => i.system.isLightFuel);

    if (fuels.length === 0) {
      ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.NoFuelAvailable") || "No light fuel available in inventory.");
      return;
    }

    let selectedFuelId;
    if (fuels.length === 1) {
      selectedFuelId = fuels[0].id;
    } else {
      selectedFuelId = await new Promise((resolve) => {
        const options = fuels.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
        new Dialog({
          title: game.i18n.localize("TRESPASSER.Dialog.Fuel.SelectTitle"),
          content: `
            <div class="trespasser-dialog-content">
              <p>${game.i18n.format("TRESPASSER.Dialog.Fuel.ChooseRef", { name: item.name })}</p>
              <div class="form-group" style="margin-top:10px;">
                <select id="fuel-select">${options}</select>
              </div>
            </div>`,
          buttons: {
            use:    { label: game.i18n.localize("TRESPASSER.Dialog.Fuel.Use"),    callback: (html) => resolve(html.find("#fuel-select").val()) },
            cancel: { label: game.i18n.localize("TRESPASSER.Dialog.Cancel"),      callback: () => resolve(null) }
          },
          default: "use",
          close: () => resolve(null)
        }, { classes: ["trespasser", "dialog"] }).render(true);
      });
    }

    if (!selectedFuelId) return;

    const fuelItem = sheet.actor.items.get(selectedFuelId);
    if (fuelItem) {
      ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.FuelConsumed", { name: fuelItem.name }) || `Consumed ${fuelItem.name} to light the source.`);
      const currentQty = fuelItem.system.quantity ?? 1;
      if (currentQty > 1) await fuelItem.update({ "system.quantity": currentQty - 1 });
      else                 await fuelItem.delete();
    }
  }

  await item.update({ "system.active": newState });
  if (sheet.actor._syncTokenLight) await sheet.actor._syncTokenLight();
}

export async function onSpendRDHeader(event, sheet) {
  event.preventDefault();
  const currentRD = sheet.actor.system.recovery_dice || 0;
  if (currentRD <= 0) { ui.notifications.warn("No Recovery Dice available."); return; }

  new Dialog({
    title: "Spend Recovery Dice",
    content: `
      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Sheet.Rest.RDHowMany")}</label>
        <input type="number" id="spend-rd-count" value="1" min="1" max="${currentRD}" />
        <p class="notes">${game.i18n.localize("TRESPASSER.Sheet.Rest.RDDialogNote")}</p>
      </div>`,
    buttons: {
      ok: {
        label: "Spend",
        callback: async (html) => {
          const count     = parseInt(html.find("#spend-rd-count").val()) || 0;
          const available = sheet.actor.system.recovery_dice || 0;
          if (count > available) {
            ui.notifications.error(game.i18n.format("TRESPASSER.Notifications.CannotSpendRD", { count, available }));
            return;
          }
          if (count > 0) await sheet._spendRDAndRoll(count);
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "ok"
  }, { classes: ["trespasser", "dialog"] }).render(true);
}
