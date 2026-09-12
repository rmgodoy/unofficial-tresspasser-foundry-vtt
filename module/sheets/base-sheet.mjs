import { activateImagePicker } from "../helpers/image-picker-helper.mjs";

const { api, sheets } = foundry.applications;

/**
 * Base Actor Sheet for Trespasser (ApplicationV2)
 */
export class TrespasserBaseActorSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
  /** @override */
  async _renderHTML(context, options) {
    const activeEl = document.activeElement;
    if (activeEl && this.element?.contains(activeEl) && (activeEl.name || activeEl.dataset?.field || activeEl.id)) {
      this._focusedElementInfo = {
        name: activeEl.name,
        id: activeEl.id,
        datasetField: activeEl.dataset?.field,
        selectionStart: activeEl.selectionStart,
        selectionEnd: activeEl.selectionEnd,
        value: activeEl.value
      };
    } else {
      this._focusedElementInfo = null;
    }
    return super._renderHTML(context, options);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    activateImagePicker(this);

    // Restore focus if this sheet was re-rendered while an input was focused
    if (this._focusedElementInfo) {
      const info = this._focusedElementInfo;
      this._focusedElementInfo = null;
      let el = null;
      if (info.name) {
        try {
          el = this.element.querySelector(`[name="${CSS.escape(info.name)}"]`);
        } catch (_) {}
      }
      if (!el && info.id) {
        try {
          el = this.element.querySelector(`#${CSS.escape(info.id)}`);
        } catch (_) {}
      }
      if (!el && info.datasetField) {
        try {
          el = this.element.querySelector(`[data-field="${CSS.escape(info.datasetField)}"]`);
        } catch (_) {}
      }
      if (el) {
        if (info.value !== undefined && el.value !== undefined && info.value !== el.value) {
          el.value = info.value;
        }
        el.focus();
        if (typeof info.selectionStart === "number" && typeof info.selectionEnd === "number") {
          try {
            el.setSelectionRange(info.selectionStart, info.selectionEnd);
          } catch (_) {}
        }
      }
    }
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
  _onRender(context, options) {
    super._onRender(context, options);
    activateImagePicker(this);
  }
}

// Aliases for convenience
export const TrespasserActorSheet = TrespasserBaseActorSheet;
export const TrespasserItemSheet = TrespasserBaseItemSheet;
