/**
 * Activate event listeners for the Companion sheet.
 * @param {HTMLElement|jQuery} html - The rendered sheet HTML element or jQuery wrapper
 * @param {TrespasserCompanionSheet} sheet - The sheet instance
 */
export function activateCompanionListeners(html, sheet) {
  const root = html instanceof HTMLElement ? html : (html[0] ?? html);
  if (!root) return;

  // Bound character selector change
  const charSelector = root.querySelector("[name='system.boundCharacterId']");
  if (charSelector) {
    charSelector.addEventListener("change", async (ev) => {
      const newId = ev.target.value;
      await sheet.actor.update({ "system.boundCharacterId": newId });
      sheet.actor.prepareData();
      sheet.render(false);
    });
  }

  // GM Formula Configuration Dialog
  root.querySelectorAll("[data-action='configure-formulas'], .companion-config-btn").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      sheet._onConfigureFormulas?.();
    });
  });

  // Combat stat roll clicks
  root.querySelectorAll("[data-roll-stat]").forEach(el => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      const stat = ev.currentTarget.dataset.rollStat;
      sheet._onCompanionStatRoll?.(stat);
    });
  });

  // Skill die / damage die roll click
  const skillDieEl = root.querySelector("[data-action='roll-skill-die'], [data-action='roll-damage']");
  if (skillDieEl) {
    skillDieEl.addEventListener("click", (ev) => {
      if (ev.target.tagName === "INPUT") return;
      ev.preventDefault();
      sheet._onCompanionDamageRoll?.();
    });
  }

  // Item Create button
  root.querySelectorAll("[data-action='create-item'], .item-create").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (sheet._onItemCreate) {
        return sheet._onItemCreate(ev);
      }
      const type = ev.currentTarget.dataset.type || "item";
      const name = game.i18n.format("TRESPASSER.Sheet.Common.NewItem", {
        type: game.i18n.localize(`TRESPASSER.TYPES.Item.${type}`) || type
      }) || `New ${type}`;

      const itemData = {
        name,
        type: type === "inventory" ? "item" : type,
        img: type === "deed" ? "systems/trespasser/assets/icons/deed.webp" :
             type === "feature" ? "systems/trespasser/assets/icons/feature.webp" :
             type === "effect" ? "systems/trespasser/assets/icons/effect.webp" :
             "systems/trespasser/assets/icons/item.webp"
      };

      const [created] = await sheet.actor.createEmbeddedDocuments("Item", [itemData]);
      if (created) created.sheet.render(true);
    });
  });

  // Item Name click (open item sheet)
  root.querySelectorAll(".item-name:not(.rollable)").forEach(el => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (itemId) {
        const item = sheet.actor.items.get(itemId);
        item?.sheet?.render(true);
      }
    });
  });

  // Item Depletion
  root.querySelectorAll(".item-deplete").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      sheet._onDepletionRoll?.(ev);
    });
  });

  // Item Consume
  root.querySelectorAll(".item-consume").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      sheet._onItemConsume?.(ev);
    });
  });

  // Item Toggle Light
  root.querySelectorAll(".item-toggle-light").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      sheet._onToggleLight?.(ev);
    });
  });

  // Item Transfer
  root.querySelectorAll(".item-transfer").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      sheet._onItemTransfer?.(ev);
    });
  });

  // Item Edit (open item sheet)
  root.querySelectorAll(".item-edit, [data-action='edit-item']").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (itemId) {
        const item = sheet.actor.items.get(itemId);
        item?.sheet?.render(true);
      }
    });
  });

  // Item Delete
  root.querySelectorAll(".item-delete, [data-action='delete-item']").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (itemId) {
        const item = sheet.actor.items.get(itemId);
        if (item) await item.delete();
      }
    });
  });

  // Deed use / roll
  root.querySelectorAll("[data-action='use-deed'], .deed-rollable, .deed-slot-title").forEach(el => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      const itemId = ev.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (itemId) sheet._onCompanionDeedUse?.(itemId);
    });
  });

  // Feature roll (post feature card to chat)
  root.querySelectorAll(".feature-name.rollable").forEach(el => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      sheet._onFeatureRoll?.(ev);
    });
  });

  // Info popup dialog (Feature, Talent, Effect, State)
  root.querySelectorAll(".feature-info, .talent-info, .effect-info, .state-info, .passive-info").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      sheet._onEffectInfo?.(ev);
    });
  });

  // Effect handlers (for combat-effects.hbs partial and non-combat effects)
  root.querySelectorAll(".effect-edit").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      sheet._onEffectEdit?.(ev);
    });
  });

  root.querySelectorAll(".effect-remove, [data-action='delete-effect']").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      sheet._onEffectRemove?.(ev);
    });
  });

  root.querySelectorAll(".effect-intensity-input").forEach(input => {
    input.addEventListener("change", async (ev) => {
      sheet._onIntensityChange?.(ev);
    });
  });

  root.querySelectorAll(".effect-prevail, .prevail-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      sheet._onCompanionStatRoll?.("prevail");
    });
  });
}
