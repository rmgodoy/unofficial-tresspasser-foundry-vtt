/**
 * Calling Selection Dialog
 * Usage: await showCallingDialog(callingItem, actor)
 */

import { showItemInfoDialog } from "./item-info-dialog.mjs";

export async function showCallingDialog(callingItem, actor) {
  const sys = callingItem.system;

  // ── Skill rows ────────────────────────────────────────────────
  const ALL_SKILL_KEYS = [
    "acrobatics", "alchemy", "athletics", "crafting",
    "folklore", "letters", "magic", "nature",
    "perception", "speech", "stealth", "tinkering"
  ];
  const callingSkills = new Set(sys.skills || []);
  const currentSkills = actor.system.skills || {};
  const skillRows = ALL_SKILL_KEYS
    .filter(k => callingSkills.has(k))
    .map(k => ({
      key: k,
      label: game.i18n.localize(`TRESPASSER.Sheet.Skills.${k.charAt(0).toUpperCase() + k.slice(1)}`),
      alreadyTrained: !!currentSkills[k]
    }));

  // ── Shared helpers ────────────────────────────────────────────
  const noItems = () =>
    `<div class="calling-dlg-empty">${game.i18n.localize("TRESPASSER.CallingDialog.NoItems")}</div>`;

  const infoBtn = uuid =>
    `<a class="dlg-info-btn" data-uuid="${uuid}" title="${game.i18n.localize("TRESPASSER.Dialog.ViewItem")}"
        style="flex-shrink:0;color:var(--trp-text-dim);font-size:12px;cursor:pointer;padding:2px 4px;">
       <i class="fas fa-info-circle"></i>
     </a>`;

  const chipHTML = (list, listId) => {
    if (!list || list.length === 0) return noItems();
    return list.map((entry, i) => `
      <div class="calling-dlg-chip-row">
        <label class="calling-dlg-chip" data-list="${listId}" data-index="${i}" style="flex:1;margin:0;">
          <input type="checkbox" class="calling-dlg-check" data-list="${listId}" data-index="${i}" />
          <img src="${entry.img}" width="20" height="20" />
          <span class="calling-dlg-name">${entry.name}</span>
        </label>
        ${entry.uuid ? infoBtn(entry.uuid) : ""}
      </div>`).join("");
  };

  const skillChipHTML = skillRows.length === 0 ? noItems()
    : skillRows.map((row, i) => `
        <label class="calling-dlg-chip ${row.alreadyTrained ? "already-trained" : ""}" data-list="skills" data-index="${i}">
          <input type="checkbox" class="calling-dlg-check" data-list="skills" data-index="${i}" />
          <span class="calling-dlg-name">${row.label}${row.alreadyTrained ? " <em>" + game.i18n.localize("TRESPASSER.CallingDialog.AlreadyTrained") + "</em>" : ""}</span>
        </label>`).join("");

  const descHTML = sys.description
    ? `<div class="calling-dlg-desc">${sys.description}</div>` : "";

  const searchBar = tabId =>
    `<input type="text" class="calling-dlg-search" data-tab="${tabId}" placeholder="${game.i18n.localize("TRESPASSER.CallingDialog.SearchPlaceholder")}" />`;

  const tabBtn = (id, label, first = false) =>
    `<a class="calling-dlg-tab-btn item${first ? " active" : ""}" data-tab="${id}"
        style="font-family:var(--trp-font-header);font-size:11px;text-transform:uppercase;
               letter-spacing:.08em;padding:5px 12px;cursor:pointer;
               color:${first ? "var(--trp-gold-bright)" : "var(--trp-text-dim)"};
               border-bottom:2px solid ${first ? "var(--trp-gold)" : "transparent"};">${label}</a>`;

  const content = `
    <div class="trespasser calling-dialog" style="font-family:var(--trp-font-body);color:var(--trp-text);background:var(--trp-bg-dark);">
      <div class="calling-dlg-header" style="border-bottom:2px solid var(--trp-gold-dim);padding-bottom:8px;margin-bottom:10px;">
        <h2 style="font-family:var(--trp-font-header);color:var(--trp-gold-bright);margin:0 0 4px;">${callingItem.name}</h2>
        ${descHTML}
      </div>
      <nav class="calling-dlg-tabs sheet-tabs" style="display:flex;border-bottom:2px solid var(--trp-border);margin-bottom:8px;">
        ${tabBtn("skills",       game.i18n.localize("TRESPASSER.CallingDialog.TabSkills"),       true)}
        ${tabBtn("talents",      game.i18n.localize("TRESPASSER.CallingDialog.TabTalents"))}
        ${tabBtn("features",     game.i18n.localize("TRESPASSER.CallingDialog.TabFeatures"))}
        ${tabBtn("enhancements", game.i18n.localize("TRESPASSER.CallingDialog.TabEnhancements"))}
      </nav>
      <div class="calling-dlg-tab-content" style="min-height:200px;max-height:320px;">
        <div class="calling-dlg-pane" data-pane="skills">
          ${searchBar("skills")}
          <div class="calling-dlg-list">${skillChipHTML}</div>
        </div>
        <div class="calling-dlg-pane" data-pane="talents" style="display:none;">
          ${searchBar("talents")}
          <div class="calling-dlg-list">${chipHTML(sys.talents, "talents")}</div>
        </div>
        <div class="calling-dlg-pane" data-pane="features" style="display:none;">
          ${searchBar("features")}
          <div class="calling-dlg-list">${chipHTML(sys.features, "features")}</div>
        </div>
        <div class="calling-dlg-pane" data-pane="enhancements" style="display:none;">
          ${searchBar("enhancements")}
          <div class="calling-dlg-list">${chipHTML(sys.enhancements, "enhancements")}</div>
        </div>
      </div>
    </div>
    <style>
      .calling-dialog .calling-dlg-desc{font-size:13px;color:var(--trp-text-dim);font-style:italic;margin-top:4px;}
      .calling-dialog .calling-dlg-search{width:100%;box-sizing:border-box;margin-bottom:8px;padding:4px 8px;background:var(--trp-bg-input);border:1px solid var(--trp-border);color:var(--trp-text-bright);font-family:var(--trp-font-body);font-size:13px;border-radius:3px;}
      .calling-dialog .calling-dlg-list{display:flex;flex-direction:column;gap:3px;overflow-y:auto;max-height:270px;padding-right:2px;}
      .calling-dialog .calling-dlg-chip-row{display:flex;align-items:center;gap:4px;}
      .calling-dialog .calling-dlg-chip{display:flex;align-items:center;gap:8px;padding:4px 8px;background:rgba(0,0,0,0.2);border:1px solid var(--trp-border);border-radius:4px;cursor:pointer;transition:background 0.1s;}
      .calling-dialog .calling-dlg-chip:hover{background:rgba(201,168,76,0.08);border-color:var(--trp-gold-dim);}
      .calling-dialog .calling-dlg-chip img{border:none;border-radius:50%;flex-shrink:0;}
      .calling-dialog .calling-dlg-name{font-size:13px;color:var(--trp-text-bright);flex:1;}
      .calling-dialog .calling-dlg-chip.already-trained .calling-dlg-name{color:var(--trp-text-dim);}
      .calling-dialog .calling-dlg-empty{color:var(--trp-text-dim);font-style:italic;padding:12px 0;text-align:center;}
      .calling-dialog input[type="checkbox"]{flex-shrink:0;accent-color:var(--trp-gold);}
      .calling-dialog .dlg-info-btn{flex-shrink:0;color:var(--trp-text-dim);font-size:12px;cursor:pointer;padding:2px 4px;}
      .calling-dialog .dlg-info-btn:hover{color:var(--trp-gold-bright);}
    </style>`;

  const callingName = callingItem.name;

  return new Promise(resolve => {
    const dialog = new Dialog({
      title: game.i18n.format("TRESPASSER.CallingDialog.Title", { name: callingName }),
      content,
      buttons: {
        apply: {
          label: `<i class="fas fa-check"></i> ${game.i18n.localize("TRESPASSER.CallingDialog.Apply")}`,
          callback: async html => {
            // Skills
            const skillUpdates = {};
            html.find(".calling-dlg-check[data-list='skills']:checked").each((_, el) => {
              const row = skillRows[parseInt(el.dataset.index)];
              if (row) skillUpdates[`system.skills.${row.key}`] = true;
            });
            await actor.update({ ...skillUpdates, "system.calling": callingName });

            // Talents / Features / Enhancements
            const toCreate = [];
            for (const listKey of ["talents", "features", "enhancements"]) {
              html.find(`.calling-dlg-check[data-list='${listKey}']:checked`).each((_, el) => {
                const entry = sys[listKey]?.[parseInt(el.dataset.index)];
                if (entry) toCreate.push(entry);
              });
            }
            for (const entry of toCreate) {
              const sourceItem = await fromUuid(entry.uuid);
              if (!sourceItem) continue;
              const itemData = sourceItem.toObject();
              delete itemData._id;
              foundry.utils.setProperty(itemData, "flags.trespasser.linkedSource", callingName);
              await foundry.documents.BaseItem.create(itemData, { parent: actor });
            }

            ui.notifications.info(
              game.i18n.format("TRESPASSER.CallingDialog.Applied", { name: callingName, actor: actor.name })
            );
            resolve(true);
          }
        },
        cancel: {
          label: game.i18n.localize("TRESPASSER.CallingDialog.Cancel"),
          callback: () => resolve(false)
        }
      },
      default: "apply",
      render: html => {
        // Tab switching
        html.find(".calling-dlg-tab-btn").on("click", ev => {
          const tab = ev.currentTarget.dataset.tab;
          html.find(".calling-dlg-tab-btn").each((_, btn) => {
            const active = btn.dataset.tab === tab;
            btn.style.color            = active ? "var(--trp-gold-bright)" : "var(--trp-text-dim)";
            btn.style.borderBottomColor = active ? "var(--trp-gold)" : "transparent";
          });
          html.find(".calling-dlg-pane").each((_, pane) => {
            pane.style.display = pane.dataset.pane === tab ? "" : "none";
          });
        });

        // Search — filter chip-rows
        html.find(".calling-dlg-search").on("input", ev => {
          const query = ev.currentTarget.value.toLowerCase().trim();
          const tabId = ev.currentTarget.dataset.tab;
          // Skills pane has no chip-row wrapper
          if (tabId === "skills") {
            html.find(`.calling-dlg-pane[data-pane="skills"] .calling-dlg-chip`).each((_, chip) => {
              const name = chip.querySelector(".calling-dlg-name")?.textContent?.toLowerCase() ?? "";
              chip.style.display = name.includes(query) ? "" : "none";
            });
          } else {
            html.find(`.calling-dlg-pane[data-pane="${tabId}"] .calling-dlg-chip-row`).each((_, row) => {
              const name = row.querySelector(".calling-dlg-name")?.textContent?.toLowerCase() ?? "";
              row.style.display = name.includes(query) ? "" : "none";
            });
          }
        });

        // Info icons
        html.find(".dlg-info-btn").on("click", async ev => {
          ev.preventDefault();
          ev.stopPropagation();
          await showItemInfoDialog(ev.currentTarget.dataset.uuid);
        });
      }
    }, {
      classes: ["trespasser", "dialog", "calling-dialog"],
      width: 480,
      height: "auto",
      resizable: true
    });

    dialog.render(true);
  });
}
