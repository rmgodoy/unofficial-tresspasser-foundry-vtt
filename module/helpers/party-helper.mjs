/**
 * Helper class for Party-related logic.
 */
export class TrespasserPartyHelper {
  
  /**
   * Get the active Party actor for the world.
   * If an active party is set in settings and exists, returns it.
   * Otherwise, falls back to the first party it finds.
   * @returns {Actor|null}
   */
  static getActiveParty() {
    const activeId = game.settings.get("trespasser", "activePartyId");
    
    if (activeId) {
      const party = game.actors.get(activeId);
      if (party && party.type === "party") {
        return party;
      }
    }

    // Fallback: No active party
    return null;
  }

  /**
   * Sets the given party actor as the active one.
   * @param {string} actorId 
   */
  static async setActiveParty(actorId) {
    if (!game.user.isGM) return;

    if (!actorId) {
      await game.settings.set("trespasser", "activePartyId", "");
      return;
    }

    const actor = game.actors.get(actorId);
    if (!actor || actor.type !== "party") return;
    
    await game.settings.set("trespasser", "activePartyId", actorId);
  }

  /**
   * Build the initial/pending HTML for a Group Check chat message.
   */
  static buildGroupCheckPendingHtml(checkLabel, dc, participants, results) {
    let content = `<div class="trespasser-group-check">`;
    content += `<h3>${game.i18n.localize("TRESPASSER.Chat.Party.GroupCheck")}: ${checkLabel}</h3>`;
    content += `<p class="group-check-dc-line">${game.i18n.localize("TRESPASSER.Terms.Combat.DC")} ${dc}</p>`;
    
    content += `<div class="group-check-participants" style="margin-bottom: 8px;">`;
    for (const actorId of participants) {
      const actor = game.actors.get(actorId);
      const hasRolled = results.some(r => r.actorId === actorId);
      const statusIcon = hasRolled ? `<i class="fas fa-check" style="color:var(--trp-green);"></i>` : `<i class="fas fa-clock" style="color:var(--trp-gold);"></i>`;
      content += `<div style="display:flex; justify-content:space-between; padding: 2px 0; border-bottom: 1px solid var(--trp-border-light);">
        <span>${actor?.name ?? "Unknown"}</span>
        <span>${statusIcon}</span>
      </div>`;
    }
    content += `</div>`;

    if (results.length < participants.length) {
      content += `
        <button type="button" class="group-check-roll-btn" style="width:100%; cursor:pointer; font-family:var(--trp-font-header); font-size:var(--fs-11); text-transform:uppercase; font-weight:bold; padding:6px; background:var(--trp-bg-panel); border:1px solid var(--trp-border); color:var(--trp-gold); margin-bottom: 4px;">
          <i class="fas fa-dice"></i> ${game.i18n.localize("TRESPASSER.Chat.Party.RollBtn")}
        </button>`;
      
      if (game.user.isGM) {
        content += `
          <button type="button" class="group-check-force-roll-btn" style="width:100%; cursor:pointer; font-family:var(--trp-font-header); font-size:var(--fs-10); text-transform:uppercase; padding:4px; background:var(--trp-bg-dark); border:1px solid var(--trp-red); color:var(--trp-red);">
            <i class="fas fa-fast-forward"></i> ${game.i18n.localize("TRESPASSER.Chat.Party.ForceCompleteBtn")}
          </button>`;
      }
    } else {
      content += `<p style="text-align: center; font-style: italic; color: var(--trp-text-dim);">${game.i18n.localize("TRESPASSER.Chat.Party.ProcessingResults")}</p>`;
    }

    content += `</div>`;
    return content;
  }

  /**
   * Build the final HTML for a Group Check chat message.
   */
  static buildGroupCheckFinalHtml(checkLabel, dc, results, successes, failures, outcome, sparks, shadows) {
    const expectedSparks = outcome >= 2 ? 1 : 0;
    const expectedShadows = outcome <= -2 ? 1 : 0;

    let content = `<div class="trespasser-group-check">`;
    content += `<h3>${game.i18n.localize("TRESPASSER.Chat.Party.GroupCheck")}: ${checkLabel}</h3>`;
    content += `<p class="group-check-dc-line">${game.i18n.localize("TRESPASSER.Terms.Combat.DC")} ${dc}</p>`;
    content += `<div class="group-check-results">`;
    for (const r of results) {
      const cls = r.success ? "success" : "failure";
      let resultIndicator = r.success ? "✓" : "✗";
      let isNat20Text = "";
      if (r.isNat20) {
        resultIndicator = "✓✓";
        isNat20Text = ` <span style="font-size: var(--fs-9); color: var(--trp-gold-bright); font-weight: bold; text-transform: uppercase;">(Nat 20)</span>`;
      }
      content += `<div class="group-check-row ${cls}">`;
      content += `<span class="group-check-name">${r.name}${isNat20Text}</span>`;
      content += `<span class="group-check-roll">${r.formula}</span>`;
      content += `<span class="group-check-total">${r.total}</span>`;
      content += `<span class="group-check-result">${resultIndicator}</span>`;
      content += `</div>`;
    }
    content += `</div>`;

    content += `<div class="group-check-summary" style="display: flex; flex-direction: column; gap: 4px;">`;
    content += `<div><strong>${game.i18n.format("TRESPASSER.Chat.Party.Successes", { count: successes })}</strong> | <strong>${game.i18n.format("TRESPASSER.Chat.Party.Failures", { count: failures })}</strong></div>`;
    content += `<div><strong>${game.i18n.format("TRESPASSER.Chat.Party.NetOutcome", { outcome: outcome >= 0 ? "+" + outcome : outcome })}</strong></div>`;

    if (expectedSparks > 0 && sparks.length === 0) {
      content += `<div style="color:var(--trp-spark); font-weight:bold; margin-top:4px;"><i class="fas fa-sun"></i> ${game.i18n.localize("TRESPASSER.Chat.Party.PendingGroupSpark")}</div>`;
      content += `
        <button type="button" class="distribute-group-sparks-btn" data-spark-count="${expectedSparks}" style="width:100%;cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;font-weight:bold;padding:6px;background:var(--trp-bg-panel);border:1px solid var(--trp-spark);color:var(--trp-spark);margin-top:4px;">
          <i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Party.DistributeGroupSparks", { count: expectedSparks })}
        </button>`;
    }
    if (expectedShadows > 0 && shadows.length === 0) {
      content += `<div style="color:var(--trp-shadow); font-weight:bold; margin-top:4px;"><i class="fas fa-moon"></i> ${game.i18n.localize("TRESPASSER.Chat.Party.PendingGroupShadow")}</div>`;
      content += `
        <button type="button" class="distribute-group-shadows-btn" data-shadow-count="${expectedShadows}" style="width:100%;cursor:pointer;font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;font-weight:bold;padding:6px;background:var(--trp-bg-panel);border:1px solid var(--trp-shadow);color:var(--trp-shadow);margin-top:4px;">
          <i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Party.DistributeGroupShadows", { count: expectedShadows })}
        </button>`;
    }

    if (sparks.length > 0) {
      content += `<div class="group-check-sparks" style="margin-top: 4px; text-align: left;">`;
      content += `<strong>${game.i18n.localize("TRESPASSER.Chat.Party.GroupSparksLabel")}</strong><ul style="margin: 2px 0 0; padding-left: 15px;">`;
      for (const spark of sparks) {
        content += `<li><span style="color:var(--trp-spark); font-weight:bold;"><i class="fas fa-sun"></i> ${game.i18n.localize("TRESPASSER.Dialog.NonCombat.Spark" + spark.capitalize() + "Label").toUpperCase()}</span></li>`;
      }
      content += `</ul></div>`;
    }

    if (shadows.length > 0) {
      content += `<div class="group-check-shadows" style="margin-top: 4px; text-align: left;">`;
      content += `<strong>${game.i18n.localize("TRESPASSER.Chat.Party.GroupShadowsLabel")}</strong><ul style="margin: 2px 0 0; padding-left: 15px;">`;
      for (const shadow of shadows) {
        content += `<li><span style="color:var(--trp-shadow); font-weight:bold;"><i class="fas fa-moon"></i> ${game.i18n.localize("TRESPASSER.Dialog.NonCombat.Shadow" + shadow.capitalize() + "Label").toUpperCase()}</span></li>`;
      }
      content += `</ul></div>`;
    }

    content += `</div></div>`;
    return content;
  }

  /**
   * Finalize a group check (called on GM client).
   */
  static async finalizeGroupCheck(messageId) {
    const msg = game.messages.get(messageId);
    if (!msg) return;

    const flags = msg.flags.trespasser?.groupCheck;
    if (!flags) return;

    const { checkLabel, dc, results } = flags;

    let successes = 0;
    let failures = 0;
    for (const r of results) {
      if (r.success) successes += r.isNat20 ? 2 : 1;
      else failures += 1;
    }

    const outcome = successes - failures;

    // Build immediate initial complete state
    let content = this.buildGroupCheckFinalHtml(checkLabel, dc, results, successes, failures, outcome, [], []);
    
    // Convert serialized rolls back to roll instances for the chat message
    const rollObjects = [];
    for (const r of results) {
       try {
         const roll = foundry.dice.Roll.fromJSON(JSON.stringify(r.rollData));
         rollObjects.push(roll);
       } catch (e) {
         console.warn("Could not deserialize roll", e);
       }
    }

    const baseFlags = {
      ...flags,
      status: "completed",
      successes,
      failures,
      outcome
    };

    const newMsg = await ChatMessage.create({ 
      speaker: msg.speaker,
      content, 
      rolls: rollObjects,
      flags: {
        trespasser: {
          groupCheck: baseFlags
        }
      }
    });

    await msg.delete();
  }
}
