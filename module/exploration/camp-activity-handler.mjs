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
    // GM: switch tracker to camp-pending mode
    const tracker = TravelTracker.getInstance();
    
    if (!tracker._campPending) {
      tracker._campPending = true;
      tracker._campSelections = new Map(memberIds.map(id => [id, null]));
    } else {
      // If we are already pending, we are reprompting specific members
      for (const id of memberIds) {
        tracker._campSelections.set(id, null);
      }
    }
    
    tracker.render();
    return;
  }

  // Player: find which of my characters are in the party
  for (const memberId of memberIds) {
    const actor = game.actors.get(memberId);
    if (!actor) continue;
    // Check if this player owns this character
    if (!actor.isOwner) continue;

    // Open camp activity dialog
    openCampActivityDialog(actor, regionId, regionName);
  }
}

/**
 * Prompts player with DialogV2 to choose a camp activity.
 */
async function openCampActivityDialog(actor, regionId, regionName) {
  const campActivities = CONFIG.TRESPASSER.travel.campActivities;
  const choices = Object.entries(campActivities).map(([key, config]) => ({
    key,
    label: game.i18n.localize(config.label),
    icon: config.icon,
    description: game.i18n.localize(config.description)
  }));

  // Build dialog content with activity grid
  let content = `<div class="trespasser-dialog camp-activity-dialog">`;
  content += `<p>${game.i18n.format("TRESPASSER.Dialog.Camp.Prompt", { name: actor.name, region: regionName })}</p>`;
  content += `<div class="camp-activity-grid scrollable">`;
  for (const choice of choices) {
    content += `<label class="camp-activity-option">
      <input type="radio" name="campActivity" value="${choice.key}" />
      <div class="camp-activity-card">
        <i class="${choice.icon}"></i>
        <span class="camp-activity-name">${choice.label}</span>
        <span class="camp-activity-desc">${choice.description}</span>
      </div>
    </label>`;
  }
  content += `</div></div>`;

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
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Dialog.Camp.Confirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const selected = button.form.querySelector('input[name="campActivity"]:checked');
          return selected?.value ?? null;
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
    // Send response back via socket
    TrespasserSocket.emit("CAMP_ACTIVITY_RESPONSE", {
      regionId,
      actorId: actor.id,
      actorName: actor.name,
      activityKey: result,
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
  const { actorId, activityKey } = data;

  const tracker = TravelTracker.getInstance();
  if (!tracker._campPending) return;

  tracker._campSelections.set(actorId, activityKey);
  tracker.render();
}

/**
 * Socket handler for CAMP_ACTIVITY_CANCEL.
 * Runs on all clients.
 */
export function handleCampActivityCancel(data) {
  if (!game.user.isGM) {
    // Close any open camp dialogs
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
 * Socket handler for CAMP_ACTIVITY_CONFIRM.
 * Runs on all clients.
 */
export function handleCampActivityConfirm(data) {
  if (!game.user.isGM) {
    // Close any remaining dialogs
    for (const [actorId, dialog] of _activeDialogs.entries()) {
      dialog.close();
    }
    _activeDialogs.clear();
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

