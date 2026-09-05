/**
 * Render custom phased initiative UI in the Combat Tracker.
 * @param {Application} app
 * @param {HTMLElement|jQuery} html
 * @param {object} data
 */
export async function renderPhasedCombatTracker(app, html, data) {
  const combat = game.combat;
  if (!combat) return;

  const isWaiting = combat.getFlag("trespasser", "waitingForInitiatives") ?? false;
  const activePhase = combat.getFlag("trespasser", "activePhase");
  const combatInfo = combat.getFlag("trespasser", "combatInfo") || {};

  const PHASES = [
    { id: 40, label: game.i18n.localize("TRESPASSER.Terms.Combat.Phase.Early"), css: "early", combatants: [] },
    { id: 30, label: game.i18n.localize("TRESPASSER.Terms.Combat.Phase.Enemy"), css: "enemy", combatants: [] },
    { id: 20, label: game.i18n.localize("TRESPASSER.Terms.Combat.Phase.Late"), css: "late", combatants: [] },
    { id: 10, label: game.i18n.localize("TRESPASSER.Terms.Combat.Phase.Extra"), css: "extra", combatants: [] },
    { id: 0,  label: game.i18n.localize("TRESPASSER.Terms.Combat.Phase.End"), css: "end", combatants: [] }
  ];

  for (const combatant of combat.combatants) {
    if (!combatant.visible && !game.user.isGM) continue;
    const phaseId = combatant.initiative ?? 0;
    const phase = PHASES.find(p => p.id === phaseId);
    if (phase) {
      const ap = combatant.getFlag("trespasser", "actionPoints") ?? 3;
      const focus = combatant.actor?.system.combat?.focus ?? 0;
      const isFollowCompanion = combatant.actor?.type === "companion" &&
        (combatant.actor.system.initiativeMode ?? "follow") === "follow" &&
        combatant.actor.system.boundCharacterId;
      const isPending = isFollowCompanion ? false : (combatant.getFlag("trespasser", "initiativePending") ?? false);
      phase.combatants.push({ combatant, ap, focus, isPending });
    }
  }

  const activePhasesData = PHASES.filter(p => p.combatants.length > 0);

  function buildIcons(filled, cssClass) {
    const totalSlots = Math.max(3, filled);
    return Array.from({ length: totalSlots }, (_, i) => {
      const isFilled = i < filled;
      return `<div class="${cssClass}-icon${isFilled ? " active" : ""}"></div>`;
    }).join("");
  }

  function buildPhaseHTML(phaseData) {
    const isActive = phaseData.id === activePhase;
    const nextBtn = (isActive && game.user.isGM && !isWaiting)
      ? `<button class="next-phase-btn trp-next-phase" title="${game.i18n.localize("TRESPASSER.Terms.Combat.Phase.Next")}">${game.i18n.localize("TRESPASSER.Terms.Combat.Phase.NextPhase")}</button>`
      : "";

    const combatantsHTML = phaseData.combatants.map(({ combatant, ap, focus, isPending }) => {
      const isDefeated = combatant.defeated;
      const isHidden = combatant.token?.hidden ?? combatant.hidden;
      const isTargeted = game.user.targets.has(combatant.token?.object);

      const isFinished = ap <= 0 || isDefeated;
      const isActv = phaseData.id === activePhase && !isFinished;
      const name = combatant.token?.name ?? combatant.name;
      const img = combatant.token?.texture?.src ?? combatant.img;
      const cls = [isActv ? "active" : "", isFinished ? "finished" : ""].filter(Boolean).join(" ");

      let statsHTML = "";
      if (isPending) {
        statsHTML = `<button class="roll-initiative-btn trp-roll-init" style="background:var(--trp-gold-dim); color:var(--trp-bg-dark); border:none; border-radius:3px; padding:4px 8px; cursor:pointer; font-family:var(--trp-font-primary); font-size:var(--fs-18); font-weight:bold; width:100%;"><i style="height:16px;" class="fas fa-dice-d20"></i> </button>`;
      } else {
        statsHTML = (focus > 0 ? `<div class="focus-display flexrow"><span class="focus-number">${focus}</span></div>` : "")
                  + `<div class="ap-display flexrow"><div class="ap-indicator flexrow">${buildIcons(ap, "ap")}</div></div>`;
      }

      const actor = combatant.actor;
      const effectsList = [];
      if (actor) {
        for (const item of actor.items) {
          if (item.type !== "effect") continue;
          if (item.system.gmOnly && !game.user.isGM) continue;
          const icon = (item.system.syncStatusIcon !== false)
            ? (item.img || item.system.statusIcon)
            : (item.system.statusIcon || item.img);
          if (icon) {
            effectsList.push({
              id: item.id,
              name: item.name,
              icon: icon,
              intensity: item.system.intensity || 0
            });
          }
        }
        for (const eff of (actor.effects || [])) {
          if (eff.disabled || eff.isSuppressed) continue;
          const sourceItemId = eff.flags?.trespasser?.sourceItem;
          if (sourceItemId && effectsList.some(e => e.id === sourceItemId)) continue;
          const icon = eff.img || eff.icon;
          if (icon && !effectsList.some(e => e.icon === icon)) {
            effectsList.push({
              id: eff.id,
              name: eff.name || eff.label,
              icon: icon,
              intensity: 0
            });
          }
        }
      }

      const effectsHTML = effectsList.length > 0 ? `
        <div class="combatant-effects">
          ${effectsList.map(eff => `
            <div class="combatant-effect-badge" data-effect-id="${eff.id}" title="${eff.name}">
              <img class="combatant-effect-icon" src="${eff.icon}" alt="${eff.name}"/>
              ${eff.intensity > 0 ? `<span class="combatant-effect-intensity">${eff.intensity}</span>` : ""}
            </div>
          `).join("")}
        </div>
      ` : "";

      return `
        <li class="combatant ${cls}" data-combatant-id="${combatant.id}">
          <div class="combatant-main-row flexrow">
            <div class="avatar-container">
              <img class="token-image" src="${img}" title="${name}"/>
            </div>
            <div class="combatant-info flexcol">
              <div class="token-name"><h4>${name}</h4></div>
              <div class="combatant-status flexrow">
                <a class="combatant-control ${isHidden ? "active" : ""}" data-action="toggleHidden" title="${game.i18n.localize("TRESPASSER.Global.Action.ToggleVisibility")}">
                  <i class="fas ${isHidden ? "fa-eye-slash" : "fa-eye"}"></i>
                </a>
                <a class="combatant-control ${isDefeated ? "active" : ""}" data-action="toggleDefeated" title="${game.i18n.localize("TRESPASSER.Global.Action.ToggleDead")}">
                  <i class="fas fa-skull"></i>
                </a>
                <a class="combatant-control ${isTargeted ? "active" : ""}" data-action="toggleTarget" title="${game.i18n.localize("TRESPASSER.Global.Action.ToggleTarget")}">
                  <i class="fas fa-bullseye"></i>
                </a>
              </div>
            </div>
            <div class="stats-area flexcol">${statsHTML}</div>
          </div>
          ${effectsHTML}
        </li>
      `.trim();
    }).join("");

    return `
      <li class="phase-group ${phaseData.css}${isActive ? " active" : ""}">
        <div class="phase-header flexrow">
          <div class="header-left flexrow">
            <h4>${phaseData.label}</h4>
          </div>
          ${nextBtn}
        </div>
        <ol class="combatants-list">
          ${combatantsHTML}
        </ol>
      </li>
    `.trim();
  }

  const waitingBanner = isWaiting ? `
    <div class="initiative-waiting-banner" style="background:var(--trp-bg-header); border:1px solid var(--trp-gold-dim); border-radius:4px; padding:8px 12px; margin:8px; text-align:center; color:var(--trp-gold-bright); font-family:var(--trp-font-header); font-size:var(--fs-13);">
      <i class="fas fa-hourglass-half"></i> ${game.i18n.localize("TRESPASSER.Sheet.Combat.WaitingForInitiatives")}
    </div>
  ` : "";

  const footerHTML = `
    <footer class="combat-info-footer">
      <div class="info-row">
        <div class="left-info">
          <span class="peril-text">
            ${game.i18n.localize("TRESPASSER.Terms.Combat.Peril")}: ${combatInfo.perilTotal ?? 0}
            <span class="peril-label">(${game.i18n.localize(combatInfo.perilLabel ?? "TRESPASSER.Terms.Combat.PanicLabels.Low")})</span>
          </span>
          <span class="deeds-usage">${combatInfo.deedDisplay ?? `${combatInfo.heavy ?? 0}H/${combatInfo.mighty ?? 0}M`}</span>
        </div>
        <div class="right-info">
          <span class="panic-label">Panic: ${combatInfo.panicLevel ?? 0}</span>
          <span class="init-dc-label">Init DC: ${combatInfo.enemyMaxInit ?? "-"}</span>
        </div>
      </div>
    </footer>
  `.trim();

  const root = (html instanceof HTMLElement) ? html : (html[0] ?? html);
  const log = root.querySelector("#combat-log") ?? root.querySelector("ol.directory-list") ?? root.querySelector("ol");

  if (log) {
    log.innerHTML = waitingBanner + activePhasesData.map(buildPhaseHTML).join("");
  }

  if (game.user.isGM) {
    root.querySelector(".combat-info-footer")?.remove();
    const section = root.closest("section") ?? root.querySelector("section") ?? root;
    const footerEl = document.createElement("div");
    footerEl.innerHTML = footerHTML;
    section.appendChild(footerEl.firstElementChild);
  }

  // Event Listeners
  root.querySelectorAll(".trp-next-phase").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      game.combat?.nextPhase();
    });
  });

  root.querySelectorAll(".trp-roll-init").forEach(btn => {
    btn.addEventListener("click", async ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".combatant");
      const combatantId = li?.dataset.combatantId;
      const combatant = game.combat?.combatants.get(combatantId);
      if (!combatant) return;
      if (!combatant.testUserPermission(game.user, "OWNER") && !game.user.isGM) return;
      await game.combat.rollPlayerInitiative(combatantId);
    });
  });

  root.querySelectorAll(".ap-icon.active").forEach(sq => {
    sq.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".combatant");
      const combatant = game.combat?.combatants.get(li?.dataset.combatantId);
      if (!combatant || !combatant.testUserPermission(game.user, "OWNER")) return;
      const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 3;
      await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - 1));
    });
  });

  root.querySelectorAll(".combatant-control[data-action]").forEach(el => {
    el.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = el.closest(".combatant");
      const combatant = game.combat?.combatants.get(li?.dataset.combatantId);
      if (!combatant) return;
      const action = el.dataset.action;
      if (action === "toggleHidden") {
        if (!game.user.isGM && !combatant.testUserPermission(game.user, "OWNER")) return;
        const t = combatant.token;
        if (t) await t.update({ hidden: !t.hidden });
        else await combatant.update({ hidden: !combatant.hidden });
      } else if (action === "toggleDefeated") {
        if (!game.user.isGM && !combatant.testUserPermission(game.user, "OWNER")) return;
        await combatant.update({ defeated: !combatant.defeated });
      } else if (action === "toggleTarget") {
        const token = combatant.token?.object;
        if (token) token.setTarget(!token.isTargeted, { releaseOthers: false });
      }
    });
  });

  root.querySelectorAll(".combatant-effect-badge").forEach(el => {
    el.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const effectId = el.dataset.effectId;
      const combatantId = el.closest(".combatant")?.dataset.combatantId;
      const combatant = game.combat?.combatants.get(combatantId);
      const item = combatant?.actor?.items.get(effectId);
      if (item) {
        const { showItemInfoDialog } = await import("../dialogs/item-info-dialog.mjs");
        showItemInfoDialog(item.uuid);
      }
    });
  });
}
