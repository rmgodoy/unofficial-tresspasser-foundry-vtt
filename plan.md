# Plan: Generic Canvas Input Overlay & Interaction Migration

Implement a generic, reusable canvas input overlay system for all canvas selection interactions (AoE placement, Target selection, Token Movement, Vault, Forced Movement, Terrain Placement). The system features an instructional top overlay banner with an explicit **Confirm** button and a **Cancel** button (and context-specific buttons like **Undo**) so users never rely on right-clicking or risk accidental miss-clicks.

---

## Key Requirements & User Directives

> [!CAUTION]
> **No Right-Click Interception**: Right-click is strictly reserved for Foundry VTT camera panning. **No canvas input mode may listen to or intercept right-click (`contextmenu`) events.**

> [!IMPORTANT]
> **Explicit Confirmation & Double-Click Shortcut**: Canvas interactions do not automatically confirm immediately upon clicking a square (with the sole exception of standard **Token Move**, where clicking directly executes movement and Ctrl+Click adds waypoints). For all other actions requiring explicit confirmation (Vault, Forced Movement, AoE Placement, Target Selection, Terrain Placement), clicking a tile selects it and enables the **Confirm** button, while clicking an **already-selected tile a second time** (double-click) auto-confirms immediately.

> [!NOTE]
> **Path vs Close Path Step-by-Step Selection Rules**:
> - **Path**:
>   - **Step 1**: Prompt user to pick any initial square on the canvas (highlighting the square under mouse cursor, similar to creature/blast target pickers).
>   - **Steps 2 to N**: Step-by-step orthogonal expansion from the current square (4 orthogonal directions only: up, down, left, right; no diagonals, no 2x2 blocks).
> - **Close Path**:
>   - **Step 1**: Prompt user to pick an initial square **adjacent to the caster token** (includes **diagonal OR orthogonal** adjacency for the first square!).
>   - **Steps 2 to N**: Step-by-step orthogonal expansion from the current square (4 orthogonal directions only: up, down, left, right; no diagonals, no 2x2 blocks).
> - Both Path and Close Path provide **Confirm** (to commit current path), **Undo Step** (to step back), and **Cancel** buttons on the top overlay banner.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             CanvasInputOverlay (AppV2)                           │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │  [Icon] Instruction / Title             Subtitle / Details                   │ │
│ │  [Action: Undo]                          [Confirm (Check)]  [Cancel (Cross)] │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────▲─────────────────────────────────────────┘
                                         │ Updates & Event Callbacks
┌────────────────────────────────────────┴─────────────────────────────────────────┐
│                              CanvasInputSession                                  │
│  - Manages overlay lifecycle, button states (Confirm/Undo/Cancel)                │
│  - Standardizes canvas PIXI pointer events (left-click select/build, hover)      │
│  - Keyboard ESC key triggers cancel                                              │
│  - Right-click is untouched (free for camera panning)                            │
│  - Guarantees strict cleanup of graphics & event listeners                       │
└────────────────────────────────────────▲─────────────────────────────────────────┘
                                         │ Consumed By
   ┌──────────────────┬──────────────────┴──────┬──────────────────┬──────────────┐
   │                  │                         │                  │              │
MovementOverlay  ForcedMovement       TargetingHelper (AoE)  Target Selection  TerrainHelper
(Move / Vault)     (Push/Pull)        (Blast / Path Sweep)   (Creature Pick)   (Terrain Place)
```

---

## User Review Required

> [!IMPORTANT]
> **Confirm Button Workflow**: Clicking canvas squares builds the target or path; the overlay **Confirm** button becomes enabled once a valid target/path exists. The user clicks **Confirm** to execute.
> 
> **Camera Panning Safety**: Right-click remains 100% untouched across all interactive modes.

---

## Proposed Changes

### Core Canvas Overlay Infrastructure

#### [NEW] [canvas-input-overlay.hbs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/templates/hud/canvas-input-overlay.hbs)
- Handlebars template for the top canvas overlay banner.
- Renders header title, detailed instructions/status, **Confirm** button (`data-action="confirm"`), **Undo** button (`data-action="undo"` when applicable), and **Cancel** button (`data-action="cancel"`).

#### [NEW] [canvas-input-overlay.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/hud/canvas-input-overlay.mjs)
- `ApplicationV2` component class (using `HandlebarsApplicationMixin(ApplicationV2)`).
- Top banner overlay widget. Provides helper methods (`setCanConfirm(boolean)`, `updateDetails(...)`) to dynamically update button states as the user selects targets or paths on the canvas.

#### [NEW] [canvas-input-session.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/canvas/canvas-input-session.mjs)
- Core controller class encapsulating canvas input sessions.
- Handles standard canvas PIXI pointer listeners (`pointerdown` left-click, `pointermove`).
- ESC key triggers cancel. Does NOT add any `contextmenu` listener.
- Promise-based lifecycle (`CanvasInputSession.start(options)`) resolving when the user clicks **Confirm**, or returning `null` on **Cancel** / ESC.

#### [MODIFY] [base.css](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/styles/base.css)
- CSS styles for `#canvas-input-overlay` using `var(--fs-*)` for font sizes, modern dark Trespasser aesthetics, gold accent borders, and styled Confirm/Undo/Cancel action buttons.

---

### Migration Tasks (Broken into Smaller Modular Tasks)

#### [Task 1] Standard Token Movement Overlay
##### [MODIFY] [movement-overlay.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/canvas/movement-overlay.mjs)
- Refactor `MovementOverlay.activateMoveMode` to use `CanvasInputSession`.
- User clicks grid square or adds waypoints to plot path; overlay displays *"Token Movement: X squares remaining"*.
- Clicking a destination enables the **Confirm** button on the overlay. The user clicks **Confirm** to execute token movement, or **Cancel** to abort.

#### [Task 2] Vault / Jump / Teleport / Walk Movement Overlay
##### [MODIFY] [movement-overlay.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/canvas/movement-overlay.mjs)
- Refactor `MovementOverlay.activateVaultMode` to use `CanvasInputSession`.
- User clicks valid destination square to select it; overlay displays *"Vault Movement: Range X"*.
- **Confirm** button on overlay enables when a valid destination is selected. User clicks **Confirm** to execute vault, or **Cancel** to abort.

#### [Task 3] Forced Movement Overlay
##### [MODIFY] [forced-movement-helper.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/forced-movement-helper.mjs)
##### [DELETE] [forced-movement-banner.hbs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/templates/hud/forced-movement-banner.hbs)
- Refactor `#selectForcedPath` to use `CanvasInputSession`.
- User clicks adjacent valid step squares to construct forced movement path.
- Overlay banner displays remaining steps and collision damage, with an **Undo Step** button, a **Confirm** button, and a **Cancel** button. Right-click contextmenu handler removed.

#### [Task 4] AoE Template Placement Overlay (Blast, Close Blast, Path, Close Path)
##### [MODIFY] [targeting-helper.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/targeting-helper.mjs)
- **Blast / Close Blast**: User clicks desired blast placement to select location. Overlay **Confirm** button becomes enabled. User clicks **Confirm** to lock in blast placement.
- **Path / Close Path (Sweep Mode Redesign)**:
  - **Path**: Step 1 highlights square under mouse cursor. Step 2..N highlights adjacent orthogonal squares (4 directions, no diagonals, no 2x2 blocks).
  - **Close Path**: Step 1 highlights squares adjacent to caster token (includes diagonals for 1st square). Step 2..N highlights adjacent orthogonal squares (4 directions, no diagonals, no 2x2 blocks).
  - Overlay banner provides **Undo Step**, **Confirm** (to lock in path), and **Cancel** buttons.

#### [Task 5] Target / Creature Selection Overlay
##### [MODIFY] [bdeed-behavior-handler.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/bdeed-behavior-handler.mjs)
- Refactor `_selectTarget` ("creatures" mode) to use `CanvasInputSession`.
- User clicks target token squares on canvas to add targets.
- Overlay displays *"Selected Target X of N"*. User clicks **Confirm** on overlay to finalize selected target(s) or **Cancel** to abort.

#### [Task 6] Interactive Terrain Placement Overlay
##### [MODIFY] [terrain-helper.mjs](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/terrain-helper.mjs)
- Refactor `spawnTerrainFromDeed` interactive placement to use `CanvasInputSession`.
- User clicks destination to select terrain placement. Overlay **Confirm** button enables. User clicks **Confirm** to spawn terrain or **Cancel** to abort.

---

## Verification Plan

### Manual Verification
1. **Right-Click Camera Panning Test**: During active token movement, vaulting, forced movement, AoE placement, and target picking, perform a right-click drag on canvas. Verify canvas pans normally without cancelling or registering unwanted input.
2. **Confirm Button Requirement Test**: Click a destination/target on canvas. Confirm action does NOT trigger automatically. Click **Confirm** button on top overlay banner; verify action completes as expected.
3. **Path Initial Square Test**: Trigger Path deed. Verify Step 1 highlights square under mouse cursor. After clicking Step 1, verify subsequent steps only allow orthogonal movement.
4. **Close Path Initial Square Test**: Trigger Close Path deed. Verify Step 1 allows picking any adjacent square around caster token (including diagonal). After Step 1, verify subsequent steps only allow orthogonal movement.
5. **Token Movement & Vault Test**: Activate movement and vault from token HUD. Verify overlay instruction & Confirm/Cancel buttons.
6. **Forced Movement Test**: Execute Push deed. Verify step-by-step path selection, collision damage calculation, Undo button, and Confirm button.
7. **Creature Target Selection Test**: Perform multi-target deed. Click target tokens, verify list updates, click **Confirm** button to complete.
8. **Terrain Placement Test**: Place a terrain item from deed onto canvas. Select square, click **Confirm** button.
9. **Font Styling Audit**: Verify all font sizes in `base.css` overlay styles use `var(--fs-*)` variables.
