/**
 * Trespasser Configuration Dialog
 * Displays a dialog to change system-wide settings.
 */

export async function showTrespasserConfigDialog() {
  const showInit = game.settings.get("trespasser", "showInitiativeInChat");
  const restrictMov = game.settings.get("trespasser", "restrictMovementAction");

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
          const restrict = html.find('[name="restrictMovementAction"]').is(":checked");
          await game.settings.set("trespasser", "showInitiativeInChat", show);
          await game.settings.set("trespasser", "restrictMovementAction", restrict);
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
