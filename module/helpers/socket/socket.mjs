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
