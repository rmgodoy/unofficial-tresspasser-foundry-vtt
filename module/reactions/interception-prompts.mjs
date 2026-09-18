import { RangeHelper } from "../helpers/range-helper.mjs";
import { TrespasserSocket } from "../helpers/socket/socket.mjs";

const _pendingInterceptions = new Map();

/**
 * Resolve the user that should be prompted for a reactive interception.
 * - For a companion: check the bound character's active player owner, or direct active player owner.
 * - For characters: check active player owner.
 * - Returns null if no active non-GM player owner is found (indicating GM will handle locally).
 * @param {Actor} actor
 * @returns {User|null}
 */
export function getInterceptionTargetUser(actor) {
  if (!actor) return null;

  if (actor.type === "companion") {
    const boundChar = actor.system?.getBoundCharacter?.() 
      || (actor.system?.boundCharacterId ? game.actors.get(actor.system.boundCharacterId) : null);
    if (boundChar) {
      const boundOwner = game.users.find(u => !u.isGM && boundChar.testUserPermission(u, "OWNER") && u.active);
      if (boundOwner) return boundOwner;
    }
  }

  const directOwner = game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER") && u.active);
  if (directOwner) return directOwner;

  return null;
}

/**
 * Prompt protector (or their controlling player via socket) to select which allies to protect in an AoE attack.
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {Array<{ actor: Actor, token: Token, amount: number }>} eligibleTargets
 * @param {Token} [sourceToken]
 * @returns {Promise<Set<string>>}
 */
export async function promptBatchInterception(sourceActor, effectItem, eligibleTargets = [], sourceToken = null) {
  if (!sourceActor || !effectItem || eligibleTargets.length === 0) return new Set();

  const targetUser = getInterceptionTargetUser(sourceActor);

  // If owned by an active remote player, delegate prompt via socket
  if (targetUser && targetUser.id !== game.user.id) {
    const requestId = foundry.utils.randomID();
    const promise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        _pendingInterceptions.delete(requestId);
        resolve(new Set());
      }, 900000);
      _pendingInterceptions.set(requestId, { resolve, timeout });
    });

    TrespasserSocket.emit("INTERCEPTION_BATCH_REQUEST", {
      requestId,
      targetUserId: targetUser.id,
      sourceActorId: sourceActor.id,
      effectItemId: effectItem.id,
      sourceTokenId: sourceToken?.id || null,
      eligibleTargets: eligibleTargets.map(e => ({
        actorId: e.actor?.id,
        tokenId: e.token?.id,
        amount: e.amount
      }))
    });

    ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Combat.WaitingForReaction", {
      name: targetUser.name,
      reaction: effectItem.name
    }));

    return promise;
  }

  return _promptBatchInterceptionLocally(sourceActor, effectItem, eligibleTargets, sourceToken);
}

/**
 * Show batch protection DialogV2 locally on current client.
 * @private
 */
export async function _promptBatchInterceptionLocally(sourceActor, effectItem, eligibleTargets = [], sourceToken = null) {
  if (typeof foundry?.applications?.api?.DialogV2?.wait !== "function") {
    return new Set(eligibleTargets.map(e => e.actor?.id).filter(Boolean));
  }

  const rawLimit = effectItem.system?.targetLimit || "all";
  const isAll = rawLimit === "all";
  const numLimit = isAll 
    ? eligibleTargets.length 
    : Math.max(1, Number(effectItem.system?.targetLimitCount) || (parseInt(rawLimit) || 1));
  const mode = effectItem.system?.interceptionMode;
  const isReduce = mode === "reduce_damage";

  const promptTitle = effectItem.name;
  let promptHeader;
  if (isAll) {
    const key = isReduce ? "TRESPASSER.Dialog.Combat.ConfirmBatchReduceDamageAll" : "TRESPASSER.Dialog.Combat.ConfirmBatchRedirectDamageAll";
    promptHeader = game.i18n.format(key, {
      caster: sourceActor.name,
      effect: effectItem.name
    }) || `${sourceActor.name}: Select allies to protect via ${effectItem.name}:`;
  } else {
    const key = isReduce ? "TRESPASSER.Dialog.Combat.ConfirmBatchReduceDamage" : "TRESPASSER.Dialog.Combat.ConfirmBatchRedirectDamage";
    promptHeader = game.i18n.format(key, {
      caster: sourceActor.name,
      effect: effectItem.name,
      limit: numLimit
    }) || `${sourceActor.name}: Select allies to protect via ${effectItem.name} (Max ${numLimit}):`;
  }

  const targetsHtml = eligibleTargets.map((item, idx) => {
    const actor = item.actor;
    const token = item.token;
    const dist = (sourceToken && token && canvas?.grid) ? RangeHelper.measureDistanceSquares(sourceToken, token) : 0;
    const dmg = Number(item.amount) || 0;
    const isChecked = idx < numLimit;

    return `
      <label class="batch-target-row" style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer; padding:6px; border:1px solid var(--trp-border-light, #5c4f3a); border-radius:4px; background:rgba(0,0,0,0.2);">
        <input type="checkbox" name="targetChoice" value="${actor.id}" data-damage="${dmg}" ${isChecked ? "checked" : ""} style="cursor:pointer;" />
        <img src="${token?.document?.texture?.src || token?.texture?.src || actor.img}" style="width:32px; height:32px; border:none; border-radius:3px;" />
        <div style="flex:1;">
          <strong>${token?.name || actor.name}</strong>
          <span style="font-size:var(--fs-11); color:var(--trp-text-dim, #a09070); margin-left:6px;">(${game.i18n.format("TRESPASSER.Dialog.Combat.SquaresAway", { dist })})</span>
          ${dmg > 0 ? `<div style="font-size:var(--fs-11); color:#ff7979;">${game.i18n.format("TRESPASSER.Dialog.Combat.IncomingDamage", { amount: dmg })}</div>` : ""}
        </div>
      </label>
    `;
  }).join("");

  const content = `
    <div class="trespasser-dialog batch-protection-dialog" style="padding:4px;">
      <p style="font-size:var(--fs-12); margin-bottom:10px;">${promptHeader}</p>
      <div class="batch-targets-list" data-limit="${numLimit}">
        ${targetsHtml}
      </div>
    </div>
  `;

  try {
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: promptTitle },
      classes: ["trespasser", "dialog"],
      position: { width: 380 },
      content,
      buttons: [
        {
          action: "accept",
          icon: "fas fa-shield-halved",
          label: game.i18n.localize("TRESPASSER.Global.Action.Accept") || "Accept",
          default: true,
          callback: (event, button, dialog) => {
            const checkedInputs = dialog.element.querySelectorAll('input[name="targetChoice"]:checked');
            const selectedIds = Array.from(checkedInputs).map(cb => cb.value);
            return new Set(selectedIds.slice(0, numLimit));
          }
        },
        {
          action: "decline",
          icon: "fas fa-times",
          label: game.i18n.localize("TRESPASSER.Dialog.Combat.PassAll") || game.i18n.localize("TRESPASSER.Global.Action.Pass") || "Pass All",
          callback: () => new Set()
        }
      ]
    });

    return result instanceof Set ? result : new Set();
  } catch (_) {
    return new Set();
  }
}

/**
 * Prompt protector (or remote player via socket) for single-target damage interception confirmation.
 * @param {Actor} sourceActor
 * @param {Item} effectItem
 * @param {string} targetName
 * @param {number} amount
 * @param {string} mode
 * @returns {Promise<boolean>}
 */
export async function promptSingleInterception(sourceActor, effectItem, targetName, amount, mode) {
  if (!sourceActor || !effectItem) return false;

  const targetUser = getInterceptionTargetUser(sourceActor);

  if (targetUser && targetUser.id !== game.user.id) {
    const requestId = foundry.utils.randomID();
    const promise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        _pendingInterceptions.delete(requestId);
        resolve(false);
      }, 900000);
      _pendingInterceptions.set(requestId, { resolve, timeout });
    });

    TrespasserSocket.emit("INTERCEPTION_SINGLE_REQUEST", {
      requestId,
      targetUserId: targetUser.id,
      sourceActorId: sourceActor.id,
      effectItemId: effectItem.id,
      targetName,
      amount,
      mode
    });

    ui.notifications.info(game.i18n.format("TRESPASSER.Chat.Combat.WaitingForReaction", {
      name: targetUser.name,
      reaction: effectItem.name
    }));

    return promise;
  }

  return _promptSingleInterceptionLocally(sourceActor, effectItem, targetName, amount, mode);
}

/**
 * Show single interception confirmation DialogV2 locally.
 * @private
 */
export async function _promptSingleInterceptionLocally(sourceActor, effectItem, targetName, amount, mode) {
  if (typeof foundry?.applications?.api?.DialogV2?.confirm !== "function") return true;

  const isReduce = mode === "reduce_damage";
  const key = isReduce ? "TRESPASSER.Dialog.Combat.ConfirmReduceDamage" : "TRESPASSER.Dialog.Combat.ConfirmRedirectDamage";
  const confirmPrompt = game.i18n.format(key, {
    caster: sourceActor.name,
    target: targetName,
    effect: effectItem.name,
    amount: amount
  }) || `${sourceActor.name}: Intercept ${amount} damage for ${targetName}?`;

  return foundry.applications.api.DialogV2.confirm({
    window: { title: effectItem.name },
    content: `<div class="trespasser-dialog"><p style="font-size: var(--fs-13); margin: 0;">${confirmPrompt}</p></div>`,
    yes: { label: game.i18n.localize("TRESPASSER.Global.Action.Accept") || "Accept", icon: "fas fa-shield-halved" },
    no: { label: game.i18n.localize("TRESPASSER.Global.Action.Pass") || "Pass", icon: "fas fa-times" },
    defaultYes: true
  });
}

/**
 * Socket Handler: Remote client received batch interception prompt.
 */
export async function handleInterceptionBatchRequest(data, senderId) {
  if (data.targetUserId !== game.user.id) return;

  const sourceActor = game.actors.get(data.sourceActorId);
  const effectItem = sourceActor?.items?.get(data.effectItemId);
  if (!sourceActor || !effectItem) return;

  const sourceToken = data.sourceTokenId ? (canvas.tokens?.get(data.sourceTokenId) || null) : null;
  const eligibleTargets = (data.eligibleTargets || []).map(e => {
    const actor = game.actors.get(e.actorId);
    const token = e.tokenId ? canvas.tokens?.get(e.tokenId) : null;
    return actor ? { actor, token, amount: e.amount } : null;
  }).filter(Boolean);

  const approvedSet = await _promptBatchInterceptionLocally(sourceActor, effectItem, eligibleTargets, sourceToken);

  TrespasserSocket.emit("INTERCEPTION_BATCH_RESPONSE", {
    requestId: data.requestId,
    approvedActorIds: Array.from(approvedSet)
  });
}

/**
 * Socket Handler: Sender received batch interception resolution.
 */
export function handleInterceptionBatchResponse(data) {
  const entry = _pendingInterceptions.get(data.requestId);
  if (entry) {
    clearTimeout(entry.timeout);
    _pendingInterceptions.delete(data.requestId);
    entry.resolve(new Set(data.approvedActorIds || []));
  }
}

/**
 * Socket Handler: Remote client received single interception prompt.
 */
export async function handleInterceptionSingleRequest(data, senderId) {
  if (data.targetUserId !== game.user.id) return;

  const sourceActor = game.actors.get(data.sourceActorId);
  const effectItem = sourceActor?.items?.get(data.effectItemId);
  if (!sourceActor || !effectItem) return;

  const confirmed = await _promptSingleInterceptionLocally(sourceActor, effectItem, data.targetName, data.amount, data.mode);

  TrespasserSocket.emit("INTERCEPTION_SINGLE_RESPONSE", {
    requestId: data.requestId,
    confirmed
  });
}

/**
 * Socket Handler: Sender received single interception confirmation resolution.
 */
export function handleInterceptionSingleResponse(data) {
  const entry = _pendingInterceptions.get(data.requestId);
  if (entry) {
    clearTimeout(entry.timeout);
    _pendingInterceptions.delete(data.requestId);
    entry.resolve(Boolean(data.confirmed));
  }
}
