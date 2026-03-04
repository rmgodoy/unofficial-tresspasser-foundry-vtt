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
        
        // Find combatant across ALL combats
        let combatant = null;
        if (game.combats) {
            for (const combat of game.combats) {
                combatant = combat.combatants.find(c => c.tokenId === this._token.id);
                if (combatant) break;
            }
        }

        // Diagnostic for player
        if (!game.user.isGM) {
            console.log("Trespasser | HUD Preparing Context for", this._token.name, "Combatant Found:", !!combatant);
            if (combatant) console.log("Trespasser | HUD Combatant AP:", combatant.getFlag("trespasser", "actionPoints"));
        }

        if (!combatant) return { inCombat: false };

        const ap = combatant.getFlag("trespasser", "actionPoints") ?? 3;
        const apDots = Array.from({ length: 3 }, (_, i) => ({
            active: i < ap
        }));

        return {
            inCombat: true,
            token: this._token,
            actor: this._token.actor,
            availableAP: ap,
            apDots,
            allies: this._getNearbyAllies(),
            canDefend: ap >= 1,
            canHelp: ap >= 1 && this._getNearbyAllies().length > 0
        };
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
        
        let combatant = null;
        for (const combat of game.combats) {
            combatant = combat.combatants.find(c => c.tokenId === this._token.id);
            if (combatant) break;
        }
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
                duration: "triggers",
                durationValue: 1,
                when: "end-of-round"
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

        let combatant = null;
        let combatId = null;
        for (const combat of game.combats) {
            combatant = combat.combatants.find(c => c.tokenId === this._token.id);
            if (combatant) {
                combatId = combat.id;
                break;
            }
        }
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
                when: "end-of-round"
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

        console.log("Trespasser | Emitting help request socket (to GM):", payload);
        game.socket.emit("system.trespasser.help", payload);

        if (game.user.isGM) {
            // Trigger locally for GM
            this._handleHelpRequest(payload);
        } else {
            ui.notifications.info(`Requested Help for ${targetToken.name}. Waiting for GM confirmation.`);
        }

        this._activePanel = null;
        this.render();
    }

    /**
     * Helper to show the confirmation dialog locally for the GM.
     */
    async _handleHelpRequest(data) {
        const targetActor = fromUuidSync(data.targetActorUuid);
        if (!targetActor) return;

        const confirm = await Dialog.confirm({
            title: `Help Action: ${data.sourceName}`,
            content: `<p><strong>${data.sourceName}</strong> wants to help <strong>${targetActor.name}</strong> with a +${data.bonus} bonus to ${data.attr}.</p><p>Spend ${data.cost} AP from ${data.sourceName}?</p>`,
            yes: () => true,
            no: () => false,
            defaultYes: true
        });

        if (confirm) {
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
    }
}
