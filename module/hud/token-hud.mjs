
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

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

        const states = TrespasserEffectsHelper.getActorEffects(this._token.actor).combat.filter(e => e.item?.type === "state");

        const ap = combatant.getFlag("trespasser", "actionPoints") ?? 3;
        const apDots = Array.from({ length: 3 }, (_, i) => ({
            active: i < ap
        }));

        const moveActionTaken = combatant.getFlag("trespasser", "moveActionTaken") ?? false;
        const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
        const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
        const movementHistory = combatant.getFlag("trespasser", "movementHistory") ?? [];
        const speed = this._token.actor?.system.combat?.speed ?? 5;

        const moveOptions = [];
        for (let i = 1; i <= ap; i++) {
            moveOptions.push({
                cost: i,
                dist: speed + (i - 1) * 2
            });
        }

        const context = {
            inCombat: true,
            token: this._token,
            actor: this._token.actor,
            availableAP: ap,
            apDots,
            allies: this._getNearbyAllies(),
            canDefend: ap >= 1,
            canHelp: ap >= 1 && this._getNearbyAllies().length > 0,
            canMove: ap >= 1 && !moveActionTaken,
            canUndo: movementHistory.length > 1,
            moveActionTaken,
            movementUsed,
            movementAllowed,
            speed,
            moveOptions,
            canPrevail: ap >= 1 && states.length > 0,
            states
        };

        // Ensure active panel is cleared if it's no longer accessible (Requirement 2)
        if ( this._activePanel === "defend" && !context.canDefend ) this._activePanel = null;
        if ( this._activePanel === "help" && !context.canHelp ) this._activePanel = null;
        if ( this._activePanel === "move" && !context.canMove ) this._activePanel = null;
        if ( this._activePanel === "prevail" && !context.canPrevail ) this._activePanel = null;

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
     * Get allies within 2 squares.
     */
    _getNearbyAllies() {
        if (!this._token) return [];
        const allies = canvas.tokens.placeables.filter(t => {
            if (t.id === this._token.id) return false;
            if (t.document.disposition !== this._token.document.disposition) return false;
            if (!t.actor) return false;
            
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
        if (!this._token || !game.combats) return null;
        for (const combat of game.combats) {
            const activePhase = combat.getFlag("trespasser", "activePhase");
            const combatant = combat.combatants.find(c => 
                c.tokenId === this._token.id && 
                (activePhase === undefined || activePhase === null || c.initiative === activePhase)
            );
            if (combatant) return combatant;
        }
        return null;
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

        const isWholeRound = cost === 2;
        const effectData = {
            name: `Defend (${game.i18n.localize("TRESPASSER.HUD.Defend")})`,
            type: "effect",
            img: "icons/magic/defensive/shield-barrier-blue.webp",
            system: {
                targetAttribute: type,
                modifier: "+2",
                isCombat: true,
                type: "active",
                duration: isWholeRound? "rounds" : "triggers",
                durationValue: 1,
                durationConditions: [{ mode: isWholeRound ? "rounds" : "triggers", value: 1 }],
                when: "use"
            }
        };

        await this._token.actor.createEmbeddedDocuments("Item", [effectData]);
        await combatant.setFlag("trespasser", "actionPoints", currentAP - cost);
        
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
                duration: "triggers",
                durationValue: 1,
                durationOperator: "OR",
                durationConditions: [
                    { mode: "triggers", value: 1 },
                    { mode: "rounds", value: 1 }
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

        const speed = this._token.actor?.system.combat?.speed ?? 5;
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
}
