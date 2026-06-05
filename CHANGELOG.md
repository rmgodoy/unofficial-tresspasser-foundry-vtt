# Changelog

All notable changes to this project will be documented in this file.

## [0.0.8-1] - 2026-06-05

### Bug Fixes
- **PC Skill Die**: Fixed an issue where the Skill Die was not following evolution table correctly.

## [0.0.8] - 2026-05-31

### Features
- **Token Status Effects**: Added support for displaying status effects on tokens, with configuration settings to show or hide them.
- **Direct Item Creation**: Added support to create items directly from the Character inventory sheet using a new item type selection dialog.

### Improvements & Migrations
- **Defend Action**: Fixed defend action behavior and updated to v2.1.3.
- **ApplicationV2 Sheet Migration**: Migrated system sheets to Foundry's `ApplicationV2` framework, including:
  - **Actors**: Character and Creature sheets.
  - **Items**: Accessory, Armor, Calling, Craft, Features, Incantation, Injury, Item, Past Life, Rations, Room, Talents, and Weapon sheets.
- **ApplicationV2 Dialog Migration**: Migrated all 15 legacy dialogs to the modern `ApplicationsV2` framework:
  - Migrated simple dialogs (`ammo-dialog`, `oil-dialog`, `ap-dialog`, `spark-dialog`, `rest-dialog`) and sheet action dialogs to `DialogV2.wait()` / `DialogV2.confirm()`.
  - Migrated complex dialogs (`item-info-dialog`, `craft-dialog`, `calling-dialog`) to custom `ApplicationV2` subclasses with dedicated `.hbs` templates.
  - Consolidated and moved inline dialog CSS styles to the system stylesheet `styles/dialogs.css`.
  - Removed all jQuery dependencies (`html.find`) from dialog controllers and templates, replacing them with native DOM APIs.
  - Refactored sheet callers in `actor-character-sheet.mjs` to consume dialog classes directly.
- **pt-BR Terminology**: Updated Portuguese (pt-BR) translations and fixed terminology consistency across settings, sheets, chat, and dialogs.

## [0.0.7-1] - 2026-05-15

### Bug Fixes
- **Localization file paths**: Fixed issue where the paths to the language files were incorrect.

## [0.0.7] - 2026-05-15

### Features
- **Item Transfer**: Implemented transferring items via drag and drop and targeted.
- **Creature Roll Configuration**: Added a new configuration option to hide creature damage rolls.
- **Armor Restrictions**: Removed the hard restriction on the number of heavy armors and updated the limit to be based on the "Mighty" attribute.
- **Inventory Management**: Removed the restriction of unequipping items when the inventory is full.
- **Speed & Movement**: Updated the speed system to use the "Speed" and "Speed Bonus" concepts, applying the speed bonus directly to the Move action.
- **Passive States**: Implemented passive states for "Bloody" and "Encumbered" with new configuration to apply modifiers when encumbered.
- **Sparks Chat Messages**: Added dedicated chat messages for potency and impact sparks.
- **Deed Ranges**: Added a `range` attribute on Deeds specifically for creatures, and changed range restrictions to output warnings rather than hard blocks (configurable in settings).

### Improvements
- **Item Quality Terminology**: Updated terminology of qualities from "Normal" and "Fine" to "Fine" and "Superior".
- **Localization**: Major localization architecture migration, adopting a new language organization format.
- **Player-Facing Defense Refactor**: Migrated the player-facing defense roll system from document-flags to a more robust custom socket implementation.
- **Creature Terminology**: Renamed "Roll" to "Prevail" for Creatures and updated the Peril deed economy.
- **Removed Panic level from chat**: When showing Peril rolls in the chat card, the panic level is no longer shown.

### Bug Fixes
- **Targeting**: Fixed corrected range calculations for larger creatures.
- **Combat Tracker**: Fixed an issue where the Wait action would get stuck without a "next phase" button.
- **Dialogs**: Fixed the Haven skill roll dialogs.
- **UI & Sheets**: Fixed regressions on creature sheet selection options, armor placement field localization, and resolved hard-coded font-size issues.

## [0.0.6] - 2026-05-07

### Features
- **Retreat System**:
  - Added a new retreat dialog that appears at the start of combat rounds.
  - Added configuration options to toggle the retreat dialog visibility.
  - Implemented group retreat checks based on character initiative vs enemy maximums.
  - Added automatic combat termination upon a successful retreat.
  - Added "Peril" roll visibility configuration for the chat.
- **Combat Mechanics**:
  - **Player-Facing Initiative**: Implemented an option for player-facing initiative rolls.
  - **Out-of-Turn Movement**: Added a new configuration setting to control movement out of turn.
  - **Attack Range**: Added an option to disregard range constraints on attack configurations.
- **Player-Facing Defense Rolls**:
  - Implemented automated requests for players to roll their own defense during enemy attacks.
  - Parallelized defense roll requests to handle multiple targets.
  - Defense roll has a 15-minute timeout.
- **Sheet Improvements**:
  - **Deeds Sheet**: Fixed scroll behavior issues and added auto-selection for specific fields to improve usability.

### Improvements
- **System Initialization**:
  - Moved socket listeners to the `init` hook for more robust system setup.
- **Visuals**:
  - Re-added turn markers to the combat tracker for improved turn tracking.

### Bug Fixes
- **Localization**: Fixed several localization issues across English and Portuguese (pt-BR) languages.
- **General**: Various minor fixes and stability improvements.
