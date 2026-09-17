/**
 * Stylized Roll Dialog for Trespasser.
 * Uses ApplicationsV2.
 * Supports toggleable bonuses and collapsible Effect Bonus accordion.
 */
export class TrespasserRollDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  constructor(options={}) {
    super(options);
    this.data = options.data || {};
    this.resolve = options.resolve;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["trespasser", "dialog", "roll-dialog"],
    position: { width: 340, height: "auto" },
    window: {
      resizable: false,
      minimizable: false,
      title: ""
    },
    actions: {
      toggleAccordion: TrespasserRollDialog.#onToggleAccordion,
      roll: TrespasserRollDialog.#onRoll,
      cancel: TrespasserRollDialog.#onCancel
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/roll-dialog.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.dice = this.data.dice || "1d20";
    context.showCD = this.data.showCD ?? false;
    context.cd = this.data.cd ?? 10;

    context.bonuses = (this.data.bonuses || []).map((b, idx) => {
      const isAccordion = !!b.isAccordion || (Array.isArray(b.children) && b.children.length > 0);
      const children = (b.children || []).map((c, cIdx) => ({
        id: c.id ?? `child-${idx}-${cIdx}`,
        name: c.name || c.label || "Effect",
        value: typeof c.value === "number" ? c.value : (parseFloat(c.value) || 0),
        modifierStr: c.modifierStr || (c.value >= 0 ? `+${c.value}` : `${c.value}`),
        description: c.description || "",
        checked: c.checked ?? true
      }));

      const computedValue = isAccordion && children.length > 0
        ? children.reduce((sum, c) => sum + (c.checked ? c.value : 0), 0)
        : (typeof b.value === "number" ? b.value : (parseFloat(b.value) || 0));

      return {
        id: b.id ?? b.key ?? `bonus-${idx}`,
        key: b.key ?? b.id ?? `bonus-${idx}`,
        label: b.label || "",
        value: computedValue,
        isAccordion,
        children,
        hasChildren: children.length > 0,
        toggleable: b.toggleable ?? (!isAccordion),
        checked: b.checked ?? true
      };
    });

    let initialBonusTotal = 0;
    for (const b of context.bonuses) {
      if (b.isAccordion) {
        if (b.hasChildren) {
          for (const c of b.children) {
            if (c.checked) initialBonusTotal += c.value;
          }
        } else if (b.checked) {
          initialBonusTotal += b.value;
        }
      } else {
        if (b.checked) {
          initialBonusTotal += b.value;
        }
      }
    }
    const initialModifier = this.data.modifier || 0;
    const initialTotal = initialBonusTotal + initialModifier;
    context.initialBonusFormatted = initialTotal >= 0 ? `+ ${initialTotal}` : `- ${Math.abs(initialTotal)}`;

    return context;
  }

  /**
   * Evaluates the current state of bonuses, checkboxes, and modifiers in the dialog.
   * @returns {object} Calculated totals and bonus breakdown
   */
  _calculateCurrentBonuses() {
    let activeBonusTotal = 0;
    const activeBonuses = [];
    const disabledBonuses = [];
    const disabledEffectIds = [];

    // Evaluate standard bonus rows
    const standardRows = this.element.querySelectorAll(".standard-bonus-row");
    standardRows.forEach(row => {
      const cb = row.querySelector(".bonus-checkbox");
      const label = row.querySelector(".bonus-label")?.textContent?.trim() || "";
      const isChecked = cb ? cb.checked : true;
      const value = cb ? (parseFloat(cb.dataset.value) || 0) : (parseFloat(row.querySelector(".bonus-value")?.textContent?.replace("+", "")) || 0);

      const entry = { label, value, isChecked };
      if (isChecked) {
        activeBonusTotal += value;
        activeBonuses.push(entry);
      } else {
        disabledBonuses.push(entry);
      }
    });

    // Evaluate accordion sub-effects
    const accordionGroups = this.element.querySelectorAll(".bonus-accordion-group");
    accordionGroups.forEach(group => {
      const childRows = group.querySelectorAll(".bonus-child-row");
      if (childRows.length > 0) {
        childRows.forEach(row => {
          const cb = row.querySelector(".bonus-child-checkbox");
          if (!cb) return;
          const id = cb.dataset.childId;
          const name = cb.dataset.name || row.querySelector(".child-name")?.textContent?.trim() || "";
          const value = parseFloat(cb.dataset.value) || 0;
          const isChecked = cb.checked;

          const entry = { id, name, value, isChecked, isEffect: true };
          if (isChecked) {
            activeBonusTotal += value;
            activeBonuses.push(entry);
          } else {
            disabledBonuses.push(entry);
            if (id) disabledEffectIds.push(id);
          }
        });
      } else {
        // Group without children: read total directly
        const totalText = group.querySelector(".accordion-total")?.textContent?.replace("+", "")?.trim();
        const value = parseFloat(totalText) || 0;
        const label = group.querySelector(".bonus-label")?.textContent?.trim() || "Effect Bonus";
        activeBonusTotal += value;
        activeBonuses.push({ label, value, isChecked: true });
      }
    });

    const modifier = parseInt(this.element.querySelector('input[name="modifier"]')?.value) || 0;
    const totalBonus = activeBonusTotal + modifier;

    return {
      activeBonusTotal,
      totalBonus,
      modifier,
      activeBonuses,
      disabledBonuses,
      disabledEffectIds
    };
  }

  /**
   * Recalculates and updates the dynamic bonus display in the header.
   */
  _updateHeaderBonus() {
    const { totalBonus } = this._calculateCurrentBonuses();
    const bonusEl = this.element.querySelector(".dynamic-bonus");
    if (bonusEl) {
      bonusEl.textContent = totalBonus >= 0 ? `+ ${totalBonus}` : `- ${Math.abs(totalBonus)}`;
    }
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Attach real-time recalculation on child checkboxes
    const childCheckboxes = this.element.querySelectorAll(".bonus-child-checkbox");
    childCheckboxes.forEach(cb => {
      cb.addEventListener("change", (e) => {
        const row = e.target.closest(".bonus-child-row");
        if (row) {
          row.classList.toggle("is-unchecked", !e.target.checked);
        }

        const group = e.target.closest(".bonus-accordion-group");
        if (group) {
          const checkedChildren = group.querySelectorAll(".bonus-child-checkbox:checked");
          let sum = 0;
          checkedChildren.forEach(c => {
            sum += parseFloat(c.dataset.value) || 0;
          });
          const totalEl = group.querySelector(".accordion-total");
          if (totalEl) {
            totalEl.textContent = (sum >= 0 ? `+${sum}` : `${sum}`);
          }
        }

        this._updateHeaderBonus();
      });
    });

    // Attach change listener on standard bonus checkboxes
    const standardCheckboxes = this.element.querySelectorAll(".bonus-checkbox");
    standardCheckboxes.forEach(cb => {
      cb.addEventListener("change", (e) => {
        const row = e.target.closest(".standard-bonus-row");
        if (row) {
          row.classList.toggle("is-unchecked", !e.target.checked);
        }
        this._updateHeaderBonus();
      });
    });

    // Attach listener on modifier input
    const modifierInput = this.element.querySelector('input[name="modifier"]');
    if (modifierInput) {
      modifierInput.addEventListener("input", () => this._updateHeaderBonus());
      modifierInput.addEventListener("change", () => this._updateHeaderBonus());
    }
  }

  /**
   * Action handler to toggle accordion expanded/collapsed state.
   */
  static #onToggleAccordion(event, target) {
    event.preventDefault();
    const group = target.closest(".bonus-accordion-group");
    if (!group) return;

    const content = group.querySelector(".bonus-accordion-content");
    if (!content) return;

    const isCollapsed = content.classList.contains("collapsed");
    content.classList.toggle("collapsed", !isCollapsed);
    group.classList.toggle("expanded", isCollapsed);
  }

  static async #onRoll(event, target) {
    event.preventDefault();
    const cdElement = this.element.querySelector('input[name="cd"]');
    const parsedCd = cdElement ? parseInt(cdElement.value) : null;
    const cd = (parsedCd !== null && !isNaN(parsedCd)) ? parsedCd : 10;

    const {
      activeBonusTotal,
      totalBonus,
      modifier,
      activeBonuses,
      disabledBonuses,
      disabledEffectIds
    } = this._calculateCurrentBonuses();

    this.resolve({
      modifier,
      cd,
      activeBonusTotal,
      totalBonus,
      activeBonuses,
      disabledBonuses,
      disabledEffectIds
    });
    this.close();
  }

  static async #onCancel(event, target) {
    this.resolve(null);
    this.close();
  }

  /**
   * Static helper to wait for the dialog result.
   */
  static async wait(data, options={}) {
    return new Promise((resolve) => {
      const dialog = new TrespasserRollDialog({
        data,
        resolve,
        window: {
          title: options.title || game.i18n.localize("TRESPASSER.Dialog.Roll.Title")
        }
      });
      
      // Patch close to ensure the promise resolves
      const originalClose = dialog.close.bind(dialog);
      dialog.close = async function(closeOptions) {
        resolve(null);
        return originalClose(closeOptions);
      };

      dialog.render(true);
    });
  }
}

