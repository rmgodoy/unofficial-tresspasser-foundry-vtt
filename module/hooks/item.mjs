import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { syncBoundCompanions } from "../helpers/companion-formula.mjs";
import { ItemExporter } from "../helpers/item-exporter.mjs";
import { TrespasserTreasureDialog } from "../dialogs/treasure-dialog.mjs";

/**
 * Register Item lifecycle, icon assignment, effect countering, and directory hooks.
 */
export function registerItemHooks() {
  // Pre-create item: counter states, effect summing, default icons, and status icon sync
  Hooks.on("preCreateItem", (item, createData, options, userId) => {
    const actor = item.parent;
    if (actor && item.type === "effect") {
      const system = item.system;
      let intensityToApply = system.intensity || 0;

      // Check for active opposite lasting state
      const lastingStates = actor.items.filter(i => i.type === "effect" && i.system.isLasting);
      for (const lasting of lastingStates) {
        const isOpposite = (system.counterStates || []).some(cs => cs.name === lasting.name) ||
                           (lasting.system.counterStates || []).some(cs => cs.name === item.name);
        if (isOpposite) {
          ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.OppositeLastingActive", {
            newEffect: item.name,
            lasting: lasting.name
          }));
          return false;
        }
      }

      // Handle Counter States
      const counterStates = system.counterStates || [];
      let wasCountered = false;
      if (counterStates.length > 0) {
        const counterNames = new Set(counterStates.map(cs => cs.name));
        const existingCounters = actor.items.filter(i => 
          i.type === "effect" && counterNames.has(i.name)
        );

        for (const counter of existingCounters) {
          wasCountered = true;
          if (intensityToApply <= 0) break;
          const counterIntensity = counter.system.intensity || 0;

          if (counterIntensity > intensityToApply) {
            counter.update({ "system.intensity": counterIntensity - intensityToApply });
            intensityToApply = 0;
          } else {
            intensityToApply -= counterIntensity;
            counter.delete();
          }
        }
      }

      if (wasCountered && intensityToApply <= 0) return false;

      // Handle Summing with existing effect of same name and same lasting status
      const existing = actor.items.find(i => 
        i.type === item.type && 
        i.name === item.name &&
        (!!i.system.isLasting) === (!!system.isLasting)
      );
      if (existing) {
        const currentIntensity = existing.system.intensity || 0;
        const newIntensity = currentIntensity + intensityToApply;
        existing.update({ "system.intensity": newIntensity });
        ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Item.EffectMerged", {
          effect: item.name, target: actor.name, intensity: newIntensity
        }));
        return false;
      }

      if (game.combat) {
        item.updateSource({ "flags.trespasser.acquiredDuringCombat": true });
      }

      if (intensityToApply !== system.intensity) {
        item.updateSource({ "system.intensity": intensityToApply });
      }
    }

    if (item.type === "injury") {
      item.updateSource({ img: "systems/trespasser/assets/icons/injury.webp" });
    }

    if (item.img === "icons/svg/item-bag.svg") {
      const typeIcons = {
        armor: "systems/trespasser/assets/icons/armor.webp",
        weapon: "systems/trespasser/assets/icons/weapon.webp",
        accessory: "systems/trespasser/assets/icons/item.webp",
        rations: "systems/trespasser/assets/icons/food.webp",
        effect: "systems/trespasser/assets/icons/effect.webp",
        deed: "systems/trespasser/assets/icons/deed.webp",
        incantation: "systems/trespasser/assets/icons/incantation.webp",
        feature: "systems/trespasser/assets/icons/feature.webp",
        talent: "systems/trespasser/assets/icons/talent.webp",
        calling: "systems/trespasser/assets/icons/calling_craft.webp",
        craft: "systems/trespasser/assets/icons/calling_craft.webp",
        past_life: "systems/trespasser/assets/icons/pesant.webp",
        room: "systems/trespasser/assets/icons/room.webp",
        item: "systems/trespasser/assets/icons/item.webp",
        hireling: "systems/trespasser/assets/icons/pesant.webp",
        build: "systems/trespasser/assets/icons/building.webp",
        stronghold: "systems/trespasser/assets/icons/stronghold.webp"
      };
      if (typeIcons[item.type]) {
        item.updateSource({ img: typeIcons[item.type] });
      }
    }

    if (item.type === "effect") {
      const isSynced = item.system.syncStatusIcon !== false;
      if (isSynced && !item.system.statusIcon) {
        item.updateSource({ "system.statusIcon": item.img || "systems/trespasser/assets/icons/effect.webp" });
      }
    }
  });

  // Pre-update item: synchronize statusIcon when effect image changes
  Hooks.on("preUpdateItem", (item, changed, options, userId) => {
    if (item.type === "effect") {
      if (changed.img && !foundry.utils.hasProperty(changed, "system.statusIcon")) {
        const isSynced = changed.system?.syncStatusIcon ?? item.system.syncStatusIcon ?? true;
        if (isSynced) {
          foundry.utils.setProperty(changed, "system.statusIcon", changed.img);
        }
      }
    }
  });

  // Create item: linked items, stronghold sync, companion sync, token effect sync
  Hooks.on("createItem", async (item, options, userId) => {
    if (item.parent?.type === "character") {
      syncBoundCompanions(item.parent);
    }

    if (game.user.id !== userId) return;

    if (item.parent?.type === "haven" && item.type === "stronghold") {
      item.parent.system.syncStrongholdBenefit(item);
    }
    if (item.parent?.documentName === "Actor" && item.type === "effect") {
      TrespasserEffectsHelper.syncActorTokenEffects(item.parent);
    }

    const actor = item.parent;
    if (!actor || actor.constructor.name !== "TrespasserActor") return;

    if (item.type === "feature") {
      const effects = item.system.effects || [];
      const deeds = item.system.deeds || [];
      if (effects.length > 0) await actor._applyLinkedItems(effects);
      if (deeds.length > 0) await actor._applyLinkedItems(deeds);
    } else if (item.type === "accessory" && item.system.equipped) {
      const sys = item.system;
      if (sys.talents?.length > 0) await actor._applyLinkedItems(sys.talents);
      if (sys.features?.length > 0) await actor._applyLinkedItems(sys.features);
      if (sys.deeds?.length > 0) await actor._applyLinkedItems(sys.deeds);
      if (sys.effects?.length > 0) await actor._applyLinkedItems(sys.effects, { continuousOnly: true });
    } else if (item.type === "injury") {
      const effects = item.system.effects || [];
      if (effects.length > 0) {
        await actor._applyLinkedItems(effects, { continuousOnly: false, fromInjury: true, injuryId: item.id });
      }
    }
  });

  // Update item: linked items updates, stronghold benefits, companion sync, terrain intensity
  Hooks.on("updateItem", async (item, delta, options, userId) => {
    if (item.parent?.type === "character") {
      syncBoundCompanions(item.parent);
    }

    if (game.user.id !== userId) return;

    if (item.parent?.type === "haven" && item.type === "stronghold") {
      item.parent.system.syncStrongholdBenefit(item, delta);
    }

    if (item.parent?.documentName === "Actor" && item.type === "effect") {
      TrespasserEffectsHelper.syncActorTokenEffects(item.parent);
      if (delta.system?.intensity !== undefined || foundry.utils.hasProperty(delta, "system.intensity")) {
        if (game.trespasser?.TerrainHelper) {
          await game.trespasser.TerrainHelper.onEffectIntensityUpdated(item, delta);
        }
      }
    }

    const actor = item.parent;
    if (!actor || actor.constructor.name !== "TrespasserActor") return;

    if (item.type === "feature" && ("system" in delta)) {
      if ("effects" in delta.system || "deeds" in delta.system) {
        const effects = item.system.effects || [];
        const deeds = item.system.deeds || [];
        if (effects.length > 0) await actor._applyLinkedItems(effects);
        if (deeds.length > 0) await actor._applyLinkedItems(deeds);
      }
    } else if (item.type === "accessory" && item.system.equipped && ("system" in delta)) {
      const sys = item.system;
      if ("talents" in delta.system) await actor._applyLinkedItems(sys.talents || []);
      if ("features" in delta.system) await actor._applyLinkedItems(sys.features || []);
      if ("deeds" in delta.system) await actor._applyLinkedItems(sys.deeds || []);
      if ("effects" in delta.system) await actor._applyLinkedItems(sys.effects || [], { continuousOnly: true });
    } else if (item.type === "injury" && ("system" in delta) && "effects" in delta.system) {
      const effects = item.system.effects || [];
      if (effects.length > 0) {
        await actor._applyLinkedItems(effects, { continuousOnly: false, fromInjury: true, injuryId: item.id });
      }
    }
  });

  // Delete item: linked item cleanup, stronghold sync, companion sync
  Hooks.on("deleteItem", async (item, options, userId) => {
    if (item.parent?.type === "character") {
      syncBoundCompanions(item.parent);
    }

    if (game.user.id !== userId) return;

    if (item.parent?.type === "haven" && item.type === "stronghold") {
      item.parent.system.syncStrongholdBenefit(item, { deleted: true });
    }
    if (item.parent?.documentName === "Actor" && item.type === "effect") {
      TrespasserEffectsHelper.syncActorTokenEffects(item.parent);
    }

    const actor = item.parent;
    if (!actor || actor.constructor.name !== "TrespasserActor") return;

    if (item.type === "feature") {
      const effects = item.system.effects || [];
      const deeds = item.system.deeds || [];
      if (effects.length > 0) await actor._removeLinkedItems(effects, item.id);
      if (deeds.length > 0) await actor._removeLinkedItems(deeds, item.id);
    } else if (item.type === "accessory") {
      const sys = item.system;
      if (sys.talents?.length > 0) await actor._removeLinkedItems(sys.talents, item.id);
      if (sys.features?.length > 0) await actor._removeLinkedItems(sys.features, item.id);
      if (sys.deeds?.length > 0) await actor._removeLinkedItems(sys.deeds, item.id);
      if (sys.effects?.length > 0) await actor._removeLinkedItems(sys.effects, item.id);
    } else if (item.type === "injury") {
      const toRemove = actor.items.filter(
        i => (i.type === "effect") && i.flags?.trespasser?.injuryId === item.id
      );
      for (const eff of toRemove) {
        await eff.delete();
      }
    }
  });

  // Item directory buttons (Treasure generator, Export all, Import all)
  Hooks.on("renderItemDirectory", (app, html, data) => {
    if (!game.user.isGM) return;

    const $html = $(html);
    let header = $html.find(".header-actions");

    if (!header.length && app.element) {
      header = $(app.element).find(".header-actions");
    }
    if (!header.length) {
      header = $html.find(".directory-header .actions, header .actions, nav.header-actions");
    }
    if (!header.length) return;

    if ($html.find(".generate-treasure-btn, .export-all-items").length) return;

    const treasureBtn = $(`<button type="button" class="generate-treasure-btn"><i class="fa-solid fa-gem"></i> ${game.i18n.localize("TRESPASSER.Dialog.TreasureGenerator.Title") || "Treasure Generator"}</button>`);
    const exportBtn = $(`<button class="export-all-items"><i class="fas fa-file-export"></i> Export All</button>`);
    const importBtn = $(`<button class="import-all-items"><i class="fas fa-file-import"></i> Import All</button>`);

    treasureBtn.on("click", (ev) => {
      ev.preventDefault();
      TrespasserTreasureDialog.open();
    });

    exportBtn.on("click", (ev) => {
      ev.preventDefault();
      ItemExporter.exportAll();
    });

    importBtn.on("click", (ev) => {
      ev.preventDefault();
      ItemExporter.importData();
    });

    header.append(treasureBtn);
    header.append(exportBtn);
    header.append(importBtn);
  });
}
