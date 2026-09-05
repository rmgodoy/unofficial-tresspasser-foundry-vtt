import { addItemToActor } from "../../helpers/item-transfer-helper.mjs";
import { TrespasserSocket } from "../../helpers/socket/socket.mjs";
import { resolveItem } from "../../helpers/item-resolver.mjs";

export async function onProcessWeek(sheet, event, target) {
  await sheet.document.system.resolveHirelings();
}

export async function onUpkeepWeeksRest(sheet, event, target) {
  await sheet.document.system.weeksRest();
}

export async function onUpkeepPopulationCheck(sheet, event, target) {
  await sheet.document.system.populationCheck();
}

export async function onUpkeepEventCheck(sheet, event, target) {
  await sheet.document.system.eventCheck();
}

export async function onRemoveLeader(sheet, event, target) {
  await sheet.document.update({ "system.leaderId": "" });
}

export function onOpenLeaderSheet(sheet, event, target) {
  const leader = game.actors.get(sheet.document.system.leaderId);
  if (leader) leader.sheet.render(true);
}

export async function onAddChain(sheet, event, target) {
  const chains = [...sheet.document.system.productionChains];
  chains.push({
    id: foundry.utils.randomID(),
    name: game.i18n.localize("TRESPASSER.Global.Action.NewChain"),
    active: true,
    hirelings: []
  });
  await sheet.document.update({ "system.productionChains": chains });
}

export async function onRemoveChain(sheet, event, target) {
  const index = parseInt(target.dataset.chainIndex);
  const chains = [...sheet.document.system.productionChains];
  chains.splice(index, 1);
  await sheet.document.update({ "system.productionChains": chains });
}

export async function onToggleChain(sheet, event, target) {
  const index = parseInt(target.dataset.chainIndex);
  const chains = foundry.utils.duplicate(sheet.document.system.productionChains);
  const chain = chains[index];
  const active = target.checked;
  
  chain.active = active;
  await sheet.document.update({ "system.productionChains": chains });

  const hirelingUpdates = chain.hirelings.map(id => ({
    _id: id,
    "system.active": active
  }));

  if ( hirelingUpdates.length ) {
    await sheet.document.updateEmbeddedDocuments("Item", hirelingUpdates);
  }
}

export async function onRemoveHirelingFromChain(sheet, event, target) {
  const chainIndex = parseInt(target.dataset.chainIndex);
  const itemId = target.dataset.itemId;
  const chains = foundry.utils.duplicate(sheet.document.system.productionChains);
  const chain = chains[chainIndex];
  if ( !chain ) return;
  chain.hirelings = chain.hirelings.filter(id => id !== itemId);
  await sheet.document.update({ "system.productionChains": chains });
}

export async function onAddHirelingToChain(sheet, event, target) {
  const chainIndex = parseInt(target.dataset.chainIndex);
  const select = target.closest(".add-hireling-to-chain-container").querySelector("select");
  const itemId = select.value;
  if (!itemId) return;

  const chains = foundry.utils.duplicate(sheet.document.system.productionChains);
  const chain = chains[chainIndex];
  
  for (const c of chains) {
    c.hirelings = c.hirelings.filter(id => id !== itemId);
  }

  chain.hirelings.push(itemId);
  await sheet.document.update({ "system.productionChains": chains });

  const hireling = sheet.document.items.get(itemId);
  if ( hireling ) {
    await hireling.update({ "system.active": chain.active });
  }
}

export async function onAdjustInventoryQty(sheet, event, target) {
  const index = parseInt(target.closest("[data-index]").dataset.index);
  const delta = parseInt(target.dataset.delta);
  const inventory = foundry.utils.duplicate(sheet.document.system.inventory);
  
  if (inventory[index]) {
    inventory[index].quantity = Math.max(0, inventory[index].quantity + delta);
    if (inventory[index].quantity === 0) inventory.splice(index, 1);
    await sheet.document.update({ "system.inventory": inventory });
  }
}

export async function onDeleteInventoryItem(sheet, event, target) {
  const index = parseInt(target.closest("[data-index]").dataset.index);
  const inventory = foundry.utils.duplicate(sheet.document.system.inventory);
  const entry = inventory[index];
  const itemName = entry?.item?.name || "Item";
  
  foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format("TRESPASSER.Dialog.Delete.ItemTitle", { name: itemName }) },
    content: `<p>${game.i18n.localize("TRESPASSER.Dialog.Delete.ItemContent")}</p>`,
    yes: {
      callback: async () => {
        inventory.splice(index, 1);
        await sheet.document.update({ "system.inventory": inventory });
      }
    }
  });
}

export async function onWithdrawInventoryItem(sheet, event, target) {
  const index = parseInt(target.closest("[data-index]").dataset.index);
  const inventory = foundry.utils.duplicate(sheet.document.system.inventory);
  const entry = inventory[index];
  if (!entry) return;

  const controlledTokens = canvas.tokens.controlled;
  if (controlledTokens.length === 0) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NoTargetsAbort"));
    return;
  }

  const receiverToken = controlledTokens[0];
  const receiverActor = receiverToken.actor;

  if (receiverActor?.type !== "character") {
    ui.notifications.error(game.i18n.localize("TRESPASSER.Notification.Haven.TransferToCharacterOnly"));
    return;
  }

  const itemData = foundry.utils.duplicate(entry.item);
  const success = await addItemToActor(receiverActor, itemData, 1);

  if (success) {
    TrespasserSocket.emit("HAVEN_WITHDRAWAL", {
      havenUuid: sheet.document.uuid,
      index: index,
      targetActorUuid: receiverActor.uuid,
      transferAll: false
    });
    
    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Item.WithdrawnToActor", { 
      name: itemData.name,
      target: receiverActor.name 
    }));
  }
}

export async function onToggleHirelingActive(sheet, event, target) {
  const itemId = target.dataset.itemId;
  const item = sheet.document.items.get(itemId);
  if (item) await item.update({ "system.active": target.checked });
}

export function onOpenItemSheet(sheet, event, target) {
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = sheet.document.items.get(itemId);
  if (item) item.sheet.render(true);
}

export async function onDeleteItem(sheet, event, target) {
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = sheet.document.items.get(itemId);
  if (!item) return;
  
  foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.format("TRESPASSER.Dialog.Delete.ItemTitle", { name: item.name }) },
    content: `<p>${game.i18n.format("TRESPASSER.Dialog.Delete.ItemContent", { name: item.name })}</p>`,
    yes: { callback: () => item.delete() }
  });
}

export async function onAdjustBuildClock(sheet, event, target) {
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const delta = parseInt(target.dataset.delta);
  const item = sheet.document.items.get(itemId);
  if (!item) return;

  const newProgress = Math.clamp((item.system.progress || 0) + delta, 0, item.system.buildClock);
  await item.update({ "system.progress": newProgress });

  if ( newProgress >= item.system.buildClock && item.system.replacesId ) {
    const actor = sheet.document;
    const targetId = item.system.replacesId;
    const targetEl = actor.items.get(targetId);
    if ( targetEl ) {
      await targetEl.delete();
      await item.update({ "system.replacesId": "" });
      ui.notifications.info(`${item.name} completion replaced ${targetEl.name}.`);
    }
  }
}

export async function onUpgradeBuilding(sheet, event, target) {
  const itemId = target.closest("[data-item-id]")?.dataset.itemId;
  const item = sheet.document.items.get(itemId);
  if ( !item || !item.system.upgradeTo ) return;

  const template = await resolveItem(item.system.upgradeTo, { type: "build" });
  if ( !template ) return;

  const itemData = template.toObject();
  itemData.system.progress = 0;
  itemData.system.replacesId = item.id;

  if (game.settings.get("trespasser", "enforceHavenBuildingLimits")) {
    const system = sheet.document.system;
    const construction = sheet.document.items.filter(i => i.type === "build" && i.system.progress < i.system.buildClock);
    
    if (construction.length >= system.maxBuildSlots) {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Haven.NoBuildSlots", { max: system.maxBuildSlots }));
      return;
    }
  }

  await sheet.document.createEmbeddedDocuments("Item", [itemData]);
  ui.notifications.info(`Upgrading ${item.name} to ${template.name}. New construction has started.`);
}

export async function onAddProject(sheet, event, target) {
  const projects = [...sheet.document.system.projects];
  projects.push({
    id: foundry.utils.randomID(),
    name: "New Project",
    clock: 4,
    current: 0
  });
  await sheet.document.update({ "system.projects": projects });
}

export async function onRemoveProject(sheet, event, target) {
  const projectId = target.closest("[data-project-id]")?.dataset.projectId;
  const projects = sheet.document.system.projects.filter(p => p.id !== projectId);
  await sheet.document.update({ "system.projects": projects });
}

export async function onEventClockClick(sheet, event, target) {
  const index = parseInt(target.dataset.index);
  if ( isNaN(index) ) return;
  
  const total = Number(sheet.document.system.event.clock);
  const current = Number(sheet.document.system.event.current);
  const newValue = (current === index + 1) ? index : Math.min(index + 1, total);
  
  return sheet.document.update({ "system.event.current": newValue });
}

export async function onProjectClockClick(sheet, event, target) {
  const clockWidget = target.closest(".trespasser-clock");
  const projectId = clockWidget?.dataset.id;
  const index = parseInt(target.dataset.index);
  if ( isNaN(index) || !projectId ) return;

  const projects = foundry.utils.duplicate(sheet.document.system.projects || []);
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  const total = Number(project.clock);
  const newValue = (project.current === index + 1) ? index : Math.min(index + 1, total);
  project.current = newValue;

  await sheet.document.update({ "system.projects": projects });
}

export async function onHavenSubmit(sheet, event, form, formData) {
  const systemUpdate = {};
  const projects = foundry.utils.duplicate(sheet.document.system.projects || []);
  const chains = foundry.utils.duplicate(sheet.document.system.productionChains || []);
  let arrayUpdated = false;

  for ( let [key, value] of Object.entries(formData.object) ) {
    if ( key.startsWith("system.projects.") ) {
      const parts = key.split(".");
      const index = parseInt(parts[2]);
      const field = parts[3];
      if ( projects[index] ) {
        projects[index][field] = field === "clock" ? (parseInt(value) || 4) : value;
        arrayUpdated = true;
      }
    } else if ( key.startsWith("system.productionChains.") ) {
      const parts = key.split(".");
      const index = parseInt(parts[2]);
      const field = parts[3];
      if ( chains[index] ) {
        chains[index][field] = value;
        arrayUpdated = true;
      }
    } else {
      systemUpdate[key] = value;
    }
  }

  if ( arrayUpdated ) {
    systemUpdate["system.projects"] = projects;
    systemUpdate["system.productionChains"] = chains;
  }

  if ( Object.keys(systemUpdate).length ) {
    await sheet.document.update(systemUpdate);
  }
}
