# Die and Value Placeholders Evaluation Explanation

This document explains how `<sd>`, `<wd>`, `<sb>`, and `<Int>` placeholders are evaluated across **Effects**, **Deeds**, **BDeeds**, and **Terrain** in the Trespasser system.

---

## 1. Skill Die (`<sd>`), Weapon Die (`<wd>`), and Skill Bonus (`<sb>`)

`<sd>`, `<wd>`, and `<sb>` are used in formulas to dynamically insert actor properties:
- `<sd>`: Replaced with the actor's skill die (e.g., `d6`). Multipliers like `2<sd>` scale the die count to `2d6`.
- `<wd>`: Replaced with the weapon die (e.g., `d8` or default `d4`). Multipliers like `3<wd>` scale the die count to `3d8`.
- `<sb>`: Replaced with the actor's skill bonus numeric value.

### Implementation Locations
- **Central Helper**: [`TrespasserEffectsHelper.replacePlaceholders(formula, actor, weaponDie)`](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/effects-helper.mjs#L130).
- **Deeds**: [`DeedBehaviorHandler.resolveFormulaPlaceholders(formula, actor)`](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/deed-behavior-handler.mjs) handles formula placeholders during Deed damage execution.
- **Terrain**: [`TerrainHelper.executeBehavior()`](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/terrain-helper.mjs#L854) calls `TrespasserEffectsHelper.replacePlaceholders()` when evaluating terrain damage formulas.

---

## 2. Intensity Placeholder (`<Int>` / `<int>`)

`<Int>` is used in modifier strings and terrain behavior formulas to scale numerical effects or damage dynamically based on intensity.

### Implementation Locations
- **Active Effects / Items**: [`TrespasserEffectsHelper.parseModifier(modifierString, intensity)`](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/effects-helper.mjs#L116) replaces `<Int>` directly with the item's numeric `system.intensity`.
- **Terrain Behaviors**: [`TerrainHelper.resolveIntPlaceholder(str, terrainRegion)`](file:///c:/Users/Rodrigo/AppData/Local/FoundryVTT/Data/systems/trespasser/module/helpers/terrain-helper.mjs#L892) resolves `<Int>` dynamically by fetching the intensity of a linked effect on the caster actor via `TerrainHelper.getLinkedIntensity(terrainRegion)`.

---

## Summary Matrix

| Placeholder | Meaning | Primary Evaluator | Context |
|---|---|---|---|
| `<sd>` | Skill Die | `TrespasserEffectsHelper.replacePlaceholders` | Effects, Deeds, BDeeds, Terrain |
| `<wd>` | Weapon Die | `TrespasserEffectsHelper.replacePlaceholders` | Effects, Deeds, BDeeds, Terrain |
| `<sb>` | Skill Bonus | `TrespasserEffectsHelper.replacePlaceholders` | Effects, Deeds, BDeeds |
| `<Int>` | Intensity | `TrespasserEffectsHelper.parseModifier` / `TerrainHelper.resolveIntPlaceholder` | Active Effects / Linked Terrain Effects |
