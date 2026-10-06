import { TargetingHelper } from "../targeting-helper.mjs";
import { CanvasInputSession } from "../../canvas/canvas-input-session.mjs";
import { CanvasSelectionRenderer } from "../../canvas/canvas-selection-renderer.mjs";
import { RangeHelper } from "../range-helper.mjs";
import { DeedIntentResolver } from "../../targeting/deed-intent-resolver.mjs";
import { TargetClassifier } from "../../targeting/target-classifier.mjs";
import { TargetPreviewHUD } from "../../hud/target-preview-hud.mjs";
import { TargetingPreviewSyncer } from "../../targeting/targeting-preview-syncer.mjs";
import { SYSTEM_ID } from "../../system-id.mjs";

/**
 * Interactive token selection session via CanvasInputSession.
 * @param {object} options
 * @param {Token[]} [options.candidateTokens] - If provided, only allows choosing from these candidate tokens
 * @param {number} options.maxCount - Max targets to select
 * @param {Token} options.sourceToken - Source caster token
 * @param {object} options.params - Behavior params
 * @param {Array<{x:number, y:number}>} [options.areaSquares] - Optional area squares for visual boundary overlay
 * @param {Item} [options.item] - Deed item
 * @param {Actor} [options.actor] - Source actor
 * @param {string|null} [options.activeNodeId] - ID of the active targeting node in the graph
 * @param {object|null} [options.runtimeContext] - Runtime execution context from DeedExecutor
 * @returns {Promise<Token[]|null>}
 */
export async function selectTokensInteractive({ candidateTokens = null, maxCount = 1, sourceToken, params = {}, areaSquares = null, item = null, actor = null, originOverride = null, activeNodeId = null, runtimeContext = null }) {
  const isAreaMode = Array.isArray(areaSquares) && areaSquares.length > 0;
  const gridPx = canvas.grid.size;
  const maxRangeSq = isAreaMode ? null : RangeHelper.getDeedRange(sourceToken, item, actor, { notify: true });
  const origin = originOverride || params.originOverride || (sourceToken ? { x: sourceToken.document?.x ?? sourceToken.x, y: sourceToken.document?.y ?? sourceToken.y } : null);
  let hoveredSquare = null;
  let isJump = params.isJump ?? RangeHelper.deedInvolvesJump(item, actor);

  // Pre-populate selection from candidate tokens (area sub-selection) or existing user targets (if valid)
  let initialTargets = [];
  if (candidateTokens && candidateTokens.length <= maxCount) {
    initialTargets = [...candidateTokens];
  } else if (!candidateTokens && game.user?.targets?.size > 0 && game.user.targets.size <= maxCount) {
    initialTargets = Array.from(game.user.targets).filter(t => {
      if (params.ignoreSelf && (t.id === sourceToken?.id || t.document?.id === sourceToken?.id)) return false;
      if (params.disposition && !TargetingHelper.matchesDisposition(t, params.disposition, sourceToken)) return false;
      if (!isAreaMode && maxRangeSq !== null && maxRangeSq !== undefined && !RangeHelper.isWithinRange(sourceToken, t, maxRangeSq, { originOverride: origin })) return false;
      return true;
    });
  }
  const selectedTargets = initialTargets;

  if (game.user.updateTokenTargets && selectedTargets.length > 0) {
    game.user.updateTokenTargets(selectedTargets.map(t => t.id));
  }

  const title = isAreaMode
    ? (game.i18n.has("TRESPASSER.HUD.Action.SelectTargetsFromArea")
        ? game.i18n.localize("TRESPASSER.HUD.Action.SelectTargetsFromArea")
        : "Select Target(s) from Area")
    : (game.i18n.has("TRESPASSER.HUD.Action.SelectTargets")
        ? game.i18n.localize("TRESPASSER.HUD.Action.SelectTargets")
        : "Select Target(s)");

  const formatDetails = (count) => {
    if (isAreaMode && game.i18n.has("TRESPASSER.HUD.AoE.SelectTargetsFromAreaInstruction")) {
      return game.i18n.format("TRESPASSER.HUD.AoE.SelectTargetsFromAreaInstruction", { current: count, max: maxCount });
    }
    if (maxRangeSq && maxRangeSq > 0 && game.i18n.has("TRESPASSER.HUD.AoE.SelectTargetsRangeInstruction")) {
      return game.i18n.format("TRESPASSER.HUD.AoE.SelectTargetsRangeInstruction", { current: count, max: maxCount, range: maxRangeSq });
    }
    if (game.i18n.has("TRESPASSER.HUD.AoE.SelectTargetsInstruction")) {
      return game.i18n.format("TRESPASSER.HUD.AoE.SelectTargetsInstruction", { current: count, max: maxCount });
    }
    return `Select target(s) on canvas (${count} of ${maxCount} selected).`;
  };

  const redrawHighlights = (session, hoveredSq = null) => {
    if (!session || !session.graphics) return;
    session.graphics.clear();

    // 1. Draw subtle area boundary overlay if area mode
    if (isAreaMode) {
      CanvasSelectionRenderer.drawPlacedOrigin(session.graphics, areaSquares, gridPx, {
        color: 0x55AAFF,
        fillAlpha: 0.12,
        lineWeight: 1
      });
    } else if (maxRangeSq && maxRangeSq > 0) {
      CanvasSelectionRenderer.drawRangePerimeter(session.graphics, sourceToken, maxRangeSq, gridPx, { originOverride: origin });
    }

    // 2. Resolve outcomes for candidates and selected targets
    const showInfo = Boolean(game.settings?.get(SYSTEM_ID, "showTargetPreviewInfo") ?? true);
    const allRelevantTokens = [...selectedTargets, ...(candidateTokens || [])];
    const outcomeMap = (showInfo && item)
      ? DeedIntentResolver.resolveTargetsOutcome(allRelevantTokens, sourceToken, item, {
          actor,
          params: { ...params, isJump },
          selectedTargets,
          activeNodeId,
          runtimeContext,
          areaSquares: isAreaMode ? areaSquares : null
        })
      : new Map();

    if (showInfo && allRelevantTokens.length > 0) {
      TargetPreviewHUD.update(Array.from(outcomeMap.values()));
    } else {
      TargetPreviewHUD.clear();
    }

    // 3. Draw candidate token outlines (if not yet selected)
    if (candidateTokens) {
      for (const cToken of candidateTokens) {
        if (selectedTargets.some(t => t.id === cToken.id)) continue;
        const outcome = outcomeMap.get(cToken.id || cToken.document?.id);
        if (showInfo && outcome && (!outcome.hasAnyOutcome || outcome.role === "unaffected")) continue;
        const style = (showInfo && outcome?.style)
          ? { ...outcome.style, fillAlpha: 0.12, lineAlpha: 0.5 }
          : { color: 0x00FF00, fillAlpha: 0.15, lineWidth: 2, lineAlpha: 0.6 };
        CanvasSelectionRenderer.drawTokenTargetOverlay(session.graphics, cToken, style, gridPx);
      }
    }

    // 4. Draw highlight overlays over already selected targets
    for (const targetToken of selectedTargets) {
      const outcome = outcomeMap.get(targetToken.id || targetToken.document?.id);
      const style = (showInfo && outcome?.style)
        ? { ...outcome.style, fillAlpha: 0.35, lineWidth: 3.5, lineAlpha: 1.0 }
        : TargetClassifier.GENERIC_TARGET_STYLE;
      CanvasSelectionRenderer.drawTokenTargetOverlay(session.graphics, targetToken, style, gridPx);
    }

    // 5. Draw green candidate highlight box over hovered square
    if (hoveredSq) {
      CanvasSelectionRenderer.drawCandidateSquares(session.graphics, [hoveredSq], gridPx, { hoveredSquare: hoveredSq });
    }

    // 6. Broadcast real-time preview to other clients (spectator mode)
    const candidateOverlays = candidateTokens ? candidateTokens.filter(t => !selectedTargets.some(st => st.id === t.id)).map(cToken => {
      const outcome = outcomeMap.get(cToken.id || cToken.document?.id);
      if (showInfo && outcome && (!outcome.hasAnyOutcome || outcome.role === "unaffected")) return null;
      const style = (showInfo && outcome?.style)
        ? { ...outcome.style, fillAlpha: 0.12, lineAlpha: 0.5 }
        : { color: 0x00FF00, fillAlpha: 0.15, lineWidth: 2, lineAlpha: 0.6 };
      return { tokenId: cToken.id || cToken.document?.id, style };
    }).filter(Boolean) : [];

    const selectedOverlays = selectedTargets.map(targetToken => {
      const outcome = outcomeMap.get(targetToken.id || targetToken.document?.id);
      const style = (showInfo && outcome?.style)
        ? { ...outcome.style, fillAlpha: 0.35, lineWidth: 3.5, lineAlpha: 1.0 }
        : TargetClassifier.GENERIC_TARGET_STYLE;
      return { tokenId: targetToken.id || targetToken.document?.id, style };
    });

    TargetingPreviewSyncer.sync({
      rangePerimeter: (!isAreaMode && maxRangeSq && maxRangeSq > 0) ? {
        tokenId: sourceToken?.id,
        rangeSq: maxRangeSq,
        originOverride: origin
      } : null,
      placedSquares: isAreaMode ? areaSquares : null,
      placedOptions: isAreaMode ? { color: 0x55AAFF, fillAlpha: 0.12, lineWeight: 1 } : null,
      candidateSquares: hoveredSq ? [hoveredSq] : null,
      hoveredSquare: hoveredSq,
      targetTokens: [...candidateOverlays, ...selectedOverlays],
      targetOutcomes: allRelevantTokens.length > 0 ? Array.from(outcomeMap.values()) : []
    });
  };

  let isUpdatingUserTargets = false;

  const _onTargetsChanged = (currentSession = null) => {
    if (game.user.updateTokenTargets) {
      isUpdatingUserTargets = true;
      try {
        game.user.updateTokenTargets(selectedTargets.map(t => t.id));
      } finally {
        isUpdatingUserTargets = false;
      }
    }
    const active = currentSession || CanvasInputSession.activeSession;
    if (active) {
      active.updateOverlay({
        details: formatDetails(selectedTargets.length),
        canConfirm: selectedTargets.length > 0
      });
    }
    redrawHighlights(active, hoveredSquare);
  };

  const addTarget = (hitToken, currentSession = null) => {
    if (!hitToken) return;
    if (selectedTargets.some(t => t.id === hitToken.id)) return;

    if (params.ignoreSelf && (hitToken.id === sourceToken?.id || hitToken.document?.id === sourceToken?.id)) {
      return;
    }
    if (params.disposition && !TargetingHelper.matchesDisposition(hitToken, params.disposition, sourceToken)) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.InvalidTargetDisposition") || "Selected target does not match the required disposition.");
      return;
    }

    if (isAreaMode && candidateTokens) {
      const isCandidate = candidateTokens.some(c => c.id === hitToken.id);
      if (!isCandidate) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.TargetMustBeInArea") || "Selected target must be inside the designated area.");
        return;
      }
    }

    const airborneCheck = RangeHelper.canTargetAirborne(sourceToken, hitToken, item, { actor, params, isJump });
    if (!airborneCheck.valid) {
      if (airborneCheck.reason === "airborne_requires_jump") {
        ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.AirborneRequiresJump", {
          name: hitToken.name,
          height: airborneCheck.height
        }));
      } else if (airborneCheck.reason === "airborne_too_high") {
        ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.AirborneTooHigh", {
          name: hitToken.name,
          height: airborneCheck.height,
          aoeSize: airborneCheck.aoeSize
        }));
      }
      return;
    }

    if (!isAreaMode && maxRangeSq !== null && maxRangeSq !== undefined && !RangeHelper.isWithinRange(sourceToken, hitToken, maxRangeSq, { originOverride: origin })) {
      const dist = RangeHelper.measureDistanceSquares(sourceToken, hitToken, { originOverride: origin });
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TargetOutOfRange", {
        name: hitToken.name,
        range: maxRangeSq,
        distance: dist
      }));
      return;
    }

    if (maxCount === 1) {
      selectedTargets.length = 0;
      selectedTargets.push(hitToken);
    } else if (selectedTargets.length < maxCount) {
      selectedTargets.push(hitToken);
    } else {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Combat.TooManyTargets", { max: maxCount, count: selectedTargets.length + 1 }));
      return;
    }

    _onTargetsChanged(currentSession);
  };

  const removeTarget = (hitToken, currentSession = null) => {
    if (!hitToken) return;
    const idx = selectedTargets.findIndex(t => t.id === hitToken.id);
    if (idx >= 0) {
      selectedTargets.splice(idx, 1);
      _onTargetsChanged(currentSession);
    }
  };

  const toggleTarget = (hitToken, currentSession = null) => {
    if (!hitToken) return;
    const idx = selectedTargets.findIndex(t => t.id === hitToken.id);
    if (idx >= 0) {
      if (maxCount === 1) {
        selectedTargets.splice(idx, 1);
        _onTargetsChanged(currentSession);
      } else {
        removeTarget(hitToken, currentSession);
      }
    } else {
      addTarget(hitToken, currentSession);
    }
  };

  let hookTargetId = null;
  let hookControlId = null;

  const cleanupHooks = () => {
    if (hookTargetId !== null) {
      Hooks.off("targetToken", hookTargetId);
      hookTargetId = null;
    }
    if (hookControlId !== null) {
      Hooks.off("controlToken", hookControlId);
      hookControlId = null;
    }
  };

  const resolveTokenPlaceable = (tokenDocOrObj) => {
    if (!tokenDocOrObj) return null;
    const TokenClass = CONFIG.Token?.objectClass || foundry.canvas?.placeables?.Token;
    if (TokenClass && tokenDocOrObj instanceof TokenClass) return tokenDocOrObj;
    return tokenDocOrObj.object || canvas.tokens?.get(tokenDocOrObj.id) || null;
  };

  hookTargetId = Hooks.on("targetToken", (user, tokenDocOrObj, targeted) => {
    if (user.id !== game.user.id) return;
    if (isUpdatingUserTargets) return;
    const tokenObj = resolveTokenPlaceable(tokenDocOrObj);
    if (!tokenObj) return;
    if (targeted) {
      addTarget(tokenObj, CanvasInputSession.activeSession);
    } else {
      removeTarget(tokenObj, CanvasInputSession.activeSession);
    }
  });

  hookControlId = Hooks.on("controlToken", (tokenObj, controlled) => {
    if (!controlled || !tokenObj) return;
    const resolvedToken = resolveTokenPlaceable(tokenObj);
    if (!resolvedToken) return;
    addTarget(resolvedToken, CanvasInputSession.activeSession);
  });

  return CanvasInputSession.start({
    title,
    details: formatDetails(selectedTargets.length),
    icon: isAreaMode ? "fas fa-bullseye" : "fas fa-crosshairs",
    showConfirm: true,
    canConfirm: selectedTargets.length > 0,
    showUndo: false,
    canUndo: false,
    showCancel: true,
    showJumpToggle: true,
    isJump,
    onToggleJump: (newIsJump, session) => {
      isJump = newIsJump;
      redrawHighlights(session, hoveredSquare);
    },
    onPointerMove: (ev, session) => {
      let lastCanvasPos;
      if (typeof ev.getLocalPosition === "function") {
        lastCanvasPos = ev.getLocalPosition(canvas.stage);
      } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
        lastCanvasPos = ev.data.getLocalPosition(canvas.stage);
      } else if (ev.interactionData && ev.interactionData.origin) {
        lastCanvasPos = ev.interactionData.origin;
      }
      if (!lastCanvasPos) return;

      const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
      hoveredSquare = { x: snapped.x, y: snapped.y };
      redrawHighlights(session, hoveredSquare);
    },
    onClick: (ev, session) => {
      let lastCanvasPos;
      if (typeof ev.getLocalPosition === "function") {
        lastCanvasPos = ev.getLocalPosition(canvas.stage);
      } else if (ev.data && typeof ev.data.getLocalPosition === "function") {
        lastCanvasPos = ev.data.getLocalPosition(canvas.stage);
      } else if (ev.interactionData && ev.interactionData.origin) {
        lastCanvasPos = ev.interactionData.origin;
      }
      if (!lastCanvasPos) return;

      const snapped = canvas.grid.getTopLeftPoint(lastCanvasPos);
      hoveredSquare = { x: snapped.x, y: snapped.y };

      const tokensAtPoint = (canvas.tokens?.placeables ?? []).filter(t => {
        const tX = t.document.x;
        const tY = t.document.y;
        const tW = (t.document.width ?? 1) * gridPx;
        const tH = (t.document.height ?? 1) * gridPx;
        return lastCanvasPos.x >= tX && lastCanvasPos.x <= (tX + tW) &&
               lastCanvasPos.y >= tY && lastCanvasPos.y <= (tY + tH);
      });

      const rawTokensMap = new Map();
      for (const t of [...TargetingHelper.getTokensInSquares([{ x: snapped.x, y: snapped.y }], gridPx), ...tokensAtPoint]) {
        rawTokensMap.set(t.id, t);
      }
      const rawTokens = Array.from(rawTokensMap.values());

      const tokensInSq = rawTokens.filter(t => {
        if (params.ignoreSelf && (t.id === sourceToken?.id || t.document?.id === sourceToken?.id)) return false;
        if (params.disposition && !TargetingHelper.matchesDisposition(t, params.disposition, sourceToken)) return false;
        return true;
      });

      if (isAreaMode && candidateTokens) {
        const hitToken = tokensInSq.find(t => candidateTokens.some(c => c.id === t.id));
        if (hitToken) {
          toggleTarget(hitToken, session);
        } else if (rawTokens.length > 0) {
          const isInsideCandidate = rawTokens.some(t => candidateTokens.some(c => c.id === t.id));
          if (!isInsideCandidate) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.TargetMustBeInArea") || "Selected target must be inside the designated area.");
          } else {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.InvalidTargetDisposition") || "Selected target does not match the required disposition.");
          }
        }
      } else {
        if (tokensInSq.length > 0) {
          toggleTarget(tokensInSq[0], session);
        } else if (rawTokens.length > 0) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.InvalidTargetDisposition") || "Selected target does not match the required disposition.");
        }
      }
    },
    onConfirm: () => {
      cleanupHooks();
      TargetPreviewHUD.clear();
      TargetingPreviewSyncer.clear();
      selectedTargets._isJump = isJump;
      return selectedTargets;
    },
    onCancel: () => {
      cleanupHooks();
      TargetPreviewHUD.clear();
      TargetingPreviewSyncer.clear();
      return null;
    }
  });
}
