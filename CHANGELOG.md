# Changelog

All notable changes to this project will be documented in this file.

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
