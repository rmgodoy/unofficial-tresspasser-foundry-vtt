# Localization Cleanup and Completion Plan

The goal is to eliminate all remaining hardcoded strings and fix the unlocalized keys identified in the files and screenshots.

## 1. Update Language Files (`en.json` and `pt-BR.json`)

### New Keys to Add:
- **Dungeon Session Management:**
  - `TRESPASSER.Dungeon.Session.EndTitle`: "End Exploration" / "Finalizar Exploração"
  - `TRESPASSER.Dungeon.Session.Ended`: "Exploration of {name} has ended." / "A exploração de {name} foi encerrada."
  - `TRESPASSER.Dungeon.Session.Summary`: "Summary: {rounds} rounds, {actions} actions." / "Resumo: {rounds} rodadas, {actions} ações."
- **Chat Messages (Hardcoded in `trespasser.mjs`):**
  - `TRESPASSER.Chat.AppliedEffect`: "Applied {name} to {target}." / "{name} aplicado a {target}."
  - `TRESPASSER.Chat.HelpFrom`: "Help from {name}" / "Ajuda de {name}"
  - `TRESPASSER.Chat.AppliedHelp`: "Applied Help to {name}." / "Ajuda aplicada a {name}."
  - `TRESPASSER.Chat.TookDamage`: "{name} took {damage} damage." / "{name} sofreu {damage} de dano."
  - `TRESPASSER.Chat.TookDamageReduction`: "{name} took {damage} damage ({raw} − {reduction} reduction)." / "{name} sofreu {damage} de dano ({raw} − {reduction} de redução)."
  - `TRESPASSER.Chat.HealedAmount`: "{name} was healed for {amount} HP." / "{name} foi curado em {amount} PV."

## 2. Update `trespasser.mjs`
- Replace hardcoded strings in `renderChatMessageHTML` hooks with `game.i18n.format()`.

## 3. Update `system.json`
- Add `styles/dungeon.css` to the `styles` array to ensure dungeon-specific styling is loaded.

## 4. Verify `dungeon-tracker.hbs`
- Double-check the key `TRESPASSER.Dungeon.Session.EndExploration`. If it's still failing, I will re-write it in the JSON files to ensure no hidden characters are present.

## 5. Standardize `Dialog` block
- Move `Dialog` outside `TRESPASSER` in `pt-BR.json` to match `en.json` structure (if they are inconsistent).
- Wait, I noticed `en.json` has `Dialog` at the root, while `pt-BR.json` had it inside `TRESPASSER` in some places. I will consolidate this.

/tmp/localization_plan.md
