import { registerChatCommands } from "../helpers/chat-commands.mjs";
import { TrespasserTokenHUD } from "../hud/token-hud.mjs";
import { TrespasserSocket } from "../helpers/socket/socket.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Register the primary ready hook and post-load initializations.
 */
export function registerReadyHooks() {
  Hooks.once("ready", async () => {
    registerChatCommands();

    // Initialize Token Action HUD
    game.trespasser.tokenHUD = new TrespasserTokenHUD();

    // Initialize Sockets
    TrespasserSocket.init();

    // Migrate legacy settings with inverted logic to positive settings
    if (game.user.isGM) {
      try {
        const worldStorage = game.settings.storage.get("world");
        if (worldStorage?.getItem("trespasser.disregardRangeOnAttack") !== undefined &&
            worldStorage?.getItem("trespasser.enforceAttackRange") === undefined) {
          const oldVal = game.settings.get("trespasser", "disregardRangeOnAttack");
          await game.settings.set("trespasser", "enforceAttackRange", !oldVal);
        }
        if (worldStorage?.getItem("trespasser.bypassHavenBuildingLimits") !== undefined &&
            worldStorage?.getItem("trespasser.enforceHavenBuildingLimits") === undefined) {
          const oldVal = game.settings.get("trespasser", "bypassHavenBuildingLimits");
          await game.settings.set("trespasser", "enforceHavenBuildingLimits", !oldVal);
        }
        if (worldStorage?.getItem("trespasser.hideCreatureDamageRolls") !== undefined &&
            worldStorage?.getItem("trespasser.showCreatureDamageRolls") === undefined) {
          const oldVal = game.settings.get("trespasser", "hideCreatureDamageRolls");
          await game.settings.set("trespasser", "showCreatureDamageRolls", !oldVal);
        }
        if (worldStorage?.getItem("trespasser.groupCheckFullParty") !== undefined &&
            worldStorage?.getItem("trespasser.enableGroupCheckSelection") === undefined) {
          const oldVal = game.settings.get("trespasser", "groupCheckFullParty");
          await game.settings.set("trespasser", "enableGroupCheckSelection", !oldVal);
        }
        if (worldStorage?.getItem("trespasser.restrictHavenEditToLeader") !== undefined &&
            worldStorage?.getItem("trespasser.allowAllPlayersHavenEdit") === undefined) {
          const oldVal = game.settings.get("trespasser", "restrictHavenEditToLeader");
          await game.settings.set("trespasser", "allowAllPlayersHavenEdit", !oldVal);
        }
      } catch (err) {
        console.warn("Trespasser | Settings migration check encountered an issue:", err);
      }
    }

    // Function to apply settings to CSS variables
    game.trespasser.applySystemSettings = () => {
      const clockSize = game.settings.get("trespasser", "clockSize") || 50;
      document.documentElement.style.setProperty('--trp-clock-size', `${clockSize}px`);

      const fontSize = game.settings.get("trespasser", "fontSizeBase") || 16;
      document.documentElement.style.setProperty('--trp-font-size-base', `${fontSize}px`);

      // Apply colors
      const colors = [
        { key: "colorBgDark", var: "--trp-bg-dark" },
        { key: "colorBgPanel", var: "--trp-bg-panel" },
        { key: "colorBgInput", var: "--trp-bg-input" },
        { key: "colorBgHeader", var: "--trp-bg-header" },
        { key: "colorBgSelect", var: "--trp-bg-select" },
        { key: "colorBorder", var: "--trp-border" },
        { key: "colorBorderLight", var: "--trp-border-light" },
        { key: "colorGold", var: "--trp-gold" },
        { key: "colorGoldDim", var: "--trp-gold-dim" },
        { key: "colorGoldBright", var: "--trp-gold-bright" },
        { key: "colorRed", var: "--trp-red" },
        { key: "colorRedDim", var: "--trp-red-dim" },
        { key: "colorText", var: "--trp-text" },
        { key: "colorTextDim", var: "--trp-text-dim" },
        { key: "colorTextBright", var: "--trp-text-bright" },
        { key: "colorGreen", var: "--trp-green" },
        { key: "colorGreenBright", var: "--trp-green-bright" },
        { key: "colorPurple", var: "--trp-purple" },
        { key: "colorBlue", var: "--trp-blue" },
        { key: "colorLightGreen", var: "--trp-light-green" },
        { key: "colorCyan", var: "--trp-cyan" },
        { key: "colorSpark", var: "--trp-spark" },
        { key: "colorShadow", var: "--trp-shadow" },
        { key: "colorShadowGold", var: "--trp-shadow-gold" },
        { key: "colorShadowDark", var: "--trp-shadow-dark" },
        { key: "colorBgOverlay", var: "--trp-bg-overlay" },
        { key: "colorGoldOverlay", var: "--trp-gold-overlay" },
        { key: "colorRedOverlay", var: "--trp-red-overlay" },
        { key: "colorGreenOverlay", var: "--trp-green-overlay" },
        { key: "colorScrollbar", var: "--trp-scrollbar" }
      ];

      for (const c of colors) {
        const val = game.settings.get("trespasser", c.key);
        document.documentElement.style.setProperty(c.var, val);
        
        if (c.key === "colorShadowGold") {
          document.documentElement.style.setProperty('--trp-shadow-gold', `${val}66`);
        } else if (c.key === "colorShadowDark") {
          document.documentElement.style.setProperty('--trp-shadow-dark', `${val}80`);
        } else if (c.key.endsWith("Overlay")) {
          const alpha = c.key === "colorBgOverlay" ? "40" : "1a";
          document.documentElement.style.setProperty(c.var, `${val}${alpha}`);
        }
      }

      if (canvas.ready && canvas.tokens) {
        canvas.tokens.placeables.forEach(t => {
          if (t.renderFlags) t.renderFlags.set({ refreshEffects: true, refresh: true });
          else if (t.refresh) t.refresh();
        });
      }
    };

    // Initial application
    game.trespasser.applySystemSettings();

    // Clean up any stray turn markers on canvas tokens
    if (canvas.ready && canvas.tokens) {
      for (const token of canvas.tokens.placeables) {
        if (token.turnMarker) {
          canvas.tokens.turnMarkers?.delete(token);
          try {
            token.turnMarker.destroy();
          } catch (_) {}
          token.turnMarker = null;
        }
      }
    }

    Hooks.on("canvasReady", () => {
      if (canvas.tokens) {
        for (const token of canvas.tokens.placeables) {
          if (token.turnMarker) {
            canvas.tokens.turnMarkers?.delete(token);
            try {
              token.turnMarker.destroy();
            } catch (_) {}
            token.turnMarker = null;
          }
          if (token.actor && game.user.isGM) {
            TrespasserEffectsHelper.syncActorTokenEffects(token.actor);
          }
        }
      }
    });

    // Apply token status icon scale to active effect status icons on tokens
    const TokenClass = CONFIG.Token?.objectClass || globalThis.Token;
    if (TokenClass?.prototype?._refreshEffects) {
      const origRefreshEffects = TokenClass.prototype._refreshEffects;
      TokenClass.prototype._refreshEffects = function() {
        origRefreshEffects.call(this);

        if (!this.effects) return;

        this.effects.scale.set(1, 1);

        const bg = this.effects.bg;
        const overlay = this.effects.overlay;

        const sprites = [];
        for (const child of this.effects.children) {
          if (child === bg || child === overlay) continue;
          if (child.visible !== false) {
            sprites.push(child);
          }
        }

        if (sprites.length === 0) return;

        const N = sprites.length;
        const W = this.w;
        const H = this.h;
        const iconScale = game.settings.get("trespasser", "tokenStatusIconScale") ?? 1.0;

        const baseIconSize = Math.max(14, W * 0.24);
        const targetSize = baseIconSize * iconScale;

        let bestCols = 1;
        let bestSize = 0;

        for (let c = 1; c <= N; c++) {
          const r = Math.ceil(N / c);
          const maxFitSize = Math.min(W / c, H / r);
          const candidateSize = Math.min(targetSize, maxFitSize);
          if (candidateSize > bestSize) {
            bestSize = candidateSize;
            bestCols = c;
          }
        }

        const iconSize = Math.max(8, Math.floor(bestSize));
        const radius = Math.max(2, Math.round(iconSize * 0.12));

        if (bg) {
          bg.clear();
        }

        sprites.forEach((sprite, index) => {
          const col = index % bestCols;
          const row = Math.floor(index / bestCols);
          const x = col * iconSize;
          const y = row * iconSize;

          sprite.width = iconSize;
          sprite.height = iconSize;
          sprite.position.set(x, y);

          if (bg) {
            if (typeof bg.beginFill === "function") {
              bg.beginFill(0x000000, 0.5);
              bg.lineStyle?.(1, 0x000000, 0.75);
              bg.drawRoundedRect(x, y, iconSize, iconSize, radius);
              bg.endFill();
            } else if (typeof bg.roundRect === "function") {
              bg.roundRect(x, y, iconSize, iconSize, radius)
                .fill({ color: 0x000000, alpha: 0.5 })
                .stroke({ color: 0x000000, alpha: 0.75, width: 1 });
            }
          }
        });
      };
    }

    if (game.combat && game.combat.flags?.trespasser?.activePhase) {
      game.combat.updateTurnMarkers(game.combat.flags.trespasser.activePhase);
    }

    // Data Migration: Creature roll_bonus → prevail
    if (game.user.isGM) {
      for (const actor of game.actors) {
        if (actor.type !== "creature") continue;
        const src = actor.toObject();
        const oldVal = src.system?.roll_bonus;
        const newVal = src.system?.prevail;
        if (oldVal !== undefined && oldVal !== 0 && (newVal === undefined || newVal === 0)) {
          await actor.update({ "system.prevail": oldVal });
          console.log(`Trespasser | Migrated creature "${actor.name}" roll_bonus(${oldVal}) → prevail`);
        }
      }

      // Data Migration: Deed Data Model → Behavior-Driven
      const { migrateWorldDeeds } = await import("../helpers/migration-deed.mjs");
      await migrateWorldDeeds();
    }
  });
}
