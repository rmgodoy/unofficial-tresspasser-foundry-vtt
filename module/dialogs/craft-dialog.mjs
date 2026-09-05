import { showItemInfoDialog } from "./item-info-dialog.mjs";
import { resolveItem, isLinkedItemMatch } from "../helpers/item-resolver.mjs";

const ATTRIBUTE_LABELS = {
  mighty:    "TRESPASSER.Terms.Attribute.Mighty",
  agility:   "TRESPASSER.Terms.Attribute.Agility",
  intellect: "TRESPASSER.Terms.Attribute.Intellect",
  spirit:    "TRESPASSER.Terms.Attribute.Spirit",
};

/**
 * Craft Selection Dialog using Handlebars and ApplicationV2.
 */
export class TrespasserCraftDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static async wait(craftItem, actor) {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (val) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };
      const dialog = new TrespasserCraftDialog(craftItem, actor, safeResolve);
      dialog.render(true);
    });
  }

  constructor(craftItem, actor, resolve, options={}) {
    super(options);
    this.craftItem = craftItem;
    this.actor = actor;
    this.resolve = resolve;
    this.options.window.title = game.i18n.format("TRESPASSER.Dialog.Craft.Title", { name: craftItem.name });

    // Determine listed status and first craft status
    const craftsSlots   = actor.system.crafts ?? [];
    this.alreadyListed = craftsSlots.some(s => s && s.trim() === craftItem.name.trim());
    this.isFirstCraft  = !craftsSlots.some(s => s && s.trim() !== "");

    const sys = craftItem.system;
    const checkPicked = (entry) => actor.items.some(it => 
      isLinkedItemMatch(it, entry) && 
      it.flags.trespasser?.linkedSource === craftItem.name
    );

    this.selectedDeeds = new Set(
      (sys.deeds || []).map((e, i) => checkPicked(e) ? i : null).filter(i => i !== null)
    );
    this.selectedFeatures = new Set(
      (sys.features || []).map((e, i) => checkPicked(e) ? i : null).filter(i => i !== null)
    );

    const keyAttr = sys.keyAttribute || "mighty";
    this.selectedAttr = this.isFirstCraft || actor.system.key_attribute === keyAttr;
  }

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "dialog", "craft-dialog-v2"],
    position: { width: 480, height: "auto" },
    window: {
      resizable: true,
      minimizable: false,
      title: ""
    },
    actions: {
      apply: TrespasserCraftDialog._onApply,
      cancel: TrespasserCraftDialog._onCancel,
      switchTab: TrespasserCraftDialog._onTabSelect,
      info: TrespasserCraftDialog._onInfoClick
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/craft-dialog.hbs"
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "attribute", label: "TRESPASSER.Terms.Attribute.Plural" },
        { id: "deeds", label: "TRESPASSER.Terms.ItemType.Deeds" },
        { id: "features", label: "TRESPASSER.Terms.ItemType.Features" }
      ],
      initial: "attribute"
    }
  };

  tabGroups = {
    primary: "attribute"
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    const sys = this.craftItem.system;
    
    // Fetch missing tiers for deeds (backward compatibility)
    if (sys.deeds) {
      for (const d of sys.deeds) {
        if (!d.tier && (d.uuid || d._id)) {
          const item = await resolveItem(d, { notify: false });
          if (item) d.tier = item.system.tier;
        }
      }
    }

    const keyAttr = sys.keyAttribute || "mighty";
    const keyAttrLabel = game.i18n.localize(ATTRIBUTE_LABELS[keyAttr] ?? keyAttr);

    const mapList = (list, selectedSet) => {
      return (list || []).map((entry, i) => {
        const isPicked = selectedSet ? selectedSet.has(i) : false;
        const ownedByOther = !isPicked && this.actor.items.some(it => 
          isLinkedItemMatch(it, entry)
        );
        return {
          ...entry,
          isPicked,
          ownedByOther,
          index: i
        };
      });
    };

    context.craftName = this.craftItem.name;
    context.description = sys.description;
    context.keyAttrLabel = keyAttrLabel;
    context.isFirstCraft = this.isFirstCraft;
    context.selectedAttr = this.selectedAttr;
    context.deeds = mapList(sys.deeds, this.selectedDeeds);
    context.features = mapList(sys.features, this.selectedFeatures);
    context.tabGroups = this.tabGroups;

    // Prepare tab buttons context
    context.tabs = this.constructor.TABS.primary.tabs.map(tab => {
      tab.active = this.tabGroups.primary === tab.id;
      tab.cssClass = tab.active ? "active" : "";
      return tab;
    });

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Selection change listeners to maintain tracking state
    html.querySelectorAll(".craft-dlg-check").forEach(chk => {
      chk.addEventListener("change", (ev) => {
        const list = ev.currentTarget.dataset.list;
        const idx = parseInt(ev.currentTarget.dataset.index);
        if (list === "deeds") {
          if (ev.currentTarget.checked) this.selectedDeeds.add(idx);
          else this.selectedDeeds.delete(idx);
        } else if (list === "features") {
          if (ev.currentTarget.checked) this.selectedFeatures.add(idx);
          else this.selectedFeatures.delete(idx);
        }
      });
    });

    const attrCheck = html.querySelector("#craft-attr-check");
    if (attrCheck && !this.isFirstCraft) {
      attrCheck.addEventListener("change", (ev) => {
        this.selectedAttr = ev.currentTarget.checked;
      });
    }

    // Search input listener
    const searchInputs = html.querySelectorAll(".craft-dlg-search");
    searchInputs.forEach(input => {
      input.addEventListener("input", (ev) => {
        const tabId = ev.currentTarget.dataset.tab;
        if (tabId === "deeds") {
          this._filterDeeds(html);
        } else {
          const query = ev.currentTarget.value.toLowerCase().trim();
          html.querySelectorAll(`.craft-dlg-pane[data-tab="${tabId}"] .craft-dlg-chip-row`).forEach(row => {
            const name = row.querySelector(".craft-dlg-name")?.textContent?.toLowerCase() ?? "";
            row.style.display = name.includes(query) ? "" : "none";
          });
        }
      });
    });

    // Tier filter listener
    const tierFilter = html.querySelector(".craft-dlg-tier-filter");
    if (tierFilter) {
      tierFilter.addEventListener("change", () => this._filterDeeds(html));
    }
  }

  _filterDeeds(html) {
    const query = html.querySelector(".craft-dlg-search[data-tab='deeds']").value.toLowerCase().trim();
    const tier = html.querySelector(".craft-dlg-tier-filter").value;

    html.querySelectorAll(`.craft-dlg-pane[data-tab="deeds"] .craft-dlg-chip-row`).forEach((row, idx) => {
      const entry = this.craftItem.system.deeds[idx];
      if (!entry) return;

      const matchesSearch = entry.name.toLowerCase().includes(query);
      const matchesTier = (tier === "all") || (entry.tier === tier);
      
      row.style.display = (matchesSearch && matchesTier) ? "" : "none";
    });
  }

  /** @override */
  async close(options={}) {
    this.resolve(false);
    return super.close(options);
  }

  static async _onApply(event, button) {
    const dialog = this;
    const html = dialog.element;
    const sys = dialog.craftItem.system;
    const craftName = dialog.craftItem.name;

    // 1. Manage Craft Item on Actor
    let actorCraft = dialog.actor.items.find(i => i.type === "craft" && i.name === craftName);
    if (!actorCraft) {
      const craftData = dialog.craftItem.toObject();
      delete craftData._id;
      const created = await dialog.actor.createEmbeddedDocuments("Item", [craftData]);
      actorCraft = created[0];
    }

    const actorUpdates = {};

    // 2. Write Craft name to first empty slot
    if (!dialog.alreadyListed) {
      const current  = dialog.actor.system.crafts ?? [];
      const newSlots = [current[0] ?? "", current[1] ?? "", current[2] ?? ""];
      const emptyIdx = newSlots.findIndex(s => !s || s.trim() === "");
      if (emptyIdx !== -1) {
        newSlots[emptyIdx] = craftName;
        actorUpdates["system.crafts"] = newSlots;
      }
    }

    // 3. Key attribute
    const attrCheck = html.querySelector("#craft-attr-check");
    if (dialog.isFirstCraft || (attrCheck && attrCheck.checked)) {
      actorUpdates["system.key_attribute"] = sys.keyAttribute || "mighty";
    }

    if (Object.keys(actorUpdates).length > 0) await dialog.actor.update(actorUpdates);

    // 4. Deeds & Features Picks
    const picks = [];
    for (const listKey of ["deeds", "features"]) {
      html.querySelectorAll(`.craft-dlg-check[data-list='${listKey}']:checked`).forEach(el => {
        const entry = sys[listKey]?.[parseInt(el.dataset.index)];
        if (entry) picks.push(entry);
      });
    }

    // Find current actor items linked to this craft
    const linkedItems = dialog.actor.items.filter(it => it.flags.trespasser?.linkedSource === craftName);

    // Items to delete (unchecked)
    const toDelete = linkedItems.filter(li => !picks.some(p => isLinkedItemMatch(li, p))).map(li => li.id);
    if (toDelete.length > 0) await dialog.actor.deleteEmbeddedDocuments("Item", toDelete);

    // Items to create (newly checked)
    const toCreateData = [];
    for (const entry of picks) {
      const alreadyHas = linkedItems.some(li => isLinkedItemMatch(li, entry));
      if (alreadyHas) continue;

      const sourceItem = await resolveItem(entry);
      if (!sourceItem) continue;
      const itemData = sourceItem.toObject();
      delete itemData._id;
      foundry.utils.setProperty(itemData, "flags.trespasser.linkedSource", craftName);
      foundry.utils.setProperty(itemData, "flags.trespasser.linkedSourceUuid", entry.uuid || sourceItem.uuid);
      foundry.utils.setProperty(itemData, "flags.trespasser.linkedSourceId", (entry.uuid || sourceItem.uuid)?.split(".").pop() || sourceItem.id);
      toCreateData.push(itemData);
    }

    if (toCreateData.length > 0) {
      await dialog.actor.createEmbeddedDocuments("Item", toCreateData);
    }

    ui.notifications.info(
      game.i18n.format("TRESPASSER.Notification.Apply.Craft", { name: craftName, actor: dialog.actor.name })
    );

    dialog.resolve(true);
    dialog.close();
  }

  static _onCancel() {
    this.resolve(false);
    this.close();
  }

  static _onTabSelect(event, target) {
    event.preventDefault();
    const tabId = target.dataset.tab;
    if (!tabId) return;
    this.tabGroups.primary = tabId;

    const html = this.element;
    html.querySelectorAll(".craft-dlg-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    html.querySelectorAll(".craft-dlg-pane").forEach(pane => {
      pane.classList.toggle("active", pane.dataset.tab === tabId);
    });
  }

  static async _onInfoClick(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const name = target.dataset.name || target.closest(".craft-dlg-chip-row")?.querySelector(".craft-dlg-name")?.textContent?.trim();
    await showItemInfoDialog(target.dataset.uuid, { name });
  }
}

/**
 * Craft Selection Dialog
 * Usage: await showCraftDialog(craftItem, actor)
 */
export async function showCraftDialog(craftItem, actor) {
  return TrespasserCraftDialog.wait(craftItem, actor);
}
