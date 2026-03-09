/**
 * Trespasser Configuration Dialog
 * Displays a dialog to change system-wide settings.
 */

export async function showTrespasserConfigDialog() {
  const showInit = game.settings.get("trespasser", "showInitiativeInChat");
  const restrictMov = game.settings.get("trespasser", "restrictMovementAction");
  const restrictHUD = game.settings.get("trespasser", "restrictHUDActions");
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  const groupFull = game.settings.get("trespasser", "groupCheckFullParty");

  const content = `
    <form class="trespasser-config-form">
      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Config.ShowInitiativeInChat")}</label>
        <div class="form-fields">
          <input type="checkbox" name="showInitiativeInChat" ${showInit ? "checked" : ""}>
        </div>
        <p class="notes">${game.i18n.localize("TRESPASSER.Config.ShowInitiativeInChatHint")}</p>
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Config.RestrictMovementAction")}</label>
        <div class="form-fields">
          <input type="checkbox" name="restrictMovementAction" ${restrictMov ? "checked" : ""}>
        </div>
        <p class="notes">${game.i18n.localize("TRESPASSER.Config.RestrictMovementActionHint")}</p>
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Config.RestrictHUDActions")}</label>
        <div class="form-fields">
          <input type="checkbox" name="restrictHUDActions" ${restrictHUD ? "checked" : ""}>
        </div>
        <p class="notes">${game.i18n.localize("TRESPASSER.Config.RestrictHUDActionsHint")}</p>
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Config.RestrictAPFocusUsage")}</label>
        <div class="form-fields">
          <input type="checkbox" name="restrictAPFocusUsage" ${restrictAPF ? "checked" : ""}>
        </div>
        <p class="notes">${game.i18n.localize("TRESPASSER.Config.RestrictAPFocusUsageHint")}</p>
      </div>

      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Config.GroupCheckFullParty")}</label>
        <div class="form-fields">
          <input type="checkbox" name="groupCheckFullParty" ${groupFull ? "checked" : ""}>
        </div>
        <p class="notes">${game.i18n.localize("TRESPASSER.Config.GroupCheckFullPartyHint")}</p>
      </div>
    </form>`;

  new Dialog({
    title: game.i18n.localize("TRESPASSER.Config.Title"),
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: game.i18n.localize("TRESPASSER.Config.Save"),
        callback: async (html) => {
          const show = html.find('[name="showInitiativeInChat"]').is(":checked");
          const restrictM = html.find('[name="restrictMovementAction"]').is(":checked");
          const restrictH = html.find('[name="restrictHUDActions"]').is(":checked");
          const restrictA = html.find('[name="restrictAPFocusUsage"]').is(":checked");
          const groupF = html.find('[name="groupCheckFullParty"]').is(":checked");
          await game.settings.set("trespasser", "showInitiativeInChat", show);
          await game.settings.set("trespasser", "restrictMovementAction", restrictM);
          await game.settings.set("trespasser", "restrictHUDActions", restrictH);
          await game.settings.set("trespasser", "restrictAPFocusUsage", restrictA);
          await game.settings.set("trespasser", "groupCheckFullParty", groupF);
          ui.notifications.info(game.i18n.localize("TRESPASSER.Config.SavedNotice"));
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("TRESPASSER.Config.Cancel")
      }
    },
    default: "save"
  }, { classes: ["trespasser", "dialog", "config"] }).render(true);
}
