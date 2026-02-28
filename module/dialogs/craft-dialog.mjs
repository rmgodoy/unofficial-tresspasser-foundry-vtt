/**
 * Craft Selection Dialog
 * Usage: await showCraftDialog(craftItem, actor)
 */

import { showItemInfoDialog } from "./item-info-dialog.mjs";

const ATTRIBUTE_LABELS = {
  mighty:    "TRESPASSER.Sheet.Attributes.Mighty",
  agility:   "TRESPASSER.Sheet.Attributes.Agility",
  intellect: "TRESPASSER.Sheet.Attributes.Intellect",
  spirit:    "TRESPASSER.Sheet.Attributes.Spirit",
};

export async function showCraftDialog(craftItem, actor) {
  const sys       = craftItem.system;
  const craftName = craftItem.name;

  // ── Is this the first craft? ──────────────────────────────────
  const craftsSlots   = actor.system.crafts ?? [];
  const alreadyListed = craftsSlots.some(s => s && s.trim() === craftName.trim());
  const isFirstCraft  = !craftsSlots.some(s => s && s.trim() !== "");

  // ── Key attribute ─────────────────────────────────────────────
  const keyAttr      = sys.keyAttribute || "mighty";
  const keyAttrLabel = game.i18n.localize(ATTRIBUTE_LABELS[keyAttr] ?? keyAttr);

  // First craft  → checked + readonly (must change to it)
  // Later crafts → unchecked + enabled (user may optionally change)
  const keyAttrHTML = isFirstCraft
    ? `<label class="craft-dlg-chip" style="justify-content:flex-start;cursor:default;"
              title="${game.i18n.localize("TRESPASSER.CraftDialog.AttrFirstTooltip")}">
         <input type="checkbox" id="craft-attr-check" checked disabled
                style="accent-color:var(--trp-gold);flex-shrink:0;cursor:default;" />
         <span class="craft-dlg-name" style="margin-left:8px;">${keyAttrLabel}</span>
         <span style="margin-left:6px;font-size:10px;color:var(--trp-text-dim);font-style:italic;">
           ${game.i18n.localize("TRESPASSER.CraftDialog.AttrFirstTooltip")}
         </span>
       </label>`
    : `<label class="craft-dlg-chip" style="justify-content:flex-start;">
         <input type="checkbox" id="craft-attr-check"
                style="accent-color:var(--trp-gold);flex-shrink:0;" />
         <span class="craft-dlg-name" style="margin-left:8px;">${keyAttrLabel}</span>
       </label>`;

  // ── Item chip helpers ─────────────────────────────────────────
  const noItems = () =>
    `<div class="craft-dlg-empty">${game.i18n.localize("TRESPASSER.CraftDialog.NoItems")}</div>`;

  const infoBtn = uuid =>
    `<a class="dlg-info-btn" data-uuid="${uuid}" title="${game.i18n.localize("TRESPASSER.Dialog.ViewItem")}"
        style="flex-shrink:0;color:var(--trp-text-dim);margin-left:4px;font-size:12px;cursor:pointer;">
       <i class="fas fa-info-circle"></i>
     </a>`;

  const chipHTML = (list, listId) => {
    if (!list || list.length === 0) return noItems();
    return list.map((entry, i) => `
      <div class="craft-dlg-chip-row">
        <label class="craft-dlg-chip" data-list="${listId}" data-index="${i}" style="flex:1;margin:0;">
          <input type="checkbox" class="craft-dlg-check" data-list="${listId}" data-index="${i}" />
          <img src="${entry.img}" width="20" height="20" style="border:none;border-radius:50%;flex-shrink:0;" />
          <span class="craft-dlg-name">${entry.name}</span>
        </label>
        ${entry.uuid ? infoBtn(entry.uuid) : ""}
      </div>`).join("");
  };

  const descHTML = sys.description
    ? `<div class="craft-dlg-desc">${sys.description}</div>` : "";

  const searchBar = tabId =>
    `<input type="text" class="craft-dlg-search" data-tab="${tabId}"
            placeholder="${game.i18n.localize("TRESPASSER.CraftDialog.SearchPlaceholder")}" />`;

  const tabBtn = (id, label, first = false) =>
    `<a class="craft-dlg-tab-btn item${first ? " active" : ""}" data-tab="${id}"
        style="font-family:var(--trp-font-header);font-size:11px;text-transform:uppercase;
               letter-spacing:.08em;padding:5px 12px;cursor:pointer;
               color:${first ? "var(--trp-gold-bright)" : "var(--trp-text-dim)"};
               border-bottom:2px solid ${first ? "var(--trp-gold)" : "transparent"};">${label}</a>`;

  const content = `
    <div class="trespasser craft-dialog"
         style="font-family:var(--trp-font-body);color:var(--trp-text);background:var(--trp-bg-dark);">
      <div class="craft-dlg-header"
           style="border-bottom:2px solid var(--trp-gold-dim);padding-bottom:8px;margin-bottom:10px;">
        <h2 style="font-family:var(--trp-font-header);color:var(--trp-gold-bright);margin:0 0 4px;">${craftName}</h2>
        ${descHTML}
      </div>
      <nav class="craft-dlg-tabs sheet-tabs"
           style="display:flex;border-bottom:2px solid var(--trp-border);margin-bottom:8px;">
        ${tabBtn("attribute", game.i18n.localize("TRESPASSER.CraftDialog.TabAttribute"), true)}
        ${tabBtn("deeds",     game.i18n.localize("TRESPASSER.CraftDialog.TabDeeds"))}
        ${tabBtn("features",  game.i18n.localize("TRESPASSER.CraftDialog.TabFeatures"))}
      </nav>
      <div class="craft-dlg-tab-content" style="min-height:200px;max-height:320px;">
        <div class="craft-dlg-pane" data-pane="attribute">
          <div class="craft-dlg-list" style="margin-top:4px;">${keyAttrHTML}</div>
        </div>
        <div class="craft-dlg-pane" data-pane="deeds" style="display:none;">
          ${searchBar("deeds")}
          <div class="craft-dlg-list">${chipHTML(sys.deeds, "deeds")}</div>
        </div>
        <div class="craft-dlg-pane" data-pane="features" style="display:none;">
          ${searchBar("features")}
          <div class="craft-dlg-list">${chipHTML(sys.features, "features")}</div>
        </div>
      </div>
    </div>
    <style>
      .craft-dialog .craft-dlg-desc{font-size:13px;color:var(--trp-text-dim);font-style:italic;margin-top:4px;}
      .craft-dialog .craft-dlg-search{width:100%;box-sizing:border-box;margin-bottom:8px;padding:4px 8px;background:var(--trp-bg-input);border:1px solid var(--trp-border);color:var(--trp-text-bright);font-family:var(--trp-font-body);font-size:13px;border-radius:3px;}
      .craft-dialog .craft-dlg-list{display:flex;flex-direction:column;gap:3px;overflow-y:auto;max-height:270px;padding-right:2px;}
      .craft-dialog .craft-dlg-chip-row{display:flex;align-items:center;gap:4px;}
      .craft-dialog .craft-dlg-chip{display:flex;align-items:center;gap:8px;padding:4px 8px;background:rgba(0,0,0,0.2);border:1px solid var(--trp-border);border-radius:4px;cursor:pointer;transition:background 0.1s;}
      .craft-dialog .craft-dlg-chip:hover{background:rgba(201,168,76,0.08);border-color:var(--trp-gold-dim);}
      .craft-dialog .craft-dlg-name{font-size:13px;color:var(--trp-text-bright);flex:1;}
      .craft-dialog .craft-dlg-empty{color:var(--trp-text-dim);font-style:italic;padding:12px 0;text-align:center;}
      .craft-dialog input[type="checkbox"]{accent-color:var(--trp-gold);}
      .craft-dialog .dlg-info-btn{flex-shrink:0;color:var(--trp-text-dim);font-size:12px;cursor:pointer;padding:2px 4px;}
      .craft-dialog .dlg-info-btn:hover{color:var(--trp-gold-bright);}
    </style>`;

  return new Promise(resolve => {
    const dialog = new Dialog({
      title: game.i18n.format("TRESPASSER.CraftDialog.Title", { name: craftName }),
      content,
      buttons: {
        apply: {
          label: `<i class="fas fa-check"></i> ${game.i18n.localize("TRESPASSER.CraftDialog.Apply")}`,
          callback: async html => {
            const actorUpdates = {};

            // ── Write Craft name to first empty slot ──────────────
            // Build the full 3-slot array to avoid index overwrite bug
            if (!alreadyListed) {
              const current  = actor.system.crafts ?? [];
              const newSlots = [current[0] ?? "", current[1] ?? "", current[2] ?? ""];
              const emptyIdx = newSlots.findIndex(s => !s || s.trim() === "");
              if (emptyIdx !== -1) {
                newSlots[emptyIdx] = craftName;
                actorUpdates["system.crafts"] = newSlots;
              }
            }

            // ── Key attribute ─────────────────────────────────────
            if (isFirstCraft || html.find("#craft-attr-check").prop("checked")) {
              actorUpdates["system.key_attribute"] = keyAttr;
            }

            if (Object.keys(actorUpdates).length > 0) await actor.update(actorUpdates);

            // ── Deeds & Features ───────────────────────────────────
            const toCreate = [];
            for (const listKey of ["deeds", "features"]) {
              html.find(`.craft-dlg-check[data-list='${listKey}']:checked`).each((_, el) => {
                const entry = sys[listKey]?.[parseInt(el.dataset.index)];
                if (entry) toCreate.push(entry);
              });
            }
            for (const entry of toCreate) {
              const sourceItem = await fromUuid(entry.uuid);
              if (!sourceItem) continue;
              const itemData = sourceItem.toObject();
              delete itemData._id;
              foundry.utils.setProperty(itemData, "flags.trespasser.linkedSource", craftName);
              await foundry.documents.BaseItem.create(itemData, { parent: actor });
            }

            ui.notifications.info(
              game.i18n.format("TRESPASSER.CraftDialog.Applied", { name: craftName, actor: actor.name })
            );
            resolve(true);
          }
        },
        cancel: {
          label: game.i18n.localize("TRESPASSER.CraftDialog.Cancel"),
          callback: () => resolve(false)
        }
      },
      default: "apply",
      render: html => {
        // Tab switching
        html.find(".craft-dlg-tab-btn").on("click", ev => {
          const tab = ev.currentTarget.dataset.tab;
          html.find(".craft-dlg-tab-btn").each((_, btn) => {
            const active = btn.dataset.tab === tab;
            btn.style.color            = active ? "var(--trp-gold-bright)" : "var(--trp-text-dim)";
            btn.style.borderBottomColor = active ? "var(--trp-gold)" : "transparent";
          });
          html.find(".craft-dlg-pane").each((_, pane) => {
            pane.style.display = pane.dataset.pane === tab ? "" : "none";
          });
        });

        // Search — filter chip-rows (wrapper includes both label and info icon)
        html.find(".craft-dlg-search").on("input", ev => {
          const query = ev.currentTarget.value.toLowerCase().trim();
          const tabId = ev.currentTarget.dataset.tab;
          html.find(`.craft-dlg-pane[data-pane="${tabId}"] .craft-dlg-chip-row`).each((_, row) => {
            const name = row.querySelector(".craft-dlg-name")?.textContent?.toLowerCase() ?? "";
            row.style.display = name.includes(query) ? "" : "none";
          });
        });

        // Info icons
        html.find(".dlg-info-btn").on("click", async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          await showItemInfoDialog(ev.currentTarget.dataset.uuid);
        });
      }
    }, {
      classes: ["trespasser", "dialog", "craft-dialog"],
      width: 480,
      height: "auto",
      resizable: true
    });

    dialog.render(true);
  });
}
