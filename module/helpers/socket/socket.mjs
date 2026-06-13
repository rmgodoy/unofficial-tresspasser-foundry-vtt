import { 
  handleTransferRequest, 
  handleTransferAccepted, 
  handleTransferRejected,
  handleHavenWithdrawalRequest
} from "./item-transfer.mjs";
import { 
  handleDefenseRequest, 
  handleDefenseResponse 
} from "./defense-roll-handler.mjs";
import {
  handleShadowsRequest,
  handleShadowsResponse,
  handleSparksRequest,
  handleSparksResponse,
  handleCancelPopup
} from "../non-combat-helper.mjs";
import { handleRemoveTemptFateButton } from "../../sheets/character/handlers-tempt-fate.mjs";
import {
  handleCampActivityRequest,
  handleCampActivityResponse,
  handleCampActivityCancel,
  handleCampActivityConfirm
} from "../../exploration/camp-activity-handler.mjs";
import { handleUpdateChatMessage } from "./chat-handler.mjs";
import { handleGroupCheckSubmitRoll } from "./group-check-handler.mjs";

/**
 * Helper class for handling custom socket events in the Trespasser system.
 * This class coordinates various specialized handlers organized by context.
 */
export class TrespasserSocket {
  static IDENTIFIER = "system.trespasser";

  /**
   * Initialize socket listeners.
   */
  static init() {
    game.socket.on(this.IDENTIFIER, this._onMessage.bind(this));
  }

  /**
   * Handle incoming socket messages and route them to specific handlers.
   * @param {object} payload
   * @param {string} payload.type - The type of event
   * @param {object} payload.data - Data associated with the event
   * @param {string} payload.senderId - ID of the user who sent the message
   * @private
   */
  static async _onMessage(payload) {
    const { type, data, senderId } = payload;
    
    switch (type) {
      case "TRANSFER_REQUEST":
        return handleTransferRequest(data, senderId);
      case "TRANSFER_ACCEPTED":
        return handleTransferAccepted(data);
      case "TRANSFER_REJECTED":
        return handleTransferRejected(data);
      case "HAVEN_WITHDRAWAL":
        return handleHavenWithdrawalRequest(data, senderId);
      case "DEFENSE_REQUEST":
        return handleDefenseRequest(data, senderId);
      case "DEFENSE_RESPONSE":
        return handleDefenseResponse(data);
      case "NON_COMBAT_SHADOWS_REQUEST":
        return handleShadowsRequest(data, senderId);
      case "NON_COMBAT_SHADOWS_RESPONSE":
        return handleShadowsResponse(data);
      case "NON_COMBAT_SPARKS_REQUEST":
        return handleSparksRequest(data, senderId);
      case "NON_COMBAT_SPARKS_RESPONSE":
        return handleSparksResponse(data);
      case "CANCEL_NON_COMBAT_POPUP":
        return handleCancelPopup(data);
      case "REMOVE_TEMPT_FATE_BUTTON":
        return handleRemoveTemptFateButton(data);
      case "CAMP_ACTIVITY_REQUEST":
        return handleCampActivityRequest(data, senderId);
      case "CAMP_ACTIVITY_RESPONSE":
        return handleCampActivityResponse(data);
      case "CAMP_ACTIVITY_CANCEL":
        return handleCampActivityCancel(data);
      case "CAMP_ACTIVITY_CONFIRM":
        return handleCampActivityConfirm(data);
      case "UPDATE_CHAT_MESSAGE":
        return handleUpdateChatMessage(data, senderId);
      case "GROUP_CHECK_SUBMIT_ROLL":
        return handleGroupCheckSubmitRoll(data, senderId);
      default:
        // Ignore unknown types
        break;
    }
  }

  /**
   * Emit a custom socket event.
   * @param {string} type
   * @param {object} data
   */
  static emit(type, data) {
    const payload = {
      type,
      data,
      senderId: game.user.id
    };
    
    // Send to other clients
    game.socket.emit(this.IDENTIFIER, payload);
    
    // Also process locally for the sender (critical for GMs testing alone or responsible for the update)
    this._onMessage(payload);
  }
}
