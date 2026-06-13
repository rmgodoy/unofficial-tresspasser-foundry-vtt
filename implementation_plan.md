# Overland Travel Tracker

Implement a Travel Tracker for overland hex travel in Trespasser, mirroring the Dungeon Tracker's architecture. The Travel Tracker manages day-by-day travel across regions with hostility tiers, weather conditions, terrain costs, wayfinding checks, camp activities (with socket-based player selection), and encounter resolution.

## Design Decisions (From Interview)

| Decision | Choice |
|---|---|
| Data model | New **`region`** actor type (mirrors `dungeon` actor) |
| Time model | Day-based rounds, 3 action slots: **Morning / Evening / Night** |
| Travel actions | **Advance**, **Camp**, **Night's Rest** |
| Camp flow | Hybrid socket: GM initiates → players pick camp activity via dialog → GM can override AFK players → posts to chat → consumes action |
| Camp participants | Party members from the party actor |
| Hex tracking | Track travel points (6 per advance), GM adjusts via +/- or terrain cost buttons |
| Encounter checks | On both **Advance** and **Night's Rest**; Night's Rest includes "Keeping Watch?" toggle |
| Wayfinding | Chat prompt for INTELLECT \| NATURE check; GM resolves manually by adjusting travel points |
| Disorientation | Persistent flag on region; auto-prompts wayfinding each advance until cleared |
| Weather | Dropdown on tracker: **Clear / Poor / Extreme**; affects travel point costs |
| Road toggle | "On Road" toggle: base cost = 1, wayfinding skipped |
| Endurance/rations | Chat reminders only (no automation) |
| Mounts | Not tracked (GM handles narratively) |
| Encounter resolution | Refactor `encounter-resolution.mjs` to be generic (dungeon + travel) |
| Region sheet | Full dedicated sheet with hostility, weather, terrain, encounter table, description, notes, map image |
| Watch duty | Simple yes/no toggle |
| Night's Rest output | Just a chat message saying Night's Rest was chosen |
| Travel log | Day-by-day log (last 5 entries in tracker, full on sheet) |
| Session lifecycle | Same idle → active ↔ paused → idle; travel and dungeon coexist (travel pauses when dungeon starts) |
| GM/Player views | GM: full controls; Players: day, weather, time of day, travel points |
| Launch | Scene control button with compass icon (`fa-compass`) |

---

## Proposed Changes

### Data Layer

#### [NEW] [actor-region.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/data/actor-region.mjs)

`TrespasserRegionData` extending `TypeDataModel`. Schema:

```js
{
  // Region configuration (set on sheet)
  hostilityTier: NumberField({ initial: 1, min: 0, max: 5 }),
  weather: StringField({ initial: "clear", choices: ["clear", "poor", "extreme"] }),
  defaultTerrain: StringField({ initial: "flat", choices: ["flat", "mixed", "rough"] }),
  encounterTableId: StringField({ initial: "" }),
  mapImage: StringField({ initial: "" }),
  description: HTMLField({ initial: "" }),
  notes: HTMLField({ initial: "" }),

  // Session state (managed by tracker at runtime)
  sessionState: StringField({ initial: "idle", choices: ["idle", "active", "paused"] }),
  currentDay: NumberField({ initial: 0, min: 0 }),
  currentPeriod: StringField({ initial: "morning", choices: ["morning", "evening", "night"] }),
  travelPointsRemaining: NumberField({ initial: 6, min: 0 }),
  onRoad: BooleanField({ initial: false }),
  isDisoriented: BooleanField({ initial: false }),
  keepingWatch: BooleanField({ initial: false }),
  
  // Day log
  dayLog: ArrayField(SchemaField({
    day: NumberField({ integer: true }),
    action: StringField(),
    detail: StringField({ initial: "" })
  }))
}
```

---

### Config

#### [NEW] [travel-config.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/config/travel-config.mjs)

Travel-specific constants:

```js
{
  travelPointsPerAdvance: 6,
  terrainCosts: {
    flat: { cost: 1, label: "...", examples: "Desert, Plains, Woodland" },
    mixed: { cost: 2, label: "...", examples: "Forest, Hill, Swampland" },
    rough: { cost: 3, label: "...", examples: "Caves, Mountains" }
  },
  weatherModifiers: {
    clear: { extraCost: 0, label: "..." },
    poor: { extraCost: 1, label: "...", examples: "Heat wave, heavy rain, snow" },
    extreme: { extraCost: 2, label: "...", examples: "Blizzard, sandstorm" }
  },
  periods: {
    morning: { label: "...", icon: "fa-sun" },
    evening: { label: "...", icon: "fa-cloud-sun" },
    night: { label: "...", icon: "fa-moon" }
  },
  travelActions: {
    advance: { label: "...", icon: "fa-solid fa-route", description: "..." },
    camp: { label: "...", icon: "fa-solid fa-campground", description: "..." },
    nightsRest: { label: "...", icon: "fa-solid fa-bed", description: "..." }
  },
  campActivities: {
    assist: { ... }, campAlchemy: { ... }, cook: { ... }, craft: { ... },
    forage: { ... }, fish: { ... }, hunt: { ... }, liftSpirits: { ... },
    prepareTorches: { ... }, pursue: { ... }, restEarly: { ... },
    salvage: { ... }, scout: { ... }, survey: { ... }
  },
  // Reuses dungeon hostilityTiers from DUNGEON_CONFIG
}
```

---

### Encounter Resolution (Refactor)

#### [MODIFY] [encounter-resolution.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/exploration/encounter-resolution.mjs)

Parameterize `resolveEndOfRound()` and `runEncounterCheck()` to accept a generic exploration context instead of assuming a dungeon actor:

- Extract `getHostilityTier(actor)` utility that works for both `dungeon` and `region` actor types
- Add a `context` parameter: `{ type: "dungeon"|"travel", actor, label }` so chat cards reference the right context
- Keep existing dungeon behavior unchanged; travel calls pass `type: "travel"`
- For travel, the check is **d10 vs hostility tier** (not vs alarm), so parameterize the check target

---

### Travel Tracker (Core)

#### [NEW] [travel-tracker.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/exploration/travel-tracker.mjs)

Singleton `TravelTracker` class extending `HandlebarsApplicationMixin(ApplicationV2)`. Architecture mirrors [dungeon-tracker.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/exploration/dungeon-tracker.mjs):

**Lifecycle:**
- Singleton pattern with `getInstance()` and `launch()`
- Session states: idle → active ↔ paused → idle
- On construction, adopts active/paused region actors
- Travel and dungeon sessions coexist; starting a dungeon pauses travel

**Actions (GM-only):**
- `chooseRegion` / `switchRegion` — region picker (idle state)
- `startSession` / `resumeSession` / `endSession` — lifecycle
- `performAdvance` — starts advance flow: prompts wayfinding (if not on road/not returning), gives 6 travel points, triggers hostility check
- `performCamp` — starts camp flow: sends socket to players for activity selection, GM sees pending/override UI
- `performNightsRest` — asks "Keeping Watch?", posts chat message, triggers hostility check (auto-ambush if no watch)
- `adjustTravelPoints` — +/- nudgers
- `toggleRoad` — "On Road" toggle
- `setWeather` — weather dropdown
- `nextDay` — advance to next day, reset period to morning
- `clearDisorientation` — remove disoriented flag

**Context Prep:**
- Session state, region info, hostility tier
- Current day, period, travel points (with pip display)
- Weather, road status, disorientation warning
- Terrain cost reference table (affected by weather)
- Day log (last 5 entries)
- GM: action buttons, nudgers, overrides
- Player: day, period, weather, travel points

**Hooks:**
- `updateActor` — re-render on region changes
- `renderSceneControls` — add compass icon button

---

### Camp Activity Flow (Socket)

#### [NEW] [camp-activity-handler.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/exploration/camp-activity-handler.mjs)

Handles the multi-step camp activity selection:

1. **GM initiates**: `TravelTracker` calls `startCampSelection(regionActor)`
2. **Socket emission**: `CAMP_ACTIVITY_REQUEST` sent to all clients with party member IDs
3. **Player dialog**: Each player whose character is in the party sees a dialog listing camp activities. They pick one and confirm → `CAMP_ACTIVITY_RESPONSE` emitted
4. **GM tracker updates**: Shows which players have responded and their choices. GM can override any player's choice.
5. **GM confirms**: Once all selections are in (or GM overrides remaining), clicks "Confirm Camp" → posts chat card with all selections → consumes the action
6. **Cancel**: GM can cancel, returning to action selection without consuming an action

Socket messages to add to [socket.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/socket/socket.mjs):
- `CAMP_ACTIVITY_REQUEST`
- `CAMP_ACTIVITY_RESPONSE`
- `CAMP_ACTIVITY_CANCEL`
- `CAMP_ACTIVITY_CONFIRM`

---

### Region Actor Sheet

#### [NEW] [actor-region-sheet.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/sheets/actor-region-sheet.mjs)

AppV2 sheet mirroring [actor-dungeon-sheet.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/sheets/actor-dungeon-sheet.mjs) with tabs:

- **Overview**: Region name, portrait, hostility tier, default terrain, weather, map image, description
- **Log**: Full day log (reversed chronological)
- **Notes**: GM notes (rich text editor)

Actions: encounter table drag-and-drop, create/remove encounter table, reset region, roll encounter table.

---

### Templates

#### [NEW] `templates/exploration/travel-tracker.hbs`
Travel Tracker UI template. Structure mirrors [dungeon-tracker.hbs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/templates/exploration/dungeon-tracker.hbs):
- Idle state: region picker
- Active/Paused: header, status bar (day/period/travel points/weather), action buttons, terrain reference, day log
- Camp pending state: shows player selections and override controls

#### [NEW] `templates/region/region-overview.hbs`
#### [NEW] `templates/region/region-tabs.hbs`
#### [NEW] `templates/region/region-log.hbs`
#### [NEW] `templates/region/region-notes.hbs`

#### [NEW] `templates/dialogs/camp-activity-dialog.hbs`
Player-facing dialog for camp activity selection. Shows list of camp activities with icons, descriptions, and a confirm button.

---

### Styles

#### [NEW] [travel.css](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/styles/travel.css)

Travel Tracker and Region Sheet styles. Reuses dungeon CSS patterns:
- Same panel/inner-block system
- Same color variables
- Travel-specific: period indicators (sun/moon icons), weather badges, terrain cost table, disorientation warning banner, camp selection grid

---

### System Registration

#### [MODIFY] [trespasser.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/trespasser.mjs)

- Import `TrespasserRegionData`, `TrespasserRegionSheet`, `TravelTracker`, `registerTravelTrackerHooks`, `TRAVEL_CONFIG`
- Register `CONFIG.Actor.dataModels.region = TrespasserRegionData`
- Register region sheet for `types: ["region"]`
- Add `CONFIG.TRESPASSER.travel = TRAVEL_CONFIG`
- Call `registerTravelTrackerHooks()` during init
- Expose `game.trespasser.TravelTracker = TravelTracker`
- Load travel tracker and region template partials

#### [MODIFY] [socket.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/socket/socket.mjs)

- Import camp activity handlers
- Add `CAMP_ACTIVITY_REQUEST`, `CAMP_ACTIVITY_RESPONSE`, `CAMP_ACTIVITY_CANCEL`, `CAMP_ACTIVITY_CONFIRM` cases to `_onMessage` switch

#### [MODIFY] [trespasser.css](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/styles/trespasser.css)

- Import `travel.css`

---

### Localization

#### [MODIFY] [en.json](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/lang/en.json)

Add `TRESPASSER.App.TravelTracker.*`, `TRESPASSER.Sheet.Region.*`, `TRESPASSER.Terms.Travel.*`, `TRESPASSER.Chat.Travel.*`, `TRESPASSER.Dialog.Camp.*` keys.

---

## File Summary

| File | Action | Description |
|---|---|---|
| `module/data/actor-region.mjs` | NEW | Region actor data model |
| `module/config/travel-config.mjs` | NEW | Travel constants (terrain, weather, actions, camp activities) |
| `module/exploration/travel-tracker.mjs` | NEW | Travel Tracker AppV2 singleton |
| `module/exploration/camp-activity-handler.mjs` | NEW | Socket-based camp activity selection flow |
| `module/sheets/actor-region-sheet.mjs` | NEW | Region actor sheet (AppV2) |
| `templates/exploration/travel-tracker.hbs` | NEW | Travel Tracker template |
| `templates/region/region-overview.hbs` | NEW | Region sheet overview tab |
| `templates/region/region-tabs.hbs` | NEW | Region sheet tabs |
| `templates/region/region-log.hbs` | NEW | Region sheet log tab |
| `templates/region/region-notes.hbs` | NEW | Region sheet notes tab |
| `templates/dialogs/camp-activity-dialog.hbs` | NEW | Player camp activity dialog |
| `styles/travel.css` | NEW | Travel Tracker + Region Sheet styles |
| `module/exploration/encounter-resolution.mjs` | MODIFY | Refactor to generic (dungeon + travel) |
| `module/helpers/socket/socket.mjs` | MODIFY | Add camp activity socket handlers |
| `trespasser.mjs` | MODIFY | Register region type, sheet, tracker, config |
| `styles/trespasser.css` | MODIFY | Import travel.css |
| `lang/en.json` | MODIFY | Add travel/region/camp localization keys |

---

## Verification Plan

### Manual Verification
1. Create a region actor → verify sheet renders with all fields
2. Open Travel Tracker from scene controls → verify compass icon appears
3. Select region → Start session → verify day/period/travel points display
4. Test Advance: wayfinding prompt in chat, travel points granted, hostility check
5. Test Camp: player receives dialog, selects activity, GM sees response, confirm posts to chat
6. Test Night's Rest: watch toggle, chat message posted, hostility check
7. Test weather changes affect terrain cost display
8. Test road toggle skips wayfinding
9. Test disorientation flag persists across advances
10. Test dungeon tracker start pauses travel session
11. Test player view shows limited info
12. Verify existing dungeon tracker still works after encounter-resolution refactor
