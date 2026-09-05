/**
 * Register settings UI and configuration hooks.
 */
export function registerSettingsHooks() {
  // Listen for changes when settings config dialog closes
  Hooks.on("closeSettingsConfig", () => {
    game.trespasser?.applySystemSettings?.();
  });

  // Add Trespasser Configuration button to the settings sidebar
  Hooks.on("renderSettings", (app, html, data) => {
    const $html = $(html);
    const configBtn = $(`<button type="button" class="trespasser-config-btn">
      <i class="fas fa-cogs"></i> Trespasser Configuration
    </button>`);

    configBtn.on("click", ev => {
      ev.preventDefault();
      new game.trespasser.Config().render(true);
    });

    const setupBtn = $html.find('button[data-app="configure"]');
    if (setupBtn.length) {
      setupBtn.before(configBtn);
    } else {
      const container = $html.find(".settings-sidebar, #settings-game, #settings-access");
      if (container.length) {
        container.first().prepend(configBtn);
      }
    }
  });
}
