import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";
import { TrespasserRollDialog }    from "../dialogs/roll-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Token Action HUD for Trespasser TTRPG.
 * Provides quick actions (Defend, Help) during combat.
 */
export class TrespasserTokenHUD extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this._token = null;
        this._activePanel = null;
        this._initHooks();
    }

    static DEFAULT_OPTIONS = {
        id: "trespasser-token-hud",
        tag: "div",
        classes: ["trespasser-token-hud"],
        window: {
            frame: false,
            resizable: false
        },
        position: {
            width: "auto",
            height: "auto",
            top: 60,
            left: 150
        }
    };

    static PARTS = {
        hud: {
            template: "systems/trespasser/templates/hud/token-hud.hbs"
        }
    };

    /** @override */
    _prepareContext(options) {
        if (!this._token) return { inCombat: false };
        
        // Find combatant across ALL combats (matching active phase)
        const combatant = this._getCombatant();

        // Diagnostic for player
        if (!game.user.isGM) {
            console.log("Trespasser | HUD Preparing Context for", this._token.name, "Combatant Found:", !!combatant);
            if (combatant) console.log("Trespasser | HUD Combatant AP:", combatant.getFlag("trespasser", "actionPoints"));
        }

        if (!combatant) return { inCombat: false };

        const states = TrespasserEffectsHelper.getActorEffects(this._token.actor).combat.filter(e => e.item?.type === "effect");

        const ap = combatant.getFlag("trespasser", "actionPoints") ?? 3;
        // Show at least the base 3 AP, but expand if bonus AP is granted.
        const maxApCount = Math.max(3, ap);
        const apDots = Array.from({ length: maxApCount }, (_, i) => ({
            active: i < ap
        }));

        const moveActionTaken = combatant.getFlag("trespasser", "moveActionTaken") ?? false;
        const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
        const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
        const movementHistory = combatant.getFlag("trespasser", "movementHistory") ?? [];
        const baseSpeed = this._token.actor?.system.combat?.speed ?? 5;
        const bonusSpeed = TrespasserEffectsHelper.getAttributeBonus(this._token.actor, "speed");
        const speed = baseSpeed + bonusSpeed;
        const focus = this._token.actor?.system.combat?.focus ?? 0;

        const moveOptions = [];
        for (let i = 1; i <= ap; i++) {
            moveOptions.push({
                cost: i,
                dist: speed + (i - 1) * 2
            });
        }

        // ── Determine which actions have already been used this turn ──────────
        const usedActions = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);
        const restrictHUD = game.settings.get("trespasser", "restrictHUDActions");
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");

        const deeds         = this._getSortedDeeds();
        const concoctions   = this._getAvailableConcoctions();

        const hasLateTurn = game.combat?.combatants.some(c => 
            c.actorId === this._token.actor?.id && 
            Number(c.initiative) === TrespasserCombat.PHASES.LATE &&
            !c.defeated
        );

        const context = {
            inCombat: true,
            isGM: game.user.isGM,
            token: this._token,
            actor: this._token.actor,
            availableAP: ap,
            apDots,
            allies: this._getNearbyAllies(),
            canDefend:      (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("defend")),
            canHelp:        (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("help")) && this._getNearbyAllies().length > 0,
            canMove:        (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("move")),
            canUndo:        movementHistory.length > 1,
            canPrevail:     (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("prevail")) && states.length > 0,
            canAttemptDeed: (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("attempt-deed")) && deeds.length > 0 && (!restrictAPF || !usedActions.has("maneuver") || focus >= 2),
            canUseConcoction: (ap >= 1 || !restrictAPF) && concoctions.length > 0 && (!restrictHUD || !usedActions.has("use-concoction")),
            canTakeAim:     (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("take-aim")),
            canInteract:    (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("interact")),
            canManeuver:    (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("maneuver")) && (!restrictAPF || !usedActions.has("attempt-deed") || focus >= 2),
            canSmash:       (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("smash")),
            canRummage:     (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("rummage")),
            canThrow:       (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("throw")),
            maneuverFocusCost: usedActions.has("attempt-deed") ? 2 : 0,
            deedFocusCost: usedActions.has("maneuver") ? 2 : 0,
            availableFocus: focus,
            moveActionTaken,
            movementUsed,
            movementAllowed,
            speed,
            moveOptions,
            states,
            deeds,
            concoctions,
            usedActions: [...usedActions],
            throwOptions: this._getThrowOptions(ap),
            deedOptions: this._getDeedOptions(ap),
            maneuverOptions: this._getManeuverOptions(ap),
            interactOptions: this._getInteractOptions(ap),
            smashOptions: this._getSmashOptions(ap),
            takeAimOptions: this._getTakeAimOptions(ap),
            vaultRange: this._getVaultRange(),
            canVault: (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("vault")),
            canWait: (ap >= 1 || !restrictAPF) && (game.combat?.getFlag("trespasser", "activePhase") === TrespasserCombat.PHASES.EARLY) && !hasLateTurn
        };

        // Clear active panel if its action is no longer available
        if ( this._activePanel === "defend"       && !context.canDefend       ) this._activePanel = null;
        if ( this._activePanel === "help"         && !context.canHelp         ) this._activePanel = null;
        if ( this._activePanel === "move"         && !context.canMove         ) this._activePanel = null;
        if ( this._activePanel === "prevail"      && !context.canPrevail      ) this._activePanel = null;
        if ( this._activePanel === "attempt-deed" && !context.canAttemptDeed  ) this._activePanel = null;
        if ( this._activePanel === "concoction"   && !context.canUseConcoction) this._activePanel = null;
        if ( this._activePanel === "take-aim"      && !context.canTakeAim     ) this._activePanel = null;
        if ( this._activePanel === "interact"      && !context.canInteract    ) this._activePanel = null;
        if ( this._activePanel === "maneuver"      && !context.canManeuver    ) this._activePanel = null;
        if ( this._activePanel === "smash"         && !context.canSmash       ) this._activePanel = null;
        if ( this._activePanel === "rummage"       && !context.canRummage     ) this._activePanel = null;
        if ( this._activePanel === "throw"         && !context.canThrow       ) this._activePanel = null;
        if ( this._activePanel === "vault"         && !context.canVault       ) this._activePanel = null;

        return context;
    }

    /** @override */
    _onRender(context, options) {
        this._restorePanelState();
        
        // Smart side logic
        const onRight = (this.position.left ?? 0) > window.innerWidth / 2;
        this.element.classList.toggle("hud-on-right", onRight);
    }

    /**
     * Restore which panel was open before re-render.
     */
    _restorePanelState() {
        if (!this._activePanel) return;
        const panel = this.element.querySelector(`#panel-${this._activePanel}`);
        if (panel) panel.classList.remove("hidden");
    }

    /**
     * Get allies within 2 squares that are also part of the active combat.
     */
    _getNearbyAllies() {
        if (!this._token) return [];

        // Build a set of tokenIds currently in combat for quick lookup
        const combatTokenIds = new Set(
            game.combat?.combatants.map(c => c.tokenId) ?? []
        );

        const allies = canvas.tokens.placeables.filter(t => {
            if (t.id === this._token.id) return false;
            if (t.document.disposition !== this._token.document.disposition) return false;
            if (!t.actor) return false;
            if (!combatTokenIds.has(t.id)) return false;   // must be in combat

            // In V13, measureDistance is deprecated. Use measurePath instead.
            const waypoints = [this._token.center, t.center];
            const dist = canvas.grid.measurePath(waypoints).distance;
            const squares = Math.ceil(dist / canvas.dimensions.distance);
            return squares <= 2;
        }).map(t => ({
            id: t.id,
            name: t.name,
            distance: Math.ceil(canvas.grid.measurePath([this._token.center, t.center]).distance / canvas.dimensions.distance)
        }));
        return allies;
    }

    /**
     * Centralized way to find the correct combatant for the token,
     * prioritizing the one in the currently active combat phase.
     */
    _getCombatant() {
        return TrespasserCombat.getPhaseCombatant(this._token.id);
    }

    /**
     * Calculate throw distance options based on available AP and Agility.
     */
    _getThrowOptions(ap) {
        if (!this._token?.actor) return [];
        const baseAgility = this._token.actor.system.attributes?.agility ?? 0;
        const bonusAgility = TrespasserEffectsHelper.getAttributeBonus(this._token.actor, "agility");
        const agility = baseAgility + bonusAgility;
        const options = [];
        for (let i = 1; i <= ap; i++) {
            options.push({
                cost: i,
                range: 5 + agility + (i - 1) * 2
            });
        }
        return options;
    }

    _getDeedOptions(ap) {
        const options = [];
        const max = Math.max(3, ap);
        for (let i = 1; i <= max; i++) {
            const bonus = (i - 1) * 2;
            const label = i === 1 
                ? game.i18n.format("TRESPASSER.HUD.DeedBaseOption", { cost: i })
                : game.i18n.format("TRESPASSER.HUD.DeedOption", { cost: i, bonus });
            options.push({ cost: i, label });
        }
        return options;
    }

    _getManeuverOptions(ap) {
        const options = [];
        const max = Math.max(3, ap);
        for (let i = 1; i <= max; i++) {
            options.push({
                cost: i,
                bonus: (i - 1) * 2
            });
        }
        return options;
    }

    _getInteractOptions(ap) {
        const options = [];
        const max = Math.max(3, ap);
        for (let i = 1; i <= max; i++) {
            options.push({
                cost: i,
                bonus: (i - 1) * 2
            });
        }
        return options;
    }

    _getSmashOptions(ap) {
        const options = [];
        const max = Math.max(3, ap);
        for (let i = 1; i <= max; i++) {
            options.push({
                cost: i,
                bonus: i - 1
            });
        }
        return options;
    }

    _getTakeAimOptions(ap) {
        const options = [];
        const max = Math.min(2, ap);
        for (let i = 1; i <= max; i++) {
            options.push({
                cost: i,
                bonus: i === 1 ? 4 : 8
            });
        }
        return options;
    }

    /**
     * Calculate vault jump range based on armor weight and agility.
     */
    _getVaultRange() {
        if (!this._token?.actor) return 2;
        const actor = this._token.actor;
        const equippedArmor = actor.items.filter(i => i.type === "armor" && i.system.equipped);
        const isLightOrUnarmored = !equippedArmor.some(a => a.system.weight === "H");
        
        if (!isLightOrUnarmored) return 2;

        const baseAgility = actor.system.attributes?.agility ?? 0;
        const bonusAgility = TrespasserEffectsHelper.getAttributeBonus(actor, "agility");
        const agility = baseAgility + bonusAgility;
        
        return Math.max(2, agility);
    }

    _initHooks() {
        // Handle token selection changes
        Hooks.on("controlToken", (token, controlled) => {
            if (controlled) {
                this._token = token;
                this.render({force: true});
            } else {
                const activeToken = canvas.tokens.controlled[0];
                if (activeToken) {
                    this._token = activeToken;
                    this.render({force: true});
                } else {
                    if (this.state !== 0 && this.state !== -1) this.close();
                    this._token = null;
                }
            }
        });

        // Handle combat start/updates
        Hooks.on("updateCombat", () => this._checkAndRenderForActiveToken());
        Hooks.on("createCombat", () => this._checkAndRenderForActiveToken());
        Hooks.on("deleteCombat", () => this.close());
        Hooks.on("canvasReady", () => this._checkAndRenderForActiveToken());

        // Handle AP changes (stored in flags) on combatants
        Hooks.on("updateCombatant", (combatant, changed) => {
            if (!this._token) return;
            if (combatant.tokenId === this._token.id) {
                this.render();
            }
        });

        // Handle actor/item changes to keep HUD in sync
        Hooks.on("updateActor", (actor) => {
            if (this._token && actor.id === this._token.actor?.id) this.render();
        });
        Hooks.on("createItem", (item) => {
            if (this._token && item.parent?.id === this._token.actor?.id) this.render();
        });
        Hooks.on("updateItem", (item) => {
            if (this._token && item.parent?.id === this._token.actor?.id) this.render();
        });
        Hooks.on("deleteItem", (item) => {
            if (this._token && item.parent?.id === this._token.actor?.id) this.render();
        });

        // Check immediately in case we are already in combat/have selection
        if (game.ready) this._checkAndRenderForActiveToken();
        else Hooks.once("ready", () => this._checkAndRenderForActiveToken());
    }

    /**
     * Helper to find current selected token and render if valid.
     */
    _checkAndRenderForActiveToken() {
        const activeToken = canvas.tokens?.controlled[0];
        if (activeToken) {
            this._token = activeToken;
            this.render({force: true});
        }
    }

    /** @override */
    _onFirstRender(context, options) {
        this.element.addEventListener("click", ev => {
            const action = ev.target.closest("[data-action]")?.dataset.action;
            if (!action) return;

            switch (action) {
                case "toggle-panel":
                    this._togglePanel(ev.target.closest("[data-panel]").dataset.panel);
                    break;
                case "execute-defend":
                    this._executeDefend();
                    break;
                case "execute-help":
                    this._executeHelp();
                    break;
                case "execute-move":
                    this._executeMove();
                    break;
                case "execute-undo":
                    this._undoMove();
                    break;
                case "execute-prevail":
                    this._executePrevail();
                    break;
                case "execute-attempt-deed":
                    this._executeAttemptDeed();
                    break;
                case "execute-use-concoction":
                    this._executeUseConcoction();
                    break;
                case "execute-take-aim":
                    this._executeTakeAim();
                    break;
                case "execute-interact":
                    this._executeInteract();
                    break;
                case "execute-maneuver":
                    this._executeManeuver();
                    break;
                case "execute-smash":
                    this._executeSmash();
                    break;
                case "execute-rummage":
                    this._executeRummage();
                    break;
                case "execute-throw":
                    this._executeThrow();
                    break;
                case "execute-vault":
                    this._executeVault();
                    break;
                case "execute-wait":
                    this._executeWait();
                    break;
                case "modify-ap":
                    this._modifyAP(ev);
                    break;
            }
        });

        // Add dragging logic to header using event delegation
        this.element.addEventListener("mousedown", ev => {
            if (ev.target.closest("header")) {
                this._onHeaderMouseDown(ev);
            }
        });
    }

    /**
     * Handle dragging by the header.
     * @param {MouseEvent} ev 
     */
    _onHeaderMouseDown(ev) {
        // Only left click
        if (ev.button !== 0) return;
        ev.preventDefault();

        const initialLeft = this.position.left || this.element.offsetLeft;
        const initialTop = this.position.top || this.element.offsetTop;
        const startX = ev.pageX;
        const startY = ev.pageY;

        const onMove = (moveEv) => {
            const dx = moveEv.pageX - startX;
            const dy = moveEv.pageY - startY;
            const newLeft = initialLeft + dx;
            this.setPosition({
                left: newLeft,
                top: initialTop + dy
            });
            // Smart side logic
            const onRight = newLeft > window.innerWidth / 2;
            this.element.classList.toggle("hud-on-right", onRight);
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    _togglePanel(panelId) {
        const panels = this.element.querySelectorAll(".hud-sub-panel");
        panels.forEach(p => {
            if (p.id === `panel-${panelId}`) {
                const isHidden = p.classList.toggle("hidden");
                this._activePanel = isHidden ? null : panelId;
            } else {
                p.classList.add("hidden");
            }
        });
    }

    async _executeDefend() {
        const type = this.element.querySelector('[name="defend-type"]').value;
        const costInput = this.element.querySelector('[name="defend-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const label = game.i18n.localize(type === "guard" ? "TRESPASSER.Sheet.Combat.Guard" : "TRESPASSER.Sheet.Combat.Resist");
        const isWholeRound = cost === 2;

        const durationOptions = {};
        if (!isWholeRound) {
            durationOptions.durationOperator = 'OR';
            durationOptions.durationConditions = [
                {mode: 'trigger', value: 1},
                {mode: "round", value: 1}
            ];
        } else {
            durationOptions.durationOperator = 'OR';
            durationOptions.durationConditions = [{mode: "round", value: 1}];
        }

        const effectData = {
            name: `${game.i18n.localize("TRESPASSER.HUD.Defend")} (${label})`,
            type: "effect",
            img: "icons/magic/defensive/shield-barrier-blue.webp",
            system: {
                targetAttribute: type,
                modifier: "+2",
                isCombat: true,
                isPrevailable: false,
                type: "on-trigger",
                when: "use",
                ...durationOptions,
            }
        };

        await this._token.actor.createEmbeddedDocuments("Item", [effectData]);
        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
        await TrespasserCombat.recordHUDAction(this._token.actor, "defend");
        
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: `<strong>${this._token.name}</strong> uses <strong>Defend</strong> (${type}) for ${cost} AP.`
        });

        this._activePanel = null;
        this.render();
    }

    async _executeHelp() {
        const targetId = this.element.querySelector('[name="help-target"]').value;
        const attr = this.element.querySelector('[name="help-attr"]').value;
        const costInput = this.element.querySelector('[name="help-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;

        const combatant = this._getCombatant();
        if (!combatant) return;

        const targetToken = canvas.tokens.get(targetId);
        if (!targetToken) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const bonus = cost; 

        // Deduct AP from current actor
        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));

        // Format attribute name for better display
        const attrLabel = game.i18n.localize(`TRESPASSER.Sheet.Combat.${attr.charAt(0).toUpperCase() + attr.slice(1)}`) || attr;

        // Post detailed chat card
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: `
              <div class="trespasser-chat-card">
                <h3 style="margin:0;padding-bottom:4px;border-bottom:1px solid var(--trp-gold-dim);color:var(--trp-gold-bright);">
                  ${game.i18n.localize("TRESPASSER.HUD.Help")}
                </h3>
                <p><strong>${this._token.name}</strong> gives <strong>Help</strong> to <strong>${targetToken.name}</strong>.</p>
                
                <a class="apply-effect-btn apply-help-btn" 
                   data-target-uuid="${targetToken.actor.uuid}"
                   data-target-attribute="${attr}"
                   data-modifier="+${bonus}"
                   data-source-name="${this._token.name}"
                   title="${game.i18n.localize("TRESPASSER.Chat.Apply")}">
                  <img src="systems/trespasser/assets/icons/effects.png" style="width:32px;height:32px;border:none;margin-right:12px;" />
                  <div style="flex:1;">
                    <div style="color:var(--trp-gold-light);font-weight:bold;font-size:var(--fs-16);">+${bonus} ${attrLabel}</div>
                    <div style="font-size:var(--fs-11);color:var(--trp-text-dim);line-height:1.2;">Duration: Next check this round</div>
                  </div>
                  <i class="fas fa-hand-holding-heart"></i>
                </a>

                <p style="font-size:var(--fs-10);margin-top:8px;text-align:right;color:var(--trp-text-dim);border-top:1px solid rgba(255,255,255,0.05);padding-top:4px;">
                  AP Spent: ${cost}
                </p>
              </div>`
        });

        await TrespasserCombat.recordHUDAction(this._token.actor, "help");

        this._activePanel = null;
        this.render();
    }

    async _executeMove() {
        const costInput = this.element.querySelector('[name="move-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const baseSpeed = this._token.actor?.system.combat?.speed ?? 5;
        const bonusSpeed = TrespasserEffectsHelper.getAttributeBonus(this._token.actor, "speed");
        const speed = baseSpeed + bonusSpeed;
        const dist = speed + (cost - 1) * 2;

        await combatant.update({
            "flags.trespasser.actionPoints": Math.max(0, currentAP - cost),
            "flags.trespasser.moveActionTaken": true,
            "flags.trespasser.movementAllowed": dist,
            "flags.trespasser.movementUsed": 0
        });

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: `<strong>${this._token.name}</strong> uses <strong>Move</strong> for ${cost} AP (Speed: ${dist} sq).`
        });

        await TrespasserCombat.recordHUDAction(this._token.actor, "move");

        this._activePanel = null;
        this.render();
    }

    async _undoMove() {
        if (!this._token) return;

        const tokenDoc = this._token.document;
        // Native movement history check
        if ((tokenDoc.movementHistory?.length ?? 0) <= 1) return;

        // Use Foundry's native undo — this handles position AND the yellow path visualization correctly
        // Add to bypass set so our preUpdateToken hook doesn't block this as an illegal move
        globalThis._trespasserUndoSet ??= new Set();
        globalThis._trespasserUndoSet.add(tokenDoc.id);
        try {
            await tokenDoc.revertRecordedMovement();
        } 
        catch (e) {
            console.error("Trespasser | Error undoing movement:", e);
        }
        finally {
            globalThis._trespasserUndoSet.delete(tokenDoc.id);
        }

        const combatant = this._getCombatant();
        const usedActions = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);
        
        if(usedActions.has("move")) {
            await TrespasserCombat.removeHUDAction(this._token.actor, "move");
        }

        // HUD will be re-rendered by the updateToken hook
    }

    async _executePrevail() {
        const stateSelect = this.element.querySelector('[name="prevail-state"]');
        const extraApSelect = this.element.querySelector('[name="prevail-extra-ap"]');
        
        if (!stateSelect || !extraApSelect) return;

        const stateId = stateSelect.value;
        const stateItem = this._token.actor.items.get(stateId);
        if (!stateItem) return;

        const extraAP = parseInt(extraApSelect.value) || 0;
        const totalCost = 1 + extraAP;

        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < totalCost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const intensity = stateItem.system.intensity || 0;
        const defaultCD = Math.min(20, 10 + intensity);
        const prevailStat = this._token.actor.type === "creature" 
            ? (this._token.actor.system.combat?.roll_bonus || 0) 
            : (this._token.actor.system.combat?.prevail || 0);
        const apBonus = extraAP * 2;

        const isAdv = TrespasserEffectsHelper.hasAdvantage(this._token.actor, "prevail");
        
        const diceFormula = isAdv ? "2d20kh" : "1d20";

        const result = await TrespasserRollDialog.wait({
            dice: diceFormula,
            showCD: true,
            cd: defaultCD,
            bonuses: [
                { label: game.i18n.localize("TRESPASSER.Sheet.Combat.Prevail"), value: prevailStat },
                { label: game.i18n.localize("TRESPASSER.HUD.ExtraAP"), value: apBonus }
            ]
        }, { title: game.i18n.format("TRESPASSER.Chat.PrevailCheck", { name: stateItem.name }) });

        if (!result) return;

        await this._token.actor.rollPrevail(stateId, extraAP, {
            modifier: result.modifier,
            cd: result.cd
        });
        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - totalCost));

        this._activePanel = null;
        this.render();
    }

    // ── Attempt Deed ─────────────────────────────────────────────────────────

    /**
     * Build a sorted deed list for the HUD dropdown.
     * Format: [L] - Deed Name (FocusCost)
     */
    _getSortedDeeds() {
        if (!this._token?.actor) return [];
        const tierOrder  = { light: 1, heavy: 2, mighty: 3, special: 4 };
        const tierLabels = { light: "L", heavy: "H", mighty: "M", special: "S" };

        return this._token.actor.items
            .filter(i => i.type === "deed")
            .map(d => {
                const tier = d.system.tier?.toLowerCase() || "light";
                let focusCost = d.system.focusCost;
                if (focusCost === null || focusCost === undefined) {
                    if (tier === "heavy") focusCost = 2;
                    else if (tier === "mighty") focusCost = 4;
                    else focusCost = 0;
                }
                const totalCost = focusCost + (d.system.bonusCost || 0);
                return {
                    id: d.id,
                    name: d.name,
                    tier,
                    tierLabel: tierLabels[tier] || "L",
                    order: tierOrder[tier] || 1,
                    focusCost: totalCost,
                    displayName: `[${tierLabels[tier] || "L"}] - ${d.name} (${totalCost})`
                };
            })
            .sort((a, b) => a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name));
    }

    /**
     * Execute the Attempt Deed action from the HUD.
     * Reads the deed and AP selection from the panel, then calls the shared onDeedRoll handler.
     */
    async _executeAttemptDeed() {
        const deedSelect = this.element.querySelector("[name='attempt-deed-id']");
        const apSelect   = this.element.querySelector("[name='attempt-deed-ap']");
        if (!deedSelect || !apSelect) return;

        const deedId  = deedSelect.value;
        const apSpent = parseInt(apSelect.value) || 1;

        // Build a mock sheet compatible with onDeedRoll
        const mockSheet = {
            actor: this._token.actor,
            // Return pre-selected AP from HUD panel (no popup dialog)
            _askAPDialog: async () => apSpent,
            _getActiveWeapons: () => {
                const equipment = this._token.actor.system.equipment || {};
                const ids = [equipment.main_hand, equipment.off_hand].filter(Boolean);
                return ids.map(id => this._token.actor.items.get(id)).filter(Boolean);
            },
            _selectAmmoDialog: async (ammoItems, weaponRef) => {
                const { showAmmoDialog } = await import("../dialogs/ammo-dialog.mjs");
                return showAmmoDialog(ammoItems, weaponRef);
            },
            _postDeedPhase: async (phaseName, phaseData, actor, item, options) => {
                const { postDeedPhase } = await import("../sheets/character/handlers-deed.mjs");
                return postDeedPhase(phaseName, phaseData, actor, item, options ?? {}, mockSheet);
            },
            _runDepletionCheck: async (item) => {
                const { runDepletionCheck } = await import("../sheets/character/handlers-items.mjs").catch(() => ({ runDepletionCheck: async () => {} }));
                return runDepletionCheck?.(item, mockSheet);
            },
            render: () => this.render()
        };

        const { onDeedRoll } = await import("../sheets/character/handlers-deed.mjs");
        const fakeEvent = {
            preventDefault: () => {},
            currentTarget: { closest: () => ({ dataset: { itemId: deedId } }) }
        };

        await onDeedRoll(fakeEvent, mockSheet);

        this._activePanel = null;
        this.render();
    }

    /**
     * Get list of concoctions from inventory.
     */
    _getAvailableConcoctions() {
        if (!this._token?.actor) return [];
        const validSubTypes = ["potions", "bombs", "oils", "powders"];
        return this._token.actor.items.filter(i => 
            i.type === "item" && validSubTypes.includes(i.system.subType)
        );
    }

    async _executeUseConcoction() {
        const select = this.element.querySelector("[name='concoction-id']");
        if (!select) return;
        const itemId = select.value;
        if (!itemId) return;

        // onItemConsume now handles AP consumption and action tracking for concoctions
        await this._token.actor.onItemConsume(itemId);

        this._activePanel = null;
        this.render();
    }
    
    async _executeTakeAim() {
        const costInput = this.element.querySelector('[name="take-aim-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const rangeBonus = cost === 1 ? 4 : 8;

        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
        await TrespasserCombat.recordHUDAction(this._token.actor, "take-aim");

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.TakeAimMessage", {
                name: this._token.name,
                action: game.i18n.localize("TRESPASSER.HUD.TakeAim"),
                cost: cost,
                bonus: rangeBonus
            })
        });

        this._activePanel = null;
        this.render();
    }

    async _executeInteract() {
        const costInput = this.element.querySelector('[name="interact-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const bonus = (cost - 1) * 2;
        const bonusText = bonus > 0 ? game.i18n.format("TRESPASSER.HUD.WithBonus", { bonus }) : "";

        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
        await TrespasserCombat.recordHUDAction(this._token.actor, "interact");

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.InteractMessage", {
                name: this._token.name,
                action: game.i18n.localize("TRESPASSER.HUD.Interact"),
                cost: cost,
                bonusText: bonusText
            })
        });

        this._activePanel = null;
        this.render();
    }

    async _executeManeuver() {
        const costInput = this.element.querySelector('[name="maneuver-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const usedActions = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);
        let focusCost = 0;
        if (usedActions.has("attempt-deed")) {
            focusCost = 2;
        }

        const actor = this._token.actor;
        const currentFocus = actor.system.combat?.focus ?? 0;

        if (restrictAPF && focusCost > 0 && currentFocus < focusCost) {
            ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.NotEnoughFocus", {
                name: game.i18n.localize("TRESPASSER.HUD.Maneuver"),
                cost: focusCost,
                current: currentFocus
            }));
            return;
        }

        const bonus = (cost - 1) * 2;
        const focusText = focusCost > 0 ? game.i18n.format("TRESPASSER.HUD.SpentFocusMsg", { count: focusCost }) : "";

        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
        if (focusCost > 0) {
            await actor.update({ "system.combat.focus": Math.max(0, currentFocus - focusCost) });
        }
        await TrespasserCombat.recordHUDAction(this._token.actor, "maneuver");

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.ManeuverMessage", {
                name: this._token.name,
                action: game.i18n.localize("TRESPASSER.HUD.Maneuver"),
                cost: cost,
                focusText: focusText,
                bonus: bonus
            })
        });

        this._activePanel = null;
        this.render();
    }

    async _executeSmash() {
        const costInput = this.element.querySelector('[name="smash-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const actor = this._token.actor;
        let baseMight = actor.system.attributes?.mighty ?? 0;
        
        // Bonus might equals the extra AP spent
        const extraAP = cost - 1;
        const totalMight = baseMight + extraAP;

        let materialIdx = totalMight;
        if (materialIdx < 1) materialIdx = 1;
        if (materialIdx > 5) materialIdx = 5;

        const materialStr = game.i18n.localize(`TRESPASSER.HUD.SmashMaterial${materialIdx}`);

        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
        await TrespasserCombat.recordHUDAction(actor, "smash");

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.SmashMessage", {
                name: this._token.name,
                action: game.i18n.localize("TRESPASSER.HUD.Smash"),
                cost: cost,
                material: materialStr
            })
        });

        this._activePanel = null;
        this.render();
    }

    async _executeRummage() {
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < 1) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - 1));
        await TrespasserCombat.recordHUDAction(this._token.actor, "rummage");

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.RummageMessage", {
                name: this._token.name,
                action: game.i18n.localize("TRESPASSER.HUD.Rummage"),
                cost: 1
            })
        });

        this._activePanel = null;
        this.render();
    }

    async _executeThrow() {
        const costInput = this.element.querySelector('[name="throw-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const actor = this._token.actor;
        const baseAgility = actor.system.attributes?.agility ?? 0;
        const bonusAgility = TrespasserEffectsHelper.getAttributeBonus(actor, "agility");
        const agility = baseAgility + bonusAgility;
        const range = 5 + agility + (cost - 1) * 2;

        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - cost));
        await TrespasserCombat.recordHUDAction(actor, "throw");

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.ThrowMessage", {
                name: this._token.name,
                action: game.i18n.localize("TRESPASSER.HUD.Throw"),
                cost: cost,
                range: range
            })
        });

        this._activePanel = null;
        this.render();
    }

    async _executeVault() {
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        
        if (restrictAPF && currentAP < 1) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const range = this._getVaultRange();

        await combatant.update({
            "flags.trespasser.actionPoints": Math.max(0, currentAP - 1),
            "flags.trespasser.moveActionTaken": true,
            "flags.trespasser.movementAllowed": range,
            "flags.trespasser.movementUsed": 0,
            "flags.trespasser.isVaulting": true,
            "flags.trespasser.vaultStartPos": { x: this._token.document.x, y: this._token.document.y }
        });

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.VaultMessage", {
                name: this._token.name,
                action: game.i18n.localize("TRESPASSER.HUD.Vault"),
                range: range
            })
        });

        await TrespasserCombat.recordHUDAction(this._token.actor, "vault");

        this._activePanel = null;
        this.render();
    }

    async _executeWait() {
        const combat = game.combat;
        if (!combat) return;

        const combatant = this._getCombatant();
        if (!combatant) return;

        // Verify it's actually the Early phase
        const activePhase = combat.getFlag("trespasser", "activePhase");
        if (activePhase !== TrespasserCombat.PHASES.EARLY) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const usedActions = combatant.getFlag("trespasser", "usedHUDActions") ?? [];
        const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
        const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;

        // Just move this combatant to the Late Phase
        await combatant.update({
            initiative: TrespasserCombat.PHASES.LATE,
            "flags.trespasser.movementAllowed": movementAllowed - movementUsed,
            "flags.trespasser.movementUsed": 0,
            "flags.trespasser.isWaitFinish": true
        });

        // Send message
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: this._token }),
            content: game.i18n.format("TRESPASSER.Chat.WaitMessage", {
                name: this._token.name,
                ap: currentAP,
                move: movementAllowed - movementUsed
            })
        });

        this._activePanel = null;
        this.render();
    }
    async _modifyAP(ev) {
        if (!game.user.isGM) return;
        const btn = ev.target.closest("[data-delta]");
        const delta = parseInt(btn.dataset.delta) || 0;
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
        const newAP = Math.max(0, currentAP + delta);
        await combatant.setFlag("trespasser", "actionPoints", newAP);
        
        ui.notifications.info(game.i18n.format("TRESPASSER.Notifications.APModified", { 
            name: this._token.name, 
            ap: newAP 
        }));
        this.render();
    }
}
