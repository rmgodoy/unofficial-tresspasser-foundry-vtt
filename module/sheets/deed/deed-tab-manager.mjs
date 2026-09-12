/**
 * deed-tab-manager.mjs
 * Tab switching and auto-resizing controller for TrespasserDeedSheet.
 */

import { SYSTEM_ID } from "../../system-id.mjs";

/**
 * Handles tab change operations and layout sizing for the deed sheet.
 * @param {object} sheet - TrespasserDeedSheet instance
 * @param {PointerEvent|Event} event
 * @param {HTMLElement} [target]
 */
export async function handleDeedSwitchTab(sheet, event, target) {
  event?.preventDefault?.();
  const tab = target?.dataset?.tab || event?.currentTarget?.dataset?.tab;
  if (tab && sheet.constructor.TABS[tab]) {
    const prevTab = sheet.tabGroups.primary;
    if (tab === prevTab) return;

    // Persist uncommitted changes from current tab before switching
    if (prevTab === "behaviors" && sheet.graphEditor) {
      sheet._graphViewportState = sheet.graphEditor.getViewportState();
      if (sheet.isEditable) {
        await sheet.document.update({
          "system.graph": sheet.graphEditor.getGraph(),
          "system.graphVersion": 1,
          [`flags.${SYSTEM_ID}.graphViewport`]: sheet._graphViewportState
        });
      }
    } else if (sheet.isEditable) {
      await sheet.submit();
    }

    sheet.tabGroups.primary = tab;

    // Auto-resize window width when switching to/from behaviors tab if user has not manually resized
    if (!sheet._hasManuallyResized) {
      if (tab === "behaviors" && prevTab !== "behaviors") {
        sheet._previousWidth = sheet.position.width || 620;
        const targetWidth = Math.max(950, sheet._previousWidth);
        sheet._isAutoResizing = true;
        try {
          sheet.setPosition({ width: targetWidth });
        } finally {
          sheet._isAutoResizing = false;
        }
      } else if (prevTab === "behaviors" && tab !== "behaviors") {
        const targetWidth = sheet._previousWidth || 620;
        sheet._isAutoResizing = true;
        try {
          sheet.setPosition({ width: targetWidth });
        } finally {
          sheet._isAutoResizing = false;
        }
      }
    }

    sheet.render();
  }
}

export { handleDeedSwitchTab as onTabChange };
