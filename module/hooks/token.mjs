import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TargetingHelper } from "../helpers/targeting-helper.mjs";
import { EngagementHelper } from "../helpers/engagement-helper.mjs";
import { PASSIVE_STATES } from "../config/state-config.mjs";
import { registerTokenMovementHooks } from "./token/token-movement.mjs";

let _lastValidControlledTokens = [];

/**
 * Register Token lifecycle, selection, and rendering hooks.
 */
export function registerTokenHooks() {
  // Movement enforcement and tracking
  registerTokenMovementHooks();

  // Prevent players from controlling Haven tokens
  Hooks.on("controlToken", (token, controlled) => {
    if (controlled) {
      if (token.actor?.type === "haven" && !game.user.isGM) {
        token.release();
        if (_lastValidControlledTokens.length) {
          _lastValidControlledTokens.forEach(t => {
            if (!t._destroyed) t.control({ releaseOthers: false });
          });
        }
      } else {
        setTimeout(() => {
          const current = canvas.tokens?.controlled || [];
          if (current.length > 0 && !current.some(t => t.actor?.type === "haven")) {
            _lastValidControlledTokens = [...current];
          } else if (current.length === 0) {
            _lastValidControlledTokens = [];
          }
        }, 0);
      }
    }
  });

  // Token pre-creation defaults (texture and disposition)
  Hooks.on("preCreateToken", (tokenDoc, updates, options, userId) => {
    const actor = tokenDoc.actor || game.actors.get(updates.actorId || tokenDoc.actorId);
    if (actor) {
      TrespasserEffectsHelper.syncActorTokenEffects(actor);

      const currentSrc = updates.texture?.src || tokenDoc.texture?.src;
      if (!currentSrc || currentSrc === "icons/svg/mystery-man.svg") {
        const targetSrc = actor.prototypeToken?.texture?.src || actor.img;
        if (targetSrc && targetSrc !== "icons/svg/mystery-man.svg") {
          tokenDoc.updateSource({ "texture.src": targetSrc });
        }
      }

      const dispositionProvided = foundry.utils.hasProperty(updates, "disposition");
      if (!dispositionProvided && (tokenDoc.disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL || tokenDoc.disposition === undefined)) {
        if (actor.prototypeToken?.disposition !== undefined && actor.prototypeToken?.disposition !== CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
          tokenDoc.updateSource({ disposition: actor.prototypeToken.disposition });
        } else if (actor.type === "character" || actor.type === "commoner") {
          tokenDoc.updateSource({ disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY });
        } else if (actor.type === "creature") {
          tokenDoc.updateSource({ disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE });
        }
      }
    }
  });

  // Passive states and status badge rendering on tokens
  Hooks.on("refreshToken", (token) => {
    const existing = token.children.filter(c => c._trespasserPassiveState);
    existing.forEach(c => {
      if (c._trespasserTooltip) {
        game.tooltip.dismissLockedTooltip(c._trespasserTooltip);
        c._trespasserTooltip = null;
      }
      token.removeChild(c);
      c.destroy();
    });

    const states = token.document?.actor?.system?.passiveStates || {};
    const isEngaged = TargetingHelper.isEngaged(token);

    if (token._trespasserEngaged === undefined) {
      token._trespasserEngaged = isEngaged;
    } else if (token._trespasserEngaged !== isEngaged) {
      token._trespasserEngaged = isEngaged;
      EngagementHelper.refreshAllEngagement();
    }

    const actor = token.actor ?? token.document?.actor;
    const activeKeys = Object.entries(states).filter(([key, v]) => v && (actor?.type === "character" || key !== "encumbered"));
    if (isEngaged) {
      activeKeys.push(["engaged", true]);
    }
    if (activeKeys.length === 0) return;

    const iconScale = game.settings.get("trespasser", "tokenStatusIconScale") ?? 1.0;
    const padding = 2;
    const count = activeKeys.length;
    const baseSize = Math.max(14, Math.round(token.w * 0.22));
    const maxAvailableH = Math.floor((token.h - padding * (count + 1)) / count);
    const iconSize = Math.max(8, Math.min(Math.round(baseSize * iconScale), maxAvailableH));

    activeKeys.forEach(([key], index) => {
      const cfg = PASSIVE_STATES[key];
      if (!cfg) return;

      const texture = PIXI.Texture.from(cfg.icon);
      const sprite = new PIXI.Sprite(texture);
      sprite.width = iconSize;
      sprite.height = iconSize;
      sprite.x = token.w - iconSize - padding;
      sprite.y = padding + index * (iconSize + padding);
      sprite.alpha = 1.0;
      sprite._trespasserPassiveState = true;

      sprite.eventMode = "static";
      sprite.on("pointerover", () => {
        if (sprite._trespasserTooltip) return;
        const label = game.i18n.localize(cfg.label);
        const desc = game.i18n.localize(cfg.description);
        const bounds = sprite.getBounds();
        const board = document.getElementById("board")?.getBoundingClientRect() ?? { top: 0, left: 0 };
        const tip = game.tooltip.createLockedTooltip({ top: "0px", left: "0px" }, `${label}: ${desc}`);
        tip.style.left = `${Math.round(board.left + bounds.x + (bounds.width - tip.offsetWidth) / 2)}px`;
        tip.style.top = `${Math.round(board.top + bounds.y - tip.offsetHeight - 4)}px`;
        sprite._trespasserTooltip = tip;
      });
      sprite.on("pointerout", () => {
        if (!sprite._trespasserTooltip) return;
        game.tooltip.dismissLockedTooltip(sprite._trespasserTooltip);
        sprite._trespasserTooltip = null;
      });

      token.addChild(sprite);
    });
  });
}
