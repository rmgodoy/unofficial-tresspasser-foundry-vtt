/**
 * Camp Activity Handler
 *
 * Manages the multi-step camp activity selection flow:
 *   1. GM initiates → CAMP_ACTIVITY_REQUEST sent to all clients
 *   2. Players pick activities → CAMP_ACTIVITY_RESPONSE sent back
 *   3. GM sees responses, can override → CAMP_ACTIVITY_CONFIRM finishes
 *   4. Cancel → CAMP_ACTIVITY_CANCEL aborts without consuming action
 */

import { TravelTracker } from "./travel-tracker.mjs";
import { TrespasserSocket } from "../helpers/socket/socket.mjs";
import { performCampRoll } from "./camp-activity-roll.mjs";

export { performCampRoll };

/** @type {Map<string, string>} actorId → chosen activity key */
let _pendingSelections = new Map();

/** @type {string[]} actor IDs that need to respond */
let _expectedActorIds = [];

/** @type {string|null} region actor ID for the current camp session */
let _campRegionId = null;

/** @type {Map<string, object>} actorId → dialog instance */
const _activeDialogs = new Map();

/**
 * Start the camp activity selection flow. Called by the Travel Tracker on GM side.
 * @param {Actor} region - The region actor
 * @param {Actor[]} partyMembers - The characters in the party
 */
export function startCampSelection(region, partyMembers) {
  _campRegionId = region.id;
  _pendingSelections = new Map();
  _expectedActorIds = partyMembers.map(m => m.id);

  // Initialize all as pending (no selection)
  for (const member of partyMembers) {
    _pendingSelections.set(member.id, null);
  }

  // Emit socket request to all clients
  TrespasserSocket.emit("CAMP_ACTIVITY_REQUEST", {
    regionId: region.id,
    regionName: region.name,
    memberIds: _expectedActorIds
  });
}

/**
 * Socket handler for CAMP_ACTIVITY_REQUEST.
 * Runs on all clients.
 */
export async function handleCampActivityRequest(data, senderId) {
  const { regionId, regionName, memberIds } = data;

  if (game.user.isGM) {
    const tracker = TravelTracker.getInstance();
    
    if (!tracker._campPending) {
      tracker._campPending = true;
      tracker._campSelections = new Map(memberIds.map(id => [id, null]));
    } else {
      for (const id of memberIds) {
        tracker._campSelections.set(id, null);
      }
    }
    
    tracker.render();
    return;
  }

  for (const memberId of memberIds) {
    const actor = game.actors.get(memberId);
    if (!actor) continue;
    if (!actor.isOwner) continue;

    openCampActivityDialog(actor, regionId, regionName, memberIds);
  }
}

/**
 * Prompts player with DialogV2 to choose a camp activity.
 */
async function openCampActivityDialog(actor, regionId, regionName, memberIds) {
  const campActivities = CONFIG.TRESPASSER.travel.campActivities;
  const choices = Object.entries(campActivities).map(([key, config]) => {
    let description = game.i18n.localize(config.description);
    let checkPill = "";
    if (config.check) {
      const attrLabel = game.i18n.localize(`TRESPASSER.Terms.Attribute.${config.check.attribute.charAt(0).toUpperCase() + config.check.attribute.slice(1)}`);
      const skillLabelKey = config.check.skill.charAt(0).toUpperCase() + config.check.skill.slice(1);
      const skillLabel = game.i18n.localize(`TRESPASSER.Terms.Skill.${skillLabelKey}`) || skillLabelKey;
      checkPill = `<span class="camp-check-pill">${attrLabel} | ${skillLabel}</span>`;
    }
    return {
      key,
      label: game.i18n.localize(config.label),
      icon: config.icon,
      description,
      checkPill,
      requiresTarget: !!config.requiresTarget
    };
  });

  const targets = memberIds
    .filter(id => id !== actor.id)
    .map(id => game.actors.get(id))
    .filter(a => a)
    .map(a => ({ id: a.id, name: a.name }));

  let targetOptions = targets.map(t => `<option value="${t.id}">${t.name}</option>`).join("");

  let content = `<div class="trespasser-dialog camp-activity-dialog">`;
  content += `<p>${game.i18n.format("TRESPASSER.Dialog.Camp.Prompt", { name: actor.name, region: regionName })}</p>`;
  content += `<div class="camp-activity-grid scrollable">`;
  for (const choice of choices) {
    content += `<label class="camp-activity-option">
      <input type="radio" name="campActivity" value="${choice.key}" data-requires-target="${choice.requiresTarget}" />
      <div class="camp-activity-card">
        <i class="${choice.icon}"></i>
        <div class="camp-activity-header">
          <span class="camp-activity-name">${choice.label}</span>
          ${choice.checkPill}
        </div>
        <span class="camp-activity-desc">${choice.description}</span>
      </div>
    </label>`;
  }
  content += `</div>`;
  
  if (targets.length > 0) {
    content += `
    <div class="camp-target-selection" style="display: none; margin-top: 10px;">
      <label><strong>${game.i18n.localize("TRESPASSER.Terms.Travel.Camp.TargetAlly") || "Target Ally:"}</strong>
        <select name="campTarget">
          ${targetOptions}
        </select>
      </label>
    </div>`;
  }
  content += `</div>`;

  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format("TRESPASSER.Dialog.Camp.Title", { name: actor.name }),
      resizable: true
    },
    position: {
      width: 620,
      height: 500
    },
    classes: ["trespasser", "dialog", "camp-dialog"],
    content,
    render: (event, dialog) => {
      _activeDialogs.set(actor.id, dialog);
      
      const el = dialog.element;
      const options = el.querySelectorAll('.camp-activity-option');
      const targetDiv = el.querySelector('.camp-target-selection');
      
      options.forEach(option => {
        option.addEventListener('click', (ev) => {
          setTimeout(() => {
            const radio = option.querySelector('input[name="campActivity"]');
            if (radio && targetDiv) {
              if (radio.dataset.requiresTarget === "true" && radio.checked) {
                targetDiv.style.display = "block";
              } else {
                targetDiv.style.display = "none";
              }
            }
          }, 10);
        });
      });
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Dialog.Camp.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button, dialog) => {
          const el = event.currentTarget.closest('.application, .window-app, .dialog, dialog') || document;
          const selectedRadio = el.querySelector('input[name="campActivity"]:checked');
          if (!selectedRadio) return null;
          
          const activityKey = selectedRadio.value;
          const targetId = selectedRadio.dataset.requiresTarget === "true" 
            ? el.querySelector('select[name="campTarget"]')?.value 
            : null;
            
          return { activityKey, targetId };
        }
      }
    ],
    close: () => {
      _activeDialogs.delete(actor.id);
      return null;
    },
    rejectClose: false
  });

  if (result) {
    TrespasserSocket.emit("CAMP_ACTIVITY_RESPONSE", {
      regionId,
      actorId: actor.id,
      actorName: actor.name,
      activityKey: result.activityKey,
      targetId: result.targetId,
      userId: game.user.id
    });
  }
}

/**
 * Socket handler for CAMP_ACTIVITY_RESPONSE.
 * Runs on GM client.
 */
export function handleCampActivityResponse(data) {
  if (!game.user.isGM) return;
  const { actorId, activityKey, targetId } = data;

  const tracker = TravelTracker.getInstance();
  if (!tracker._campPending) return;

  tracker._campSelections.set(actorId, { activityKey, targetId });
  tracker.render();
}

/**
 * Socket handler for CAMP_ACTIVITY_CANCEL.
 * Runs on all clients.
 */
export function handleCampActivityCancel(data) {
  if (!game.user.isGM) {
    for (const [actorId, dialog] of _activeDialogs.entries()) {
      dialog.close();
    }
    _activeDialogs.clear();
    return;
  }
  const tracker = TravelTracker.getInstance();
  tracker._campPending = false;
  tracker._campSelections = null;
  tracker.render();
}

/**
 * Check if the current user is the primary active owner of the actor.
 */
function isPrimaryOwner(actor) {
  const activeOwners = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  if (activeOwners.length > 0) {
    return game.user === activeOwners[0];
  }
  const activeGMs = game.users.filter(u => u.active && u.isGM);
  return game.user === activeGMs[0];
}

/**
 * Socket handler for CAMP_ACTIVITY_CONFIRM.
 * Runs on all clients.
 */
export async function handleCampActivityConfirm(data) {
  const { regionId, selections } = data;
  
  if (!game.user.isGM) {
    for (const [actorId, dialog] of _activeDialogs.entries()) {
      dialog.close();
    }
    _activeDialogs.clear();
  }

  const myActors = [];
  for (const [actorId, selection] of Object.entries(selections)) {
    const actor = game.actors.get(actorId);
    if (actor && isPrimaryOwner(actor)) {
      myActors.push({ actor, selection });
    }
  }

  if (myActors.length === 0) return;

  const region = game.actors.get(regionId);
  const hostilityDC = region ? (CONFIG.TRESPASSER.dungeon.hostilityTiers[region.system?.hostilityTier]?.dc ?? 10) : 10;

  for (const { actor, selection } of myActors) {
    const { activityKey, targetId } = selection;
    const activityConfig = CONFIG.TRESPASSER.travel.campActivities[activityKey];
    if (!activityConfig) continue;

    let assists = 0;
    for (const [otherActorId, otherSelection] of Object.entries(selections)) {
      if (otherSelection.activityKey === "assist" && otherSelection.targetId === actor.id) {
        assists++;
      }
    }

    const label = game.i18n.localize(activityConfig.label);
    const icon = activityConfig.icon;
    let targetName = "";
    if (targetId) {
      const targetActor = game.actors.get(targetId);
      if (targetActor) targetName = targetActor.name;
    }
    
    let assistText = assists > 0 ? ` <div style="margin-top: 5px; color: var(--trp-spark); font-weight: bold; font-size: var(--fs-13);">[+${assists} Assist${assists > 1 ? 's' : ''}]</div>` : "";

    const descriptiveText = targetName 
      ? `<strong>${actor.name}</strong> chose to <strong>${label}</strong> targeting <strong>${targetName}</strong>.`
      : `<strong>${actor.name}</strong> chose to <strong>${label}</strong>.`;

    const content = `
      <div class="trespasser-travel-action">
        <div style="margin-bottom: 5px; font-size: var(--fs-15);">
          <i class="${icon}"></i> ${descriptiveText}
        </div>
        <div style="font-size: var(--fs-13); font-style: italic; color: var(--trp-text-dim);">
          ${game.i18n.localize(activityConfig.description)}
        </div>
        ${assistText}
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });

    if (activityConfig.check) {
      const automate = game.settings.get("trespasser", "automateTravelTracker");
      if (automate) {
        await performCampRoll(actor, activityConfig, activityKey, hostilityDC, assists);
      }
    }
  }
}

/**
 * Re-prompts a specific party member to select their camp activity.
 * @param {string} actorId - The character actor ID
 */
export function repromptMember(actorId) {
  if (!game.user.isGM || !_campRegionId) return;

  const region = game.actors.get(_campRegionId);
  if (!region) return;

  TrespasserSocket.emit("CAMP_ACTIVITY_REQUEST", {
    regionId: region.id,
    regionName: region.name,
    memberIds: [actorId]
  });
}
