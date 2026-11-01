/**
 * creature-to-companion-helper.mjs
 * Helper for duplicating and converting a Creature actor to a Companion actor.
 *
 * Requirements:
 * - GM only action.
 * - Single click in sheet context menu.
 * - Creates a duplicate Companion actor (does not replace or delete the original creature).
 * - Basic attributes of the companion = creature attributes - 10 (prevail & speed keep the same number).
 * - Preserves name, image, items (features, deeds, effects, etc.), token prototype, ownership, folder.
 */

/**
 * Duplicates a Creature actor into a new Companion actor.
 *
 * @param {Actor} creatureActor - The source creature actor document.
 * @returns {Promise<Actor|null>} The newly created companion actor document.
 */
export async function convertCreatureToCompanion(creatureActor) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Companion.GMOnly"));
    return null;
  }

  if (!creatureActor || creatureActor.type !== "creature") {
    console.warn("Trespasser | convertCreatureToCompanion called on non-creature actor", creatureActor);
    return null;
  }

  const cSys = creatureActor.system;

  // Extract base stats from creature
  const baseAccuracy = cSys.accuracy ?? cSys.combat?.accuracy ?? 10;
  const baseGuard = cSys.guard ?? cSys.combat?.guard ?? 10;
  const baseResist = cSys.resist ?? cSys.combat?.resist ?? 10;
  const basePrevail = cSys.prevail ?? cSys.combat?.prevail ?? 0;
  const baseSpeed = cSys.speed ?? cSys.combat?.speed ?? 5;
  const baseInitiative = cSys.initiative ?? cSys.combat?.initiative ?? 10;
  const damageDie = cSys.damage_die || cSys.weapon_die || cSys.weaponDie || cSys.combat?.damage_die || "d6";
  const maxHealth = cSys.max_health ?? cSys.combat?.max_health ?? cSys.health ?? 10;
  const currentHealth = cSys.health ?? maxHealth;
  const level = cSys.level ?? 1;

  // Companion attributes: creature attributes - 10; prevail and speed keep the same number
  const compAccuracy = baseAccuracy - 10;
  const compGuard = baseGuard - 10;
  const compResist = baseResist - 10;
  const compInitiative = baseInitiative - 10;
  const compPrevail = basePrevail;
  const compSpeed = baseSpeed;

  const companionSystem = {
    boundCharacterId: "",
    initiativeMode: "follow",
    formulas: {
      level: String(level),
      skill_die: damageDie,
      damageDie: damageDie,
      hp: String(maxHealth),
      speed: String(compSpeed),
      speed_bonus: "2",
      initiative: String(compInitiative),
      accuracy: String(compAccuracy),
      guard: String(compGuard),
      resist: String(compResist),
      prevail: String(compPrevail)
    },
    health: currentHealth,
    max_health: maxHealth,
    notes: cSys.notes || ""
  };

  // Prepare duplicate companion payload
  const itemsToCopy = creatureActor.items.map(i => i.toObject());
  const protoToken = creatureActor.prototypeToken ? creatureActor.prototypeToken.toObject() : {};
  protoToken.actorLink = true;

  const companionPayload = {
    name: creatureActor.name,
    type: "companion",
    img: creatureActor.img,
    folder: creatureActor.folder?.id ?? null,
    ownership: creatureActor.ownership ? foundry.utils.deepClone(creatureActor.ownership) : {},
    flags: creatureActor.flags ? foundry.utils.deepClone(creatureActor.flags) : {},
    prototypeToken: protoToken,
    system: companionSystem,
    items: itemsToCopy
  };

  // Create new Companion Actor without touching the original Creature document
  const companion = await Actor.create(companionPayload);

  ui.notifications.info(
    game.i18n.format("TRESPASSER.Notification.Companion.Converted", { name: companion.name })
  );

  companion.sheet.render(true);
  return companion;
}
