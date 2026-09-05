/**
 * Dungeon Action Handlers for Trespasser RPG
 * Modular coordinator delegating to movement, interaction, and roll submodules.
 */

import {
  postActionChat,
  consumeAction,
  logAction,
  getDungeonDC
} from "./dungeon-actions-common.mjs";

import {
  handleExplore,
  handleTraverse,
  handleSearch,
  handleHide
} from "./dungeon-actions-movement.mjs";

import {
  handleInteract,
  handleVandalize,
  handlePickLock,
  handleDisarm,
  handleConverse,
  handleMomentsRest,
  handleIncant
} from "./dungeon-actions-interact.mjs";

import {
  promptCharacterSelection,
  resolveActingCharacter,
  rollDungeonActionCheck,
  handleDungeonRollButtonClick
} from "./dungeon-action-rolls.mjs";

export {
  postActionChat,
  consumeAction,
  logAction,
  getDungeonDC,
  handleExplore,
  handleTraverse,
  handleInteract,
  handleSearch,
  handleHide,
  handleVandalize,
  handlePickLock,
  handleDisarm,
  handleConverse,
  handleMomentsRest,
  handleIncant,
  promptCharacterSelection,
  resolveActingCharacter,
  rollDungeonActionCheck,
  handleDungeonRollButtonClick
};

const ACTION_HANDLERS = {
  explore: handleExplore,
  traverse: handleTraverse,
  interact: handleInteract,
  search: handleSearch,
  hide: handleHide,
  vandalize: handleVandalize,
  pickLock: handlePickLock,
  disarm: handleDisarm,
  converse: handleConverse,
  momentsRest: handleMomentsRest,
  incant: handleIncant
};

/**
 * Dispatch a dungeon action by key. Returns true if the action was consumed.
 * @param {Actor} dungeon - The dungeon actor
 * @param {string} actionKey - One of the action keys
 * @param {Object} [options] - Additional options (e.g., selected room)
 * @returns {Promise<boolean>} Whether the action was successfully consumed
 */
export async function executeDungeonAction(dungeon, actionKey, options = {}) {
  const handler = ACTION_HANDLERS[actionKey];
  if (!handler) {
    console.warn(`Trespasser | Unknown dungeon action: ${actionKey}`);
    return false;
  }
  return handler(dungeon, options);
}
