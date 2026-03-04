/**
 * Trespasser Configuration Dialog
 * Displays a dialog to change system-wide settings.
 */

export async function showTrespasserConfigDialog() {
  const showInit = game.settings.get("trespasser", "showInitiativeInChat");

  const content = `
    <form class="trespasser-config-form">
      <div class="form-group">
        <label>${game.i18n.localize("TRESPASSER.Config.ShowInitiativeInChat")}</label>
        <div class="form-fields">
          <input type="checkbox" name="showInitiativeInChat" ${showInit ? "checked" : ""}>
        </div>
        <p class="notes">${game.i18n.localize("TRESPASSER.Config.ShowInitiativeInChatHint")}</p>
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
          await game.settings.set("trespasser", "showInitiativeInChat", show);
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
