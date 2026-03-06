# How Effects Work in Trespasser

In the Trespasser system, effects are a core component that dynamically modify actor attributes, alter combat statuses, manage damage phases, and drive tactical gameplay loops. Effects function through specific timings (When), conditional expirations (Duration), targets, and dynamic numeric or dice modifiers paired with customizable intensities.

## Effect Anatomy

An Effect consists of the following parameters, defined in the standard schema:
- **Type**: `On Trigger` (trigger-based, temporary effects) or `Continuous` (constant bonuses usually deriving from equipment or permanent features).
- **Is Combat**: Determines whether the effect shows up under the "Combat" tab or the "Character" tab of the character sheet.
- **Is Only Reminder**: Flags the effect to output narrative/reminder chat text instead of mechanically modifying actor health/focus. 
- **GM Only**: When it is a simple reminder, checking this option whispers the message exclusively to the GM instead of emitting a public chat message.
- **Intensity**: A numerical value stored as `intensity`. It replaces the literal text `<Int>` in parsing the modifier string.
- **Intensity Increment**: The amount by which the underlying Intensity increases (or decreases) automatically every time the effect is triggered temporally.
- **Target Attribute**: The specific statistic or mechanic that this effect applies to (e.g., `health`, `combat_phase`, `speed`, `damage_dealt`, `mighty`, etc.).
- **Modifier**: A robust string that encapsulates numeric bonuses (`+2`), dice variables (`1d6`), intensity scaling (`<Int>`), and even math functions like `max()` or placeholders for class skills.
- **Trigger When**: Defines *when* the effect executes its logic, triggers its automated chat behavior, or provides its bonus.
- **Duration**: The compound conditional logic governing when the effect expires and is automatically removed.

---

## Modifiers and Evaluation

Modifiers translate textual rules into mechanical numbers or rolls. The system parses them recursively when required:

1. **Standard Variables**: Evaluates the string, replacing any occurrence of `<Int>` with the effect's current Intensity value.
2. **Dynamic Dice Replacement**: 
   - Replaces `<sd>` internally with the Actor's Skill Die (`d4`, `d6`, `d8`, `d10`, `d12`), properly scaling based on multipliers. For instance, `2<sd>` becomes `2d8` if the skill die is `d8`.
   - Replaces `<wd>` with the resolved Weapon Die for weapon-centric effects.
3. **Recursive Math**: Computes logic via `max(a, b)` and `min(a, b)`, evaluating nested roll formulas internally before grabbing the highest or lowest returned value.
4. **Resolution**: After substitution is finalized, it routes through Foundry's `Roll` API for dice (e.g. `2d8 + 4`) and yields a total numerical sum for use mechanically, or parses simple static integers.
5. **Advantage Flag**: Can also simply hold the string `adv`. The system explicitly queries `hasAdvantage(actor, key)` which bypasses numerical checks and yields `true` if an effect guarantees advantage on the check.

---

## Trigger Timings (When)

The `when` property dictates the temporal scope of the effect. Effects only fire or apply mathematically when their corresponding trigger condition is active or called.

### Immediate (`immediate`)
- **Evaluation**: The effect fires off fundamentally once, immediately upon application.
- **Lifecycle**: Used mostly by consumables or instantaneous abilities (e.g., a potion that heals you immediately and applies no lasting aura). The modifier resolves immediately, and the effect is not appended to the temporal state list.

### Continuous (`continuous`)
- **Evaluation**: The effect applies as a constant static bonus consistently. 
- **Trigger Behavior**: It never generates automated chat messages traversing turns. Functions like `getAttributeBonus()` sum up all active continuous effects on the actor (for stats like stat-modifiers, armor, initiatives).

### Temporal / Turn-Based Boundaries
These timing phases automatically trigger generating mechanical adjustments and chat cards at specific steps of the general combat tracker pipeline.
- `start-of-round`
- `start-of-turn`
- `end-of-turn`
- `end-of-round`
**How it evaluates**: The system intercepts the Foundry combat round/turn hooks and calls `triggerEffects(actor, timing)`. If an effect's `when` exactly matches the hook passed:
1. It computes the Modifier.
2. It natively updates the Actor natively if applicable (e.g., modifying `health` directly, boosting `focus`, spending `action_points`).
3. Sends a styled Chat Message indicating what was just automatically calculated.
4. Nudges the modifier intensity if `intensityIncrement` isn't zero.
5. Decays duration conditionally (see *Durations*).

### Sub-Action & Encounter Triggers
These timings are evaluated via code manually right before or after standard rolls across the canvas.
- `on-move`: Checked dynamically around spatial manipulation.
- `use` / `on-use-deed`: Triggers immediately when employing a specific item, deed, or feature on the canvas board.
- `targeted` / `on-targeted-deed`: Notifies or alters bonuses right when an actor is pinpointed by a deed/action from opponents.
- `damage-dealt` / `damage-received`: Evaluated specifically via `evaluateDamageBonus()` directly prior to executing final health reductions. Matching effects calculate dice modifiers, boost payloads, then directly decrement `<Triggers>` duration configurations.
- `on-prevail`: Hooked into the Combat Prevail phase.
- `on-deed-hit-received` / `on-deed-miss-received` & `on-deed-hit` / `on-deed-miss`: Mechanical intercept flags altering narrative outputs or granting reactive mitigations sequentially following target rolling metrics.
- `start-of-combat` / `end-of-combat`: Checked uniformly when the game shifts Combat states.

---

## Duration Logic Component

The system features a highly flexible "Compound Condition" mechanism for maintaining Durations globally. Rather than a flat counter, an effect maintains an array of `durationConditions` mapped against a top-level `durationOperator` (either `AND` or `OR`).

### Available Duration Modes
- **Indefinite (`indefinite`)**: The condition theoretically never decays out or expires structurally on its own.
- **Combat (`combat`)**: The game engine flags the condition to mathematically expire immediately if the game transitions entirely out of an active Combat state, or naturally fades post-fight.
- **Rounds (`rounds`)**: Mandates a numeric parameter via `value`. The effect maintains this float decremented globally at specific Combat Tracker loop intervals (typically transitioning rounds). 
- **Triggers (`triggers`)**: Operates on a specific `value`. Instead of decaying universally with time, it decays every specific time `triggerEffects()` explicitly processes the effect (e.g., ticking on an `end-of-turn` burn tick), or when `evaluateDamageBonus()` draws power from the effect mechanically dynamically.

### Expiration Evaluation (AND vs OR)
The `DurationHelper` parses the exact context via conditionally evaluating `shouldExpire()` checks.
- **`OR` Logic**: As soon as *any* single condition parameter in the list is achieved dynamically (e.g. `Rounds` hits 0 **OR** Combat natively ends). The first successful condition to flip to zero expires the effect entirely cleanly.
- **`AND` Logic**: Mandates sequential overlapping verification. The effect is strictly removed if *all* given conditions are synchronously true (e.g. `Triggers` hit 0 **AND** Combat ends). 

### Decay and Expiry Lifecycle

The exact execution pipeline dictating a decaying parameter handles natively:
1. When game events happen, `DurationHelper.processEvent(item, event)` resolves an event keyword (i.e. `"rounds"` or `"triggers"`).
2. It loops through all `durationConditions` internally. Any condition whose `mode` exactly aligns with the fired `event` decays its underlying value mathematically (`value - 1`), with a firm clamp at a minimum of `0`.
3. Consequently following the structural decay, it simultaneously queries the logical test `shouldExpire()`.
4. **Resolution**: 
   - If `shouldExpire` warrants a true metric locally, the document deletes the effect completely across the database (`item.delete()`). 
   - Otherwise, it persists the slightly decremented conditions via `item.update({ "system.durationConditions": updatedConditions })` so players dynamically view remaining lengths decreasing across chat interactions seamlessly.

---

## Interaction with Items (Weapons, Armor, Features, etc.)

How effects apply and behave varies dramatically depending on the **parent Item Type** housing them. 

### 1. Equippable Items (Armor, Accessories, general Items)
Items intended to be passively worn have special background optimizations so they don't bloat the actor's database with child documents.
When an armor, accessory, or generic equippable is **Equipped**:
- **Continuous Application**: Any effects explicitly marked with the type `continuous` OR the When trigger `immediate` are seamlessly intercepted and natively appended as raw Document `Item` datasets on the Actor, structurally linked under `flags.trespasser.linkedSource`. If the item is unequipped, it crawls the actor and automatically deletes these cloned objects.
- **Situational / Active Effects**: Crucially, if an equipped armor or accessory holds effects meant to trigger on phases (e.g. `start-of-turn` bleeding or `on-deed-hit-received`), it **does not** create independent documents. Instead, `getActorEffects()` dynamically sweeps your equipped gear, capturing those situational objects natively as **Synthetic Effects** (`synthetic: true`). These pseudo-document effects exist purely in memory during combat; they resolve correctly in chat and damage pipelines seamlessly without touching database storage. They are flagged with `hiddenOnSheet: true` so the player's active effect sheet doesn't get flooded.

### 2. Weapons
Weapons behave distinctly relative to general equippable items because their effects are typically aggressively manual.
When a weapon is **Equipped**:
- **Weapon "Effects" Array**: A weapon's base `effects` are **never** unpacked directly onto the actor statically. Instead, they lie dormant on the weapon data itself. When a player actively rolls an attack (`postDeedPhase`), and an attack resolves, the game injects the weapon's `effects` into the chat card's output payload automatically. Players can then manually click the effect buttons on the card to pinpoint those statuses directly to hit targets dynamically.
- **Enhancement Effects (`enhancementEffects`) & Extra Deeds (`extraDeeds`)**: These specific arrays on a weapon follow the standard mapping rule. They spawn real documents natively mapped to the actor, intended to give permanent modifications while wielding (like a magic sword granting `+1 Accuracy` continuously).

### 3. Features & Callings
Features are core intrinsic actor logic nodes (e.g. Level 1 Class mechanics).
When a Feature is **Purchased / Dropped onto an Actor**:
- The `createItem` hook runs specifically scanning all `effects` and `deeds` contained inside the feature block.
- **Immediate Full Unpack**: Unlike equippables, features ignore the `continuousOnly` safety filter. They automatically clone and unpack **all** contained effects directly onto the actor, converting them into embedded documents linked back to the feature.
- **Orphan Sweeping**: Because of the `linkedSource` flag tracker, if a player subsequently deletes the feature from their sheet, the system automatically loops and cascades deletion onto every imported sub-effect.

### 4. Talents & Deeds
By design, effects nested directly inside a Talent or Deed are inherently temporal. 
- You do **not** gain an effect by simply having a Talent or Deed in your list. 
- The effects exist conceptually inside the specific trigger phase arrays (`Start`, `Before`, `Hit`, `Base`, `After`, `End`). 
- Upon invoking the ability successfully, the pipeline surfaces these effects as clickable Chat Elements exactly mimicking weapon effects. The actor initiates the maneuver, and manually pushes generated effects to affected characters per narrative outcomes.

### 5. Injuries
Injuries use the system primarily as a mechanical penalty framework.
- Any effect appended conceptually inside an Injury natively inherits the `fromInjury: true` logical flag.
- **Prevail Immunity**: This is fundamentally critical. Standalone debuffs can typically be wiped manually mid-combat via rolling a Prevail action. Effects flagged natively as derived from an Injury *cannot* be targeted or circumvented via Prevailing natively. The only systematic way to discard them is by successfully treating and deleting the macroscopic Injury document that hosts them.
