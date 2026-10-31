import { activateImagePicker } from "../helpers/image-picker-helper.mjs";

const { api, sheets } = foundry.applications;

/**
 * Capture focus and scroll positions before a sheet re-render.
 * @param {ApplicationV2} sheet
 */
function captureSheetUIState(sheet) {
  const root = sheet.element;
  if (!root) return;

  // 1. Capture active element focus
  const activeEl = document.activeElement;
  if (activeEl && root.contains(activeEl) && (activeEl.name || activeEl.dataset?.field || activeEl.id)) {
    sheet._focusedElementInfo = {
      name: activeEl.name,
      id: activeEl.id,
      datasetField: activeEl.dataset?.field,
      selectionStart: activeEl.selectionStart,
      selectionEnd: activeEl.selectionEnd,
      value: activeEl.value
    };
  } else {
    sheet._focusedElementInfo = null;
  }

  // 2. Capture scroll positions of scrollable containers
  sheet._savedScrollPositions = sheet._savedScrollPositions || {};
  root.querySelectorAll(".tab[data-tab], .scrollable, .sheet-body").forEach((el, idx) => {
    const key = el.dataset?.tab
      ? `tab:${el.dataset.tab}`
      : el.id
      ? `id:${el.id}`
      : `cls:${el.className}:${idx}`;
    sheet._savedScrollPositions[key] = el.scrollTop;
  });
}

/**
 * Restore focus and scroll positions after a sheet re-render, and bind scroll listeners.
 * @param {ApplicationV2} sheet
 */
function restoreSheetUIState(sheet) {
  const root = sheet.element;
  if (!root) return;

  // 1. Restore focus without scrolling
  if (sheet._focusedElementInfo) {
    const info = sheet._focusedElementInfo;
    sheet._focusedElementInfo = null;
    let el = null;
    if (info.name) {
      try { el = root.querySelector(`[name="${CSS.escape(info.name)}"]`); } catch (_) {}
    }
    if (!el && info.id) {
      try { el = root.querySelector(`#${CSS.escape(info.id)}`); } catch (_) {}
    }
    if (!el && info.datasetField) {
      try { el = root.querySelector(`[data-field="${CSS.escape(info.datasetField)}"]`); } catch (_) {}
    }
    if (el) {
      if (info.value !== undefined && el.value !== undefined && info.value !== el.value) {
        el.value = info.value;
      }
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
      if (typeof info.selectionStart === "number" && typeof info.selectionEnd === "number") {
        try { el.setSelectionRange(info.selectionStart, info.selectionEnd); } catch (_) {}
      }
    }
  }

  // 2. Restore scroll positions & attach passive scroll trackers
  sheet._savedScrollPositions = sheet._savedScrollPositions || {};
  const applyScrolls = () => {
    if (!sheet.element) return;
    sheet.element.querySelectorAll(".tab[data-tab], .scrollable, .sheet-body").forEach((el, idx) => {
      const key = el.dataset?.tab
        ? `tab:${el.dataset.tab}`
        : el.id
        ? `id:${el.id}`
        : `cls:${el.className}:${idx}`;
      const saved = sheet._savedScrollPositions[key];
      if (typeof saved === "number" && saved > 0) {
        el.scrollTop = saved;
      }
      if (!el._trpScrollBound) {
        el._trpScrollBound = true;
        el.addEventListener("scroll", () => {
          sheet._savedScrollPositions[key] = el.scrollTop;
        }, { passive: true });
      }
    });
  };

  applyScrolls();
  requestAnimationFrame(applyScrolls);
}

/**
 * Base Actor Sheet for Trespasser (ApplicationV2)
 */
export class TrespasserBaseActorSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
  /** @override */
  async _renderHTML(context, options) {
    captureSheetUIState(this);
    return super._renderHTML(context, options);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    activateImagePicker(this);
    restoreSheetUIState(this);
  }

  /** @override */
  async maximize() {
    const result = typeof super.maximize === "function" ? await super.maximize() : undefined;
    if (this._trespasserNeedsEngagementRefresh) {
      this._trespasserNeedsEngagementRefresh = false;
      this.render();
    }
    return result;
  }
}

/**
 * Base Item Sheet for Trespasser (ApplicationV2)
 */
export class TrespasserBaseItemSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {
  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Item.${this.document.type}`) || game.i18n.localize(`TYPES.Item.${this.document.type}`) || this.document.type;
    return `${typeLabel}: ${this.document.name}`;
  }

  /** @override */
  async _renderHTML(context, options) {
    captureSheetUIState(this);
    return super._renderHTML(context, options);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.tags = Array.isArray(this.document.system?.tags) ? this.document.system.tags : [];
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    activateImagePicker(this);
    this._activateTagsEditor();
    restoreSheetUIState(this);
  }

  /**
   * Activate listeners for the reusable tags editor component.
   */
  _activateTagsEditor() {
    if (!this.isEditable) return;
    const html = this.element;

    const tagInput = html.querySelector(".tag-add-input");
    if (tagInput && !tagInput._tagsBound) {
      tagInput._tagsBound = true;
      tagInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const val = tagInput.value.trim().toLowerCase();
          if (val) {
            const tags = Array.isArray(this.document.system?.tags) ? [...this.document.system.tags] : [];
            if (!tags.includes(val)) {
              tags.push(val);
              tagInput.value = "";
              await this.document.update({ "system.tags": tags });
            }
          }
        }
      });
    }

    html.querySelectorAll('[data-action="removeTag"]').forEach(btn => {
      if (btn._tagRemoveBound) return;
      btn._tagRemoveBound = true;
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const idx = Number(event.currentTarget.dataset.index);
        const tags = Array.isArray(this.document.system?.tags) ? [...this.document.system.tags] : [];
        if (idx >= 0 && idx < tags.length) {
          tags.splice(idx, 1);
          await this.document.update({ "system.tags": tags });
        }
      });
    });
  }
}

// Aliases for convenience
export const TrespasserActorSheet = TrespasserBaseActorSheet;
export const TrespasserItemSheet = TrespasserBaseItemSheet;
