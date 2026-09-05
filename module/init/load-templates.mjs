/**
 * Preload Handlebars partial templates for Trespasser.
 */
export async function preloadHandlebarsTemplates() {
  return foundry.applications.handlebars.loadTemplates([
    "systems/trespasser/templates/actor/parts/deed-list.hbs",
    "systems/trespasser/templates/actor/parts/combat-effects.hbs",
    "systems/trespasser/templates/actor/parts/clock.hbs",
    "systems/trespasser/templates/actor/parts/plights-lasting-states.hbs",
    "systems/trespasser/templates/actor/parts/inventory-card.hbs",
    "systems/trespasser/templates/item/parts/effect-chip.hbs",
    "systems/trespasser/templates/item/parts/effects-list.hbs",
    "systems/trespasser/templates/item/parts/deeds-list.hbs",
    "systems/trespasser/templates/chat/deed-card.hbs",
    "systems/trespasser/templates/combat/combat-tracker.hbs",
    // Party template
    "systems/trespasser/templates/actor/party-sheet.hbs",
    // Companion template
    "systems/trespasser/templates/actor/companion-sheet.hbs",
    // Dungeon exploration templates
    "systems/trespasser/templates/dungeon/dungeon-tabs.hbs",
    "systems/trespasser/templates/dungeon/dungeon-overview.hbs",
    "systems/trespasser/templates/dungeon/dungeon-rooms.hbs",
    "systems/trespasser/templates/dungeon/dungeon-log.hbs",
    "systems/trespasser/templates/dungeon/dungeon-notes.hbs",
    // Region templates
    "systems/trespasser/templates/region/region-tabs.hbs",
    "systems/trespasser/templates/region/region-overview.hbs",
    "systems/trespasser/templates/region/region-log.hbs",
    "systems/trespasser/templates/region/region-notes.hbs",
    "systems/trespasser/templates/exploration/dungeon-tracker.hbs",
    "systems/trespasser/templates/exploration/travel-tracker.hbs",
    "systems/trespasser/templates/exploration/haven-tracker.hbs",
    "systems/trespasser/templates/item/room-sheet.hbs",
    "systems/trespasser/templates/item/terrain/header.hbs",
    "systems/trespasser/templates/item/terrain/tabs.hbs",
    "systems/trespasser/templates/item/terrain/details.hbs",
    "systems/trespasser/templates/item/terrain/behaviors.hbs",
    "systems/trespasser/templates/hud/region-hud.hbs",
    "systems/trespasser/templates/dialogs/non-combat-spark.hbs",
    "systems/trespasser/templates/dialogs/non-combat-shadow.hbs",
    "systems/trespasser/templates/item/deed/behavior-params.hbs",
    "systems/trespasser/templates/chat/treasure-card.hbs",
    "systems/trespasser/templates/dialogs/treasure-dialog.hbs"
  ]);
}
