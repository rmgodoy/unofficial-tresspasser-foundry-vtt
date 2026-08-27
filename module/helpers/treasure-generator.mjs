/**
 * Treasure Generator for Trespasser RPG
 *
 * Implements the Treasure Generation tables and mechanics from the core rules:
 * - Form Factor: 1d20 + 1d6 (1-3 vs 4-6)
 * - Material: 1d20
 * - Gemstone: 1d20
 * - Value: 3d20 sum (<30: Rare / 1 XP, 30+: Precious / 3 XP, 40+: Fabulous / 5 XP)
 */

import { TREASURE_CONFIG } from "../config/treasure-config.mjs";
import { getRollMessageMode, applyMessageMode } from "./compat.mjs";

export class TreasureGenerator {

  /**
   * Generates and resolves a single piece of treasure.
   *
   * @param {object} [options={}]
   * @param {boolean} [options.whisperToGM=false] - Whether to whisper chat card to GM only
   * @param {Actor|string|null} [options.targetActor=null] - Optional recipient Actor or Actor ID
   * @param {boolean} [options.createItem=false] - Whether to immediately create the Item document
   * @param {boolean} [options.displayChat=true] - Whether to post the chat card
   * @param {object} [options.chatData={}] - Extra ChatMessage data from chat invocation
   * @param {object} [options.createOptions={}] - Message options (messageMode, rollMode, etc.)
   * @returns {Promise<object>} The evaluated treasure result data
   */
  static async rollTreasure(options = {}) {
    const targetActor = options.targetActor || null;
    const createItem = options.createItem ?? false;
    const displayChat = options.displayChat ?? true;

    // 1. Roll dice
    const formD20Roll = await new Roll("1d20").evaluate();
    const formD6Roll = await new Roll("1d6").evaluate();
    const matD20Roll = await new Roll("1d20").evaluate();
    const gemD20Roll = await new Roll("1d20").evaluate();

    const formD20 = formD20Roll.total;
    const formColNum = formD6Roll.total;
    const formCol = formColNum <= 3 ? "col1" : "col2";
    const matD20 = matD20Roll.total;
    const gemD20 = gemD20Roll.total;

    // 2. Lookup table entries
    const formEntry = TREASURE_CONFIG.formFactors[formD20]?.[formCol] || {
      key: "curio",
      label: "TRESPASSER.Terms.Treasure.Forms.Vessel"
    };
    const isTiny = Boolean(formEntry.isTiny);
    const noMaterial = Boolean(formEntry.noMaterial);
    const noGem = Boolean(formEntry.noGem);

    const matEntry = noMaterial ? null : (TREASURE_CONFIG.materials[matD20] || null);
    const gemEntry = noGem ? null : (TREASURE_CONFIG.gemstones[gemD20] || null);

    // 3. Compute 3d20 sum & Value Tier
    const sum3d20 = formD20 + matD20 + gemD20;
    let tierKey = "rare";
    if (sum3d20 >= 40) {
      tierKey = "fabulous";
    } else if (sum3d20 >= 30) {
      tierKey = "precious";
    }
    const tierConfig = TREASURE_CONFIG.valueTiers[tierKey];
    const value = tierConfig.value;

    // 4. Resolve Localized Names
    const formLabel = game.i18n.localize(formEntry.label);
    const materialLabel = matEntry ? game.i18n.localize(matEntry.label) : "";
    const gemstoneLabel = gemEntry ? game.i18n.localize(gemEntry.label) : "";
    const tierLabel = game.i18n.localize(tierConfig.label);
    const valueLabel = game.i18n.format("TRESPASSER.Terms.Treasure.ValueXP", { value });

    // 5. Construct Composite Treasure Name
    const isPtBr = (game.i18n.lang || "").toLowerCase().startsWith("pt");
    let name = "";
    if (noMaterial && gemstoneLabel) {
      name = isPtBr ? `Gema (${gemstoneLabel})` : `${gemstoneLabel} (Gem)`;
    } else if (noGem && materialLabel) {
      name = isPtBr ? `${formLabel} de ${materialLabel}` : `${materialLabel} ${formLabel}`;
    } else if (materialLabel && gemstoneLabel) {
      name = isPtBr
        ? `${formLabel} de ${materialLabel} com ${gemstoneLabel}`
        : `${materialLabel} ${formLabel} with ${gemstoneLabel}`;
    } else if (materialLabel) {
      name = isPtBr ? `${formLabel} de ${materialLabel}` : `${materialLabel} ${formLabel}`;
    } else {
      name = formLabel;
    }

    if (isTiny) {
      const tinyTag = game.i18n.localize("TRESPASSER.Terms.Treasure.Tiny");
      name += ` (${tinyTag})`;
    }

    // 6. Assemble Result Object
    const result = {
      name,
      tier: tierKey,
      tierLabel,
      value,
      valueLabel,
      sum3d20,
      isTiny,
      slotOccupancy: isTiny ? 0.2 : 1,
      formRoll: { d20: formD20, col: formColNum, key: formEntry.key },
      matRoll: matD20,
      gemRoll: gemD20,
      formLabel,
      materialLabel,
      gemstoneLabel,
      rolls: {
        formD20: formD20Roll,
        formD6: formD6Roll,
        matD20: matD20Roll,
        gemD20: gemD20Roll
      }
    };

    // Prepare JSON for interactive chat card button
    result.treasureJson = encodeURIComponent(JSON.stringify({
      name: result.name,
      tier: result.tier,
      value: result.value,
      isTiny: result.isTiny,
      slotOccupancy: result.slotOccupancy,
      formLabel: result.formLabel,
      materialLabel: result.materialLabel,
      gemstoneLabel: result.gemstoneLabel,
      sum3d20: result.sum3d20
    }));

    // 7. Post Chat Message if enabled
    if (displayChat) {
      await this.renderTreasureCard(result, options);
    }

    // 8. Create Item Document if requested
    if (createItem) {
      await this.createTreasureItem(result, targetActor);
    }

    return result;
  }

  /**
   * Renders and sends the treasure chat card respecting active chat options/whispers.
   *
   * @param {object} treasureResult - The evaluated treasure data
   * @param {object} [options={}]
   * @param {boolean} [options.whisperToGM=false] - Explicit whisper to GM
   * @param {object} [options.chatData={}] - Extra chatData
   * @param {object} [options.createOptions={}] - Extra createOptions
   * @returns {Promise<ChatMessage>}
   */
  static async renderTreasureCard(treasureResult, options = {}) {
    const templateData = {
      ...treasureResult,
      gmOnlyActions: true
    };

    const render = foundry.applications?.handlebars?.renderTemplate || globalThis.renderTemplate;
    const content = await render(
      "systems/trespasser/templates/chat/treasure-card.hbs",
      templateData
    );

    const messageData = foundry.utils.mergeObject({
      content,
      speaker: options.chatData?.speaker || ChatMessage.getSpeaker({ alias: game.i18n.localize("TRESPASSER.Terms.Treasure.Title") }),
      flags: {
        trespasser: {
          treasure: treasureResult
        }
      }
    }, options.chatData || options.messageData || {});

    // Determine rollMode / messageMode
    const rawMode = options.createOptions?.messageMode
      || options.createOptions?.rollMode
      || options.messageMode
      || options.rollMode
      || game.settings.get("core", "messageMode")
      || game.settings.get("core", "rollMode");

    if (options.whisperToGM) {
      messageData.whisper = game.users.filter(u => u.isGM).map(u => u.id);
    } else if (!messageData.whisper || messageData.whisper.length === 0) {
      applyMessageMode(messageData, rawMode);
    }

    const messageOptions = options.createOptions?.messageMode
      ? { messageMode: options.createOptions.messageMode }
      : getRollMessageMode(rawMode);

    return ChatMessage.create(messageData, messageOptions);
  }

  /**
   * Converts evaluated treasure data into Foundry Item document data.
   *
   * @param {object} treasureResult - The treasure result
   * @returns {object} Raw Item creation data
   */
  static generateItemData(treasureResult) {
    const isTiny = Boolean(treasureResult.isTiny);
    const qualityLabel = treasureResult.tierLabel || game.i18n.localize(`TRESPASSER.Terms.Treasure.Tiers.${treasureResult.tier?.capitalize?.() || "Rare"}`);
    const valueLabel = treasureResult.valueLabel || `${treasureResult.value} XP`;
    const slotLabel = isTiny
      ? game.i18n.localize("TRESPASSER.Terms.Treasure.TinyNote")
      : "1";

    let desc = `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Treasure.Quality")}:</strong> ${qualityLabel} (${valueLabel})</p>`;
    desc += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Treasure.SlotOccupancy")}:</strong> ${slotLabel}</p>`;
    if (treasureResult.materialLabel) {
      desc += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Treasure.Material")}:</strong> ${treasureResult.materialLabel}</p>`;
    }
    if (treasureResult.gemstoneLabel) {
      desc += `<p><strong>${game.i18n.localize("TRESPASSER.Terms.Treasure.Gemstone")}:</strong> ${treasureResult.gemstoneLabel}</p>`;
    }
    if (treasureResult.sum3d20) {
      desc += `<p style="font-size:var(--fs-11);color:#a09070;"><em>${game.i18n.localize("TRESPASSER.Terms.Treasure.FormulaRoll")}: ${treasureResult.sum3d20}</em></p>`;
    }

    return {
      name: treasureResult.name,
      type: "item",
      img: "systems/trespasser/assets/icons/item.webp",
      system: {
        subType: "miscellaneous",
        price: treasureResult.value || 1,
        quantity: 1,
        slotOccupancy: isTiny ? 0.2 : 1,
        description: desc
      }
    };
  }

  /**
   * Creates a Foundry Item document in the World (under 'Random Treasures' folder)
   * or directly in a Character's inventory if currently selected.
   *
   * @param {object} treasureResult - The treasure result or parsed JSON
   * @param {Actor|string|null} [target=null] - Target Actor, Actor ID, or null to auto-detect selected Character
   * @returns {Promise<Item>}
   */
  static async createTreasureItem(treasureResult, target = null) {
    let actor = null;
    if (target) {
      actor = typeof target === "string" ? game.actors.get(target) : target;
    } else {
      const selectedCharToken = canvas.tokens?.controlled?.find(t => t.actor?.type === "character");
      if (selectedCharToken) {
        actor = selectedCharToken.actor;
      }
    }

    const itemData = this.generateItemData(treasureResult);

    if (actor && actor.type === "character" && typeof actor.createEmbeddedDocuments === "function") {
      const [created] = await actor.createEmbeddedDocuments("Item", [itemData]);
      ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Treasure.AddedToActor", {
        name: created.name,
        actor: actor.name
      }));
      return created;
    }

    // If no Character token is selected, create inside "Random Treasures" folder in Items sidebar
    let folder = game.folders.find(f => f.type === "Item" && f.name === "Random Treasures");
    if (!folder) {
      folder = await Folder.create({
        name: "Random Treasures",
        type: "Item",
        color: "#c9a84c"
      });
    }

    itemData.folder = folder.id;
    const created = await Item.create(itemData);
    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Treasure.Created", {
      name: created.name
    }));
    return created;
  }

  /**
   * Creates/populates standard Foundry RollTable documents in the World for users who prefer sidebar tables.
   *
   * @returns {Promise<Folder>} The folder containing the tables
   */
  static async ensureRollTables() {
    let folder = game.folders.find(f => f.type === "RollTable" && f.name === "Trespasser Tables");
    if (!folder) {
      folder = await Folder.create({
        name: "Trespasser Tables",
        type: "RollTable",
        color: "#c9a84c"
      });
    }

    const tablesToCreate = [
      {
        name: "Treasure - Form Factor (1-3)",
        formula: "1d20",
        results: Object.entries(TREASURE_CONFIG.formFactors).map(([row, colData]) => ({
          type: CONST.TABLE_RESULT_TYPES.TEXT,
          text: game.i18n.localize(colData.col1.label) + (colData.col1.isTiny ? " (tiny)" : ""),
          range: [Number(row), Number(row)],
          weight: 1
        }))
      },
      {
        name: "Treasure - Form Factor (4-6)",
        formula: "1d20",
        results: Object.entries(TREASURE_CONFIG.formFactors).map(([row, colData]) => ({
          type: CONST.TABLE_RESULT_TYPES.TEXT,
          text: game.i18n.localize(colData.col2.label),
          range: [Number(row), Number(row)],
          weight: 1
        }))
      },
      {
        name: "Treasure - Materials",
        formula: "1d20",
        results: Object.entries(TREASURE_CONFIG.materials).map(([row, mat]) => ({
          type: CONST.TABLE_RESULT_TYPES.TEXT,
          text: game.i18n.localize(mat.label),
          range: [Number(row), Number(row)],
          weight: 1
        }))
      },
      {
        name: "Treasure - Gemstones",
        formula: "1d20",
        results: Object.entries(TREASURE_CONFIG.gemstones).map(([row, gem]) => ({
          type: CONST.TABLE_RESULT_TYPES.TEXT,
          text: game.i18n.localize(gem.label),
          range: [Number(row), Number(row)],
          weight: 1
        }))
      }
    ];

    for (const tableData of tablesToCreate) {
      const existing = game.tables.find(t => t.name === tableData.name && t.folder?.id === folder.id);
      if (!existing) {
        await RollTable.create({
          ...tableData,
          folder: folder.id
        });
      }
    }

    return folder;
  }
}
