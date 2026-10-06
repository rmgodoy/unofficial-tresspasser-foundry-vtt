/**
 * Stylized Roll Dialog for Trespasser.
 * Uses ApplicationsV2.
 * Supports toggleable bonuses and collapsible Effect Bonus accordion for Roll,
 * and simplified target CD accordions.
 */
export class TrespasserRollDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {

  constructor(options={}) {
    super(options);
    this.data = options.data || {};
    this.resolve = options.resolve;
    this.contextTargets = [];
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
      toggleTargetAccordion: TrespasserRollDialog.#onToggleTargetAccordion,
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

    const normalizeBonusList = (list, prefix = "bonus") => {
      return (list || []).map((b, idx) => {
        const isAccordion = !!b.isAccordion || (Array.isArray(b.children) && b.children.length > 0);
        const children = (b.children || []).map((c, cIdx) => ({
          id: c.id ?? `${prefix}-child-${idx}-${cIdx}`,
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
          id: b.id ?? b.key ?? `${prefix}-${idx}`,
          key: b.key ?? b.id ?? `${prefix}-${idx}`,
          label: b.label || "",
          value: computedValue,
          isAccordion,
          isBase: !!b.isBase || b.key === "baseDefense" || b.key === "baseAccuracy" || b.key === "baseStat",
          children,
          hasChildren: children.length > 0,
          toggleable: b.toggleable ?? (!isAccordion),
          checked: b.checked ?? true
        };
      });
    };

    context.bonuses = normalizeBonusList(this.data.bonuses, "roll");

    let initialBonusTotal = 0;
    for (const b of context.bonuses) {
      if (b.isAccordion && b.hasChildren) {
        for (const c of b.children) if (c.checked) initialBonusTotal += c.value;
      } else if (b.checked) {
        initialBonusTotal += b.value;
      }
    }
    const initialModifier = this.data.modifier || 0;
    const initialTotal = initialBonusTotal + initialModifier;
    context.initialBonusFormatted = initialTotal >= 0 ? `+ ${initialTotal}` : `- ${Math.abs(initialTotal)}`;

    context.rollBonusesLabel = this.data.rollBonusesLabel || (this.data.isDefense
      ? (game.i18n.localize("TRESPASSER.Dialog.Roll.DefenseBonuses") || "Defense Bonuses")
      : (game.i18n.localize("TRESPASSER.Dialog.Roll.AccuracyBonuses") || "Accuracy Bonuses"));

    context.cdSectionLabel = this.data.cdSectionLabel || (this.data.isDefense
      ? (game.i18n.localize("TRESPASSER.Dialog.Roll.AttackerAccuracy") || "Attacker Accuracy (CD)")
      : (game.i18n.localize("TRESPASSER.Dialog.Roll.TargetCD") || "Target CD"));

    // Prepare Targets & CD Accordions
    const rawTargets = this.data.targets ?? (this.data.cdBonuses ? [{
      id: "target-0",
      name: this.data.targetName || game.i18n.localize("TRESPASSER.Terms.DC"),
      img: this.data.targetImg || "icons/svg/mystery-man.svg",
      versus: this.data.versus || "10",
      versusLabel: this.data.versusLabel || game.i18n.localize("TRESPASSER.Terms.DC"),
      baseCD: this.data.cd ?? 10,
      baseLabel: this.data.baseLabel,
      sumBonuses: 0,
      bonuses: this.data.cdBonuses
    }] : null);

    const hasCDBonuses = Boolean(rawTargets && rawTargets.length > 0);
    context.hasCDBonuses = hasCDBonuses;
    context.showCD = this.data.showCD ?? hasCDBonuses;

    if (hasCDBonuses) {
      const preparedTargets = rawTargets.map((t, tIdx) => {
        const normBonuses = (t.bonuses || []).map((b, bIdx) => ({
          id: b.id ?? `target-${tIdx}-bonus-${bIdx}`,
          name: b.name || b.label || "Bonus",
          value: typeof b.value === "number" ? b.value : (parseFloat(b.value) || 0),
          checked: b.checked ?? true,
          description: b.description || ""
        }));

        const hasBonuses = normBonuses.length > 0;
        const sumBonuses = normBonuses.reduce((sum, b) => sum + (b.checked ? b.value : 0), 0);
        const baseCD = typeof t.baseCD === "number" ? t.baseCD : 10;
        const totalCD = baseCD + sumBonuses;
        const formattedSum = sumBonuses >= 0 ? `+ ${sumBonuses}` : `- ${Math.abs(sumBonuses)}`;
        const headerCDText = hasBonuses ? `CD ${totalCD} (${baseCD} ${formattedSum})` : `CD ${totalCD}`;
        const baseLabel = t.baseLabel || (this.data.isDefense
          ? (game.i18n.localize("TRESPASSER.Dialog.Roll.BaseAccuracy") || "Base Accuracy")
          : (game.i18n.localize("TRESPASSER.Dialog.Roll.BaseDefense") || "Base Defense"));

        return {
          ...t,
          baseCD,
          baseLabel,
          sumBonuses,
          totalCD,
          headerCDText,
          bonuses: normBonuses,
          hasBonuses
        };
      });

      // Sort targets: higher CD first; between same CD, higher bonuses first
      preparedTargets.sort((a, b) => {
        if (b.totalCD !== a.totalCD) return b.totalCD - a.totalCD;
        if (b.sumBonuses !== a.sumBonuses) return b.sumBonuses - a.sumBonuses;
        return (a.name || "").localeCompare(b.name || "");
      });

      context.targets = preparedTargets.map((t, idx) => ({ ...t, targetIndex: idx }));
      this.contextTargets = context.targets;
    } else {
      context.cd = this.data.cd ?? 10;
      this.contextTargets = [];
    }

    return context;
  }

  /**
   * Evaluates the current state of roll bonuses, checkboxes, and modifier in the dialog.
   * @returns {object} Calculated totals and bonus breakdown
   */
  _calculateRollBonuses() {
    const list = this.element.querySelector(".roll-bonuses-list") || this.element.querySelector(".bonuses-list:not(.cd-bonuses-list)");
    let activeBonusTotal = 0;
    const activeBonuses = [];
    const disabledBonuses = [];
    const disabledEffectIds = [];

    if (list) {
      list.querySelectorAll(".standard-bonus-row").forEach(row => {
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

      list.querySelectorAll(".bonus-accordion-group").forEach(group => {
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
          const totalText = group.querySelector(".accordion-total")?.textContent?.replace("+", "")?.trim();
          const value = parseFloat(totalText) || 0;
          const label = group.querySelector(".bonus-label")?.textContent?.trim() || "Effect Bonus";
          activeBonusTotal += value;
          activeBonuses.push({ label, value, isChecked: true });
        }
      });
    }

    const modifierInput = this.element.querySelector('.roll-column input[name="modifier"]') || this.element.querySelector('input[name="modifier"]');
    const modifier = parseInt(modifierInput?.value) || 0;
    return {
      activeBonusTotal,
      totalBonus: activeBonusTotal + modifier,
      modifier,
      activeBonuses,
      disabledBonuses,
      disabledEffectIds
    };
  }

  _calculateCurrentBonuses() { return this._calculateRollBonuses(); }

  _calculateTargetCDBonus(targetIndex) {
    const item = this.element.querySelector(`.target-accordion-item[data-target-index="${targetIndex}"]`);
    if (!item) return null;

    const origTarget = this.contextTargets?.[targetIndex] || {};
    const baseCD = origTarget.baseCD ?? 10;
    let sumBonuses = 0;
    const activeBonuses = [];
    const disabledBonuses = [];
    const disabledEffectIds = [];

    item.querySelectorAll(".target-bonus-row").forEach(row => {
      const cb = row.querySelector(".target-bonus-checkbox");
      if (!cb) return;
      const name = row.querySelector(".bonus-name")?.textContent?.trim() || "";
      const value = parseFloat(cb.dataset.value) || 0;
      const isChecked = cb.checked;
      const id = cb.dataset.bonusId || "";

      const entry = { id, name, value, isChecked };
      if (isChecked) {
        sumBonuses += value;
        activeBonuses.push(entry);
      } else {
        disabledBonuses.push(entry);
        if (id) disabledEffectIds.push(id);
      }
    });

    const hasBonuses = !!origTarget.hasBonuses;
    const totalCD = baseCD + sumBonuses;
    const formattedSum = sumBonuses >= 0 ? `+ ${sumBonuses}` : `- ${Math.abs(sumBonuses)}`;
    const headerCDText = hasBonuses ? `CD ${totalCD} (${baseCD} ${formattedSum})` : `CD ${totalCD}`;

    return {
      targetIndex,
      baseCD,
      sumBonuses,
      totalCD,
      headerCDText,
      hasBonuses,
      activeBonuses,
      disabledBonuses,
      disabledEffectIds
    };
  }

  _calculateAllTargetCDs() {
    const items = this.element.querySelectorAll(".target-accordion-item");
    if (!items || items.length === 0) return [];
    const results = [];
    items.forEach(item => {
      const idx = parseInt(item.dataset.targetIndex) || 0;
      const res = this._calculateTargetCDBonus(idx);
      if (res) results.push({ ...(this.contextTargets?.[idx] || {}), ...res });
    });
    return results;
  }

  _updateHeaderBonus() {
    const { totalBonus } = this._calculateRollBonuses();
    const bonusEl = this.element.querySelector(".roll-column .dynamic-bonus, .dynamic-bonus");
    if (bonusEl) bonusEl.textContent = totalBonus >= 0 ? `+ ${totalBonus}` : `- ${Math.abs(totalBonus)}`;
  }

  _updateTargetCD(targetIndex) {
    const result = this._calculateTargetCDBonus(targetIndex);
    if (!result) return;
    const item = this.element.querySelector(`.target-accordion-item[data-target-index="${targetIndex}"]`);
    const summaryEl = item?.querySelector(".target-cd-summary");
    if (summaryEl) summaryEl.textContent = result.headerCDText;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.contextTargets = context.targets || [];
    if (context.hasCDBonuses) this.element.classList.add("has-cd-bonuses");

    this.element.querySelectorAll(".target-bonus-checkbox").forEach(cb => {
      cb.addEventListener("change", (e) => {
        e.target.closest(".target-bonus-row")?.classList.toggle("is-unchecked", !e.target.checked);
        this._updateTargetCD(parseInt(e.target.dataset.targetIndex) || 0);
      });
    });

    this.element.querySelectorAll(".bonus-child-checkbox").forEach(cb => {
      cb.addEventListener("change", (e) => {
        e.target.closest(".bonus-child-row")?.classList.toggle("is-unchecked", !e.target.checked);
        const group = e.target.closest(".bonus-accordion-group");
        if (group) {
          let sum = 0;
          group.querySelectorAll(".bonus-child-checkbox:checked").forEach(c => {
            sum += parseFloat(c.dataset.value) || 0;
          });
          const totalEl = group.querySelector(".accordion-total");
          if (totalEl) totalEl.textContent = (sum >= 0 ? `+${sum}` : `${sum}`);
        }
        this._updateHeaderBonus();
      });
    });

    this.element.querySelectorAll(".bonus-checkbox").forEach(cb => {
      cb.addEventListener("change", (e) => {
        e.target.closest(".standard-bonus-row")?.classList.toggle("is-unchecked", !e.target.checked);
        this._updateHeaderBonus();
      });
    });

    const modifierInput = this.element.querySelector('input[name="modifier"]');
    if (modifierInput) {
      modifierInput.addEventListener("input", () => this._updateHeaderBonus());
      modifierInput.addEventListener("change", () => this._updateHeaderBonus());
    }
  }

  static #onToggleAccordion(event, target) {
    event.preventDefault();
    const group = target.closest(".bonus-accordion-group");
    const content = group?.querySelector(".bonus-accordion-content");
    if (!content) return;
    const isCollapsed = content.classList.contains("collapsed");
    content.classList.toggle("collapsed", !isCollapsed);
    group.classList.toggle("expanded", isCollapsed);
  }

  static #onToggleTargetAccordion(event, target) {
    event.preventDefault();
    const item = target.closest(".target-accordion-item");
    if (!item || !item.classList.contains("clickable")) return;
    const content = item.querySelector(".target-accordion-content");
    if (!content) return;
    const isCollapsed = content.classList.contains("collapsed");
    content.classList.toggle("collapsed", !isCollapsed);
    item.classList.toggle("expanded", isCollapsed);
  }

  static async #onRoll(event, target) {
    event.preventDefault();
    const rollResult = this._calculateRollBonuses();
    const targetsResult = this._calculateAllTargetCDs();

    let cd = 10;
    if (targetsResult.length > 0) {
      cd = targetsResult[0].totalCD;
    } else {
      const cdElement = this.element.querySelector('input[name="cd"]');
      const parsedCd = cdElement ? parseInt(cdElement.value) : null;
      cd = (parsedCd !== null && !isNaN(parsedCd)) ? parsedCd : 10;
    }

    this.resolve({
      modifier: rollResult.modifier,
      activeBonusTotal: rollResult.activeBonusTotal,
      totalBonus: rollResult.totalBonus,
      activeBonuses: rollResult.activeBonuses,
      disabledBonuses: rollResult.disabledBonuses,
      disabledEffectIds: rollResult.disabledEffectIds,
      cd,
      targets: targetsResult
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
      const hasCDBonuses = (Array.isArray(data.targets) && data.targets.length > 0)
        || (Array.isArray(data.cdBonuses) && data.cdBonuses.length > 0);
      const width = options.width || (hasCDBonuses ? 580 : 340);
      const classes = ["trespasser", "dialog", "roll-dialog"];
      if (hasCDBonuses) classes.push("has-cd-bonuses");

      const dialog = new TrespasserRollDialog({
        data,
        resolve,
        classes,
        position: { width, height: "auto" },
        window: {
          title: options.title || game.i18n.localize("TRESPASSER.Dialog.Roll.Title")
        }
      });
      
      const originalClose = dialog.close.bind(dialog);
      dialog.close = async function(closeOptions) {
        resolve(null);
        return originalClose(closeOptions);
      };

      dialog.render(true);
    });
  }
}
