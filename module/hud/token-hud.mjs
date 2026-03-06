import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";

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
        const apDots = Array.from({ length: 3 }, (_, i) => ({
            active: i < ap
        }));

        const moveActionTaken = combatant.getFlag("trespasser", "moveActionTaken") ?? false;
        const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
        const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
        const movementHistory = combatant.getFlag("trespasser", "movementHistory") ?? [];
        const baseSpeed = this._token.actor?.system.combat?.speed ?? 5;
        const bonusSpeed = TrespasserEffectsHelper.getAttributeBonus(this._token.actor, "speed");
        const speed = baseSpeed + bonusSpeed;

        const moveOptions = [];
        for (let i = 1; i <= ap; i++) {
            moveOptions.push({
                cost: i,
                dist: speed + (i - 1) * 2
            });
        }

        // ── Determine which actions have already been used this turn ──────────
        const usedActions = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);

        const deeds         = this._getSortedDeeds();
        const concoctions   = this._getAvailableConcoctions();

        const context = {
            inCombat: true,
            token: this._token,
            actor: this._token.actor,
            availableAP: ap,
            apDots,
            allies: this._getNearbyAllies(),
            canDefend:      ap >= 1 && !usedActions.has("defend"),
            canHelp:        ap >= 1 && !usedActions.has("help") && this._getNearbyAllies().length > 0,
            canMove:        ap >= 1 && !usedActions.has("move"),
            canUndo:        movementHistory.length > 1,
            canPrevail:     ap >= 1 && !usedActions.has("prevail") && states.length > 0,
            canAttemptDeed: ap >= 1 && !usedActions.has("attempt-deed") && deeds.length > 0,
            canUseConcoction: ap >= 1 && concoctions.length > 0 && !usedActions.has("use-concoction"),
            moveActionTaken,
            movementUsed,
            movementAllowed,
            speed,
            moveOptions,
            states,
            deeds,
            concoctions,
            usedActions: [...usedActions]
        };

        // Clear active panel if its action is no longer available
        if ( this._activePanel === "defend"       && !context.canDefend       ) this._activePanel = null;
        if ( this._activePanel === "help"         && !context.canHelp         ) this._activePanel = null;
        if ( this._activePanel === "move"         && !context.canMove         ) this._activePanel = null;
        if ( this._activePanel === "prevail"      && !context.canPrevail      ) this._activePanel = null;
        if ( this._activePanel === "attempt-deed" && !context.canAttemptDeed  ) this._activePanel = null;
        if ( this._activePanel === "concoction"   && !context.canUseConcoction) this._activePanel = null;

        return context;
    }

    /** @override */
    _onRender(context, options) {
        this._restorePanelState();
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
            }
        });
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
        if (currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const label = game.i18n.localize(type === "guard" ? "TRESPASSER.Sheet.Combat.Guard" : "TRESPASSER.Sheet.Combat.Resist");
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
                duration: isWholeRound ? "round" : "trigger",
                durationValue: 1,
                durationConditions: [{ mode: isWholeRound ? "round" : "trigger", value: 1 }],
                when: isWholeRound ? "immediate" : "use"
            }
        };

        await this._token.actor.createEmbeddedDocuments("Item", [effectData]);
        await combatant.setFlag("trespasser", "actionPoints", currentAP - cost);
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
        const combatId = combatant?.parent?.id;
        if (!combatant) return;

        const targetToken = canvas.tokens.get(targetId);
        if (!targetToken) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        if (currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const bonus = cost; 

        const effectData = {
            name: `Help from ${this._token.name}`,
            type: "effect",
            img: "icons/magic/life/heart-hand-blue.webp",
            system: {
                targetAttribute: attr,
                modifier: `+${bonus}`,
                isCombat: true,
                isPrevailable: false,
                type: "on-trigger",
                duration: "trigger",
                durationValue: 1,
                durationOperator: "OR",
                durationConditions: [
                    { mode: "trigger", value: 1 },
                    { mode: "round", value: 1 }
                ],
                when: "use"
            }
        };

        // Always request GM confirmation for Help
        const payload = {
            type: "applyHelp",
            targetActorUuid: targetToken.actor.uuid,
            effectData: effectData,
            sourceName: this._token.name,
            sourceCombatantId: combatant.id,
            combatId: combatId,
            cost: cost,
            bonus: bonus,
            attr: attr
        };

        game.socket.emit("system.trespasser.help", payload);
        if (game.user.isGM) {
            await this._handleHelpRequest(payload);
        } else {
            ui.notifications.info(`Applied Help for ${targetToken.name}.`);
        }
        await TrespasserCombat.recordHUDAction(this._token.actor, "help");

        this._activePanel = null;
        this.render();
    }

    /**
     * Automatically apply the help effect (called on GM client).
     */
    async _handleHelpRequest(data) {
        const targetActor = fromUuidSync(data.targetActorUuid);
        if (!targetActor) return;

        const combat = game.combats.get(data.combatId);
        const combatant = combat?.combatants.get(data.sourceCombatantId);
        if (combatant) {
            const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
            await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - data.cost));
        }

        await targetActor.createEmbeddedDocuments("Item", [data.effectData]);
        
        ChatMessage.create({
            speaker: { alias: data.sourceName },
            content: `<strong>${data.sourceName}</strong> gives <strong>Help</strong> (+${data.bonus} ${data.attr}) to <strong>${targetActor.name}</strong> for ${data.cost} AP.`
        });
    }

    async _executeMove() {
        const costInput = this.element.querySelector('[name="move-cost"]');
        const cost = costInput ? parseInt(costInput.value) : 1;
        
        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        if (currentAP < cost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        const baseSpeed = this._token.actor?.system.combat?.speed ?? 5;
        const bonusSpeed = TrespasserEffectsHelper.getAttributeBonus(this._token.actor, "speed");
        const speed = baseSpeed + bonusSpeed;
        const dist = speed + (cost - 1) * 2;

        await combatant.update({
            "flags.trespasser.actionPoints": currentAP - cost,
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
        const extraAP = parseInt(extraApSelect.value) || 0;
        const totalCost = 1 + extraAP;

        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        if (currentAP < totalCost) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        await this._token.actor.rollPrevail(stateId, extraAP);
        await combatant.setFlag("trespasser", "actionPoints", currentAP - totalCost);

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

        const combatant = this._getCombatant();
        if (!combatant) return;

        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        if (currentAP < 1) {
            ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
            return;
        }

        await this._token.actor.onItemConsume(itemId);
        await combatant.setFlag("trespasser", "actionPoints", currentAP - 1);
        await TrespasserCombat.recordHUDAction(this._token.actor, "use-concoction");

        this._activePanel = null;
        this.render();
    }
}
