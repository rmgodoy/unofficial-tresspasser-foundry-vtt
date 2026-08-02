/**
 * Commoner Upgrade Helper for Trespasser TTRPG.
 * Provides GM-only action to upgrade a Level 0 Commoner to a Level 1 Trespasser Character.
 */

/**
 * Prompts the GM and converts a Commoner actor into a Level 1 Trespasser Character.
 *
 * @param {Actor} commonerActor - The source commoner actor document.
 * @returns {Promise<Actor|null>} The newly created Character actor, or null if cancelled / unauthorized.
 */
export async function upgradeCommonerToTrespasser(commonerActor) {
  if (!game.user.isGM) {
    ui.notifications.error(game.i18n.localize("TRESPASSER.COMMONER.GM_ONLY_ACTION"));
    return null;
  }

  // Confirmation Dialog using ApplicationsV2 DialogV2
  const confirm = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("TRESPASSER.COMMONER.UPGRADE_DIALOG_TITLE") },
    content: game.i18n.format("TRESPASSER.COMMONER.UPGRADE_DIALOG_CONTENT", { name: commonerActor.name }),
    yes: { label: game.i18n.localize("TRESPASSER.COMMONER.UPGRADE_CONFIRM") },
    no: { label: game.i18n.localize("TRESPASSER.Global.Action.Cancel") }
  });

  if (!confirm) return null;

  const sys = commonerActor.system;

  // Prepare alignment formatting for Character sheet
  let alignmentPayload = [
    { name: "", leftBoxes: [false, false, false], rightBoxes: [false, false, false] },
    { name: "", leftBoxes: [false, false, false], rightBoxes: [false, false, false] }
  ];

  if (sys.alignment) {
    if (typeof sys.alignment === "string") {
      alignmentPayload[0].name = sys.alignment;
    } else if (Array.isArray(sys.alignment)) {
      alignmentPayload = foundry.utils.deepClone(sys.alignment);
    }
  }

  // Prepare Character Data Payload
  const characterPayload = {
    name: commonerActor.name,
    type: "character",
    img: commonerActor.img,
    system: {
      lineage: sys.lineage || "",
      past_life: sys.past_life || "",
      alignment: alignmentPayload,
      level: 1,
      attributes: {
        mighty: sys.attributes?.mighty || 0,
        agility: sys.attributes?.agility || 0,
        intellect: sys.attributes?.intellect || 0,
        spirit: sys.attributes?.spirit || 0
      },
      skills: foundry.utils.deepClone(sys.skills || {}),
      notes: sys.notes || ""
    }
  };

  // Create new Character Actor Document
  const newCharacter = await Actor.create(characterPayload);

  // Transfer Items (weapons, armor, equipment, past life, etc. Exclude default commoner deed)
  const itemsToCopy = commonerActor.items
    .filter(item => !item.system?.is_default_commoner)
    .map(item => item.toObject());

  if (itemsToCopy.length > 0) {
    await newCharacter.createEmbeddedDocuments("Item", itemsToCopy);
  }

  ui.notifications.info(
    game.i18n.format("TRESPASSER.COMMONER.UPGRADE_SUCCESS", { name: newCharacter.name })
  );

  // Render the newly created Character sheet
  newCharacter.sheet.render(true);

  return newCharacter;
}
