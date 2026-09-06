/**
 * Trespasser Injuries Table and Rolling Helper
 * Defines the 32 injuries indexed by d8 (location) and d4 (severity),
 * builds the prompt button, and evaluates injury rolls.
 */

export const INJURIES_TABLE = {
  1: {
    location: "TRESPASSER.Injuries.Location.Arms",
    locationDefault: "Arms",
    entries: {
      1: { name: "Sprained Wrist", clock: 4, permanent: false, description: "You suffer a -2 penalty to guard checks." },
      2: { name: "Weak Grip", clock: 4, permanent: false, description: "Remove the lowest result from any damage rolls you make on melee, missile, or innate attacks." },
      3: { name: "Broken Arm", clock: 6, permanent: false, description: "You lose the use of one hand. Your inventory size is reduced by 2 slots." },
      4: { name: "Missing Hand", clock: 0, permanent: true, description: "You lose the use of one hand. Permanent." }
    }
  },
  2: {
    location: "TRESPASSER.Injuries.Location.Legs",
    locationDefault: "Legs",
    entries: {
      1: { name: "Limping Step", clock: 4, permanent: false, description: "Your speed is set to 4/+2." },
      2: { name: "Sprained Ankle", clock: 6, permanent: false, description: "Your speed is reduced to 4/+1." },
      3: { name: "Broken Leg", clock: 8, permanent: false, description: "Your speed is reduced to 4/+1." },
      4: { name: "Missing Foot", clock: 0, permanent: true, description: "Your speed is reduced to 4/+1. Permanent." }
    }
  },
  3: {
    location: "TRESPASSER.Injuries.Location.Guts",
    locationDefault: "Guts",
    entries: {
      1: { name: "Nausea", clock: 4, permanent: false, description: "Each time you rest, roll 1d6. On a 1 or 2, you cannot eat and lose 1 endurance automatically." },
      2: { name: "Fatigue", clock: 6, permanent: false, description: "You lose 1 endurance whenever you perform a camp activity other than early rest." },
      3: { name: "Wincing Pain", clock: 4, permanent: false, description: "You suffer 1d6 damage whenever you attempt a heavy deed, or 2d6 whenever you attempt a mighty deed." },
      4: { name: "Weakness", clock: 6, permanent: false, description: "Your armor dice are counted as d4s instead of their normal size." }
    }
  },
  4: {
    location: "TRESPASSER.Injuries.Location.Heart",
    locationDefault: "Heart",
    entries: {
      1: { name: "Nicked Artery", clock: 4, permanent: false, description: "You suffer 1d6 damage for each extra action point you spend on the move action." },
      2: { name: "Internal Bleeding", clock: 6, permanent: false, description: "Add the harmful shadow to any MIGHT or AGILITY checks you make outside of combat." },
      3: { name: "Major Blood Loss", clock: 6, permanent: false, description: "You lose 1 recovery die for each extra action point you spend on the move action." },
      4: { name: "Weak Heart", clock: 6, permanent: false, description: "You lose 2 recovery dice whenever you attempt a mighty deed." }
    }
  },
  5: {
    location: "TRESPASSER.Injuries.Location.Lungs",
    locationDefault: "Lungs",
    entries: {
      1: { name: "Hacking Cough", clock: 4, permanent: false, description: "The Judge adds the loud shadow to any MIGHT or AGILITY checks you make outside of combat." },
      2: { name: "Crushed Chest", clock: 6, permanent: false, description: "Your recovery dice are reduced by one size, to a minimum of d4." },
      3: { name: "Muscle Spasms", clock: 6, permanent: false, description: "Your skill die is reduced by one size, to a minimum of d4." },
      4: { name: "Punctured Lung", clock: 6, permanent: false, description: "You only gain two action points each turn during combat." }
    }
  },
  6: {
    location: "TRESPASSER.Injuries.Location.Body",
    locationDefault: "Body",
    entries: {
      1: { name: "Crippling Pain", clock: 4, permanent: false, description: "At the start of each of your turns in combat, roll a d6. On a 1 or 2, you are overcome by pain and lose 1 action point." },
      2: { name: "Bruised Spine", clock: 4, permanent: false, description: "Your inventory size is reduced by half. You cannot move while your pack is overfull." },
      3: { name: "Broken Ribs", clock: 6, permanent: false, description: "You suffer a -2 penalty to guard checks." },
      4: { name: "Slow Reflexes", clock: 4, permanent: false, description: "You can't take more than one reaction each round." }
    }
  },
  7: {
    location: "TRESPASSER.Injuries.Location.Head",
    locationDefault: "Head",
    entries: {
      1: { name: "Bruised Eyes", clock: 4, permanent: false, description: "You cannot draw lines of sight further than 6 squares away." },
      2: { name: "Slashed Throat", clock: 4, permanent: false, description: "You can only speak at a whisper. You can raise your voice, but doing so deals you 1d6 damage." },
      3: { name: "Mental Fog", clock: 6, permanent: false, description: "You suffer a -2 penalty to resist checks." },
      4: { name: "Missing Eye", clock: 0, permanent: true, description: "Weapon ranges are reduced by half for all missile and spell weapons you wield, as are the benefits of take aim. Permanent." }
    }
  },
  8: {
    location: "TRESPASSER.Injuries.Location.Brain",
    locationDefault: "Brain",
    entries: {
      1: { name: "Dazed", clock: 4, permanent: false, description: "The Judge adds a shadow to all INTELLECT checks you make outside of combat." },
      2: { name: "Amnesia", clock: 6, permanent: false, description: "You lose access to two random skills until you recover from this injury." },
      3: { name: "Migraine", clock: 6, permanent: false, description: "You start combat encounters with zero focus." },
      4: { name: "Changed Personality", clock: 0, permanent: true, description: "Reroll both your alignment traits as oddities. This change is permanent but does not take up an injury slot." }
    }
  }
};

/**
 * Builds HTML button prompting the player to roll on the injury table.
 * @param {Actor} actor
 * @returns {string}
 */
export function buildInjuryButtonHtml(actor) {
  if (!actor) return "";
  const label = game.i18n.localize("TRESPASSER.Chat.Combat.RollInjuryTable") || "Roll Injury Table (1d8, 1d4)";
  return `
    <div class="injury-action-row" style="margin-top: 8px;">
      <button type="button" class="roll-injury-btn" data-actor-id="${actor.id}" style="height: auto; min-height: 34px; padding: 6px 10px; line-height: 1.3; color: #ff5252; background: var(--trp-bg-dark, #1a1714); border: 1px solid #ff5252; font-size: var(--fs-11); font-family: var(--trp-font-header, 'Cinzel', serif); font-weight: bold; text-align: center;">
        <i class="fas fa-skull-crossbones" style="color: #ff5252;"></i> ${label}
      </button>
    </div>`;
}

/**
 * Prompts the owner or GM to roll on the Injuries Table (1d8, 1d4).
 * Evaluates the roll and displays the resulting injury card in chat without auto-adding.
 * @param {string} actorId
 */
export async function promptInjuryRoll(actorId) {
  const actor = game.actors.get(actorId) || canvas.tokens.get(actorId)?.actor;
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.ActorNotFound") || "Actor not found.");
    return;
  }

  if (!actor.isOwner && !game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.NotOwner") || "You do not have permission to roll for this character.");
    return;
  }

  const rollD8 = new foundry.dice.Roll("1d8");
  const rollD4 = new foundry.dice.Roll("1d4");
  await rollD8.evaluate();
  await rollD4.evaluate();

  const d8Val = rollD8.total;
  const d4Val = rollD4.total;

  const locCategory = INJURIES_TABLE[d8Val];
  const injury = locCategory?.entries?.[d4Val];

  if (!injury) return;

  const locName = game.i18n.localize(locCategory.location) || locCategory.locationDefault;
  const clockText = injury.permanent
    ? (game.i18n.localize("TRESPASSER.Injuries.Permanent") || "Permanent")
    : `${game.i18n.localize("TRESPASSER.Injuries.Clock") || "Injury Clock"}: ${injury.clock}`;

  const headerTitle = game.i18n.format("TRESPASSER.Chat.Combat.InjuryRollResultTitle", { name: actor.name }) || `${actor.name} - Grievous Injury`;

  const flavor = `
    <div class="trespasser-chat-card injury-result-card">
      <h3 style="color: #ff5252;"><i class="fas fa-skull-crossbones"></i> ${headerTitle}</h3>
      <p style="font-size: var(--fs-12); margin-bottom: 4px;">
        <strong>${game.i18n.localize("TRESPASSER.Chat.Combat.RollFormula") || "Roll"}:</strong> 1d8 [${d8Val}] (${locName}), 1d4 [${d4Val}]
      </p>
      <div style="border-top: 1px solid var(--trp-border, #4a3f2f); padding-top: 6px; margin-top: 6px;">
        <h4 style="color: var(--trp-gold-bright, #e8c96b); margin: 0 0 4px 0; font-size: var(--fs-13); font-weight: bold;">
          ${injury.name} <span style="font-size: var(--fs-11); color: #ffb74d;">(${clockText})</span>
        </h4>
        <p style="font-size: var(--fs-12); color: var(--trp-text-dim); line-height: 1.4; margin: 0;">
          ${injury.description}
        </p>
      </div>
    </div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: flavor
  });
}

/**
 * Registers click listeners on chat message HTML elements for Injury rolls.
 * @param {HTMLElement} htmlElement
 */
export function registerInjuryChatListeners(htmlElement) {
  const buttons = htmlElement.querySelectorAll(".roll-injury-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const actorId = btn.dataset.actorId;
      await promptInjuryRoll(actorId);
    });
  });
}
