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
  
  // Identify which skills are from THIS calling (stored in flags or just logically part of it)
  // For skills, there's no flag on the skill itself easily, so we'll just check if they are in the Calling's list
  // and the actor has the calling.
  const isCorrectCalling = actor.system.calling === callingItem.name;

  const skillRows = ALL_SKILL_KEYS
    .filter(k => callingSkills.has(k))
    .map(k => ({
      key: k,
      label: game.i18n.localize(`TRESPASSER.Sheet.Skills.${k.charAt(0).toUpperCase() + k.slice(1)}`),
      alreadyTrained: !!currentSkills[k],
      isFromThisCalling: isCorrectCalling && !!currentSkills[k]
    }));

  // ── Shared helpers ────────────────────────────────────────────
  const noItems = () =>
    `<div class="calling-dlg-empty">${game.i18n.localize("TRESPASSER.CallingDialog.NoItems")}</div>`;

  const infoBtn = uuid =>
    `<a class="dlg-info-btn" data-uuid="${uuid}" title="${game.i18n.localize("TRESPASSER.Dialog.ViewItem")}"
        style="flex-shrink:0;color:var(--trp-text-dim);font-size:var(--fs-12);cursor:pointer;padding:2px 4px;">
       <i class="fas fa-info-circle"></i>
     </a>`;

  const chipHTML = (list, listId) => {
    if (!list || list.length === 0) return noItems();
    return list.map((entry, i) => {
      const isPicked = actor.items.some(it => 
        (it.name === entry.name || it.flags.trespasser?.linkedSourceUuid === entry.uuid) && 
        it.flags.trespasser?.linkedSource === callingItem.name
      );

      return `
      <div class="calling-dlg-chip-row">
        <label class="calling-dlg-chip" data-list="${listId}" data-index="${i}" style="flex:1;margin:0;">
          <input type="checkbox" class="calling-dlg-check" data-list="${listId}" data-index="${i}" ${isPicked ? "checked" : ""} />
          <img src="${entry.img}" width="20" height="20" />
          <span class="calling-dlg-name">${entry.name}</span>
        </label>
        ${entry.uuid ? infoBtn(entry.uuid) : ""}
      </div>`;
    }).join("");
  };

  const skillChipHTML = skillRows.length === 0 ? noItems()
    : skillRows.map((row, i) => `
        <label class="calling-dlg-chip ${row.alreadyTrained && !row.isFromThisCalling ? "already-trained" : ""}" data-list="skills" data-index="${i}">
          <input type="checkbox" class="calling-dlg-check" data-list="skills" data-index="${i}" ${row.isFromThisCalling ? "checked" : ""} />
          <span class="calling-dlg-name">${row.label}${row.alreadyTrained && !row.isFromThisCalling ? " <em>" + game.i18n.localize("TRESPASSER.CallingDialog.AlreadyTrained") + "</em>" : ""}</span>
        </label>`).join("");

  const descHTML = sys.description
    ? `<div class="calling-dlg-desc">${sys.description}</div>` : "";

  const searchBar = tabId =>
    `<input type="text" class="calling-dlg-search" data-tab="${tabId}" placeholder="${game.i18n.localize("TRESPASSER.CallingDialog.SearchPlaceholder")}" />`;

  const tabBtn = (id, label, first = false) =>
    `<a class="calling-dlg-tab-btn item${first ? " active" : ""}" data-tab="${id}"
        style="font-family:var(--trp-font-header);font-size:var(--fs-11);text-transform:uppercase;
               letter-spacing:.08em;padding:5px 4px;cursor:pointer;
               flex: 1; text-align: center;
               color:${first ? "var(--trp-gold-bright)" : "var(--trp-text-dim)"};
               border-bottom:2px solid ${first ? "var(--trp-gold)" : "transparent"};">${label}</a>`;

  const progTableHTML = `
          <div class="progression-list">
            ${(sys.progression || []).map((row, i) => `
              <div class="progression-level ${i > 0 ? 'collapsed' : ''}" data-level="${i}">
                <div class="level-header">
                  <span class="level-title">${game.i18n.localize("TRESPASSER.Sheet.Header.Level")} ${row.level}</span>
                  <i class="fas fa-chevron-down level-toggle"></i>
                </div>
                <div class="level-content">
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Header.XP")}:</label> <span>${row.xp}</span></div>
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Header.HP")} Base:</label> <span>${row.hp}</span></div>
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Header.Skill")} Bonus:</label> <span>${row.skillBonus}</span></div>
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Header.SkillDie")}:</label> <span>${row.skillDie}</span></div>
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Header.AttributeBonus")}:</label> <span>${row.attributePoints}</span></div>
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Combat.DEEDSLIGHT")}:</label> <span>${row.deedsLight}</span></div>
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Combat.DEEDSHEAVY")}:</label> <span>${row.deedsHeavy}</span></div>
                  <div class="prog-field"><label>${game.i18n.localize("TRESPASSER.Sheet.Combat.DEEDSMIGHTY")}:</label> <span>${row.deedsMighty}</span></div>
                  <div class="prog-field full-width">
                    <label>${game.i18n.localize("TRESPASSER.Calling.GrantDescription")}:</label>
                    <div style="font-size:var(--fs-11); color:var(--trp-text-bright); margin-top:4px;">${row.callingAbilities || "—"}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>`;

  const tabSkills       = tabBtn("skills", game.i18n.localize("TRESPASSER.Calling.Skills"), true);
  const tabTalents      = tabBtn("talents", game.i18n.localize("TRESPASSER.Calling.Talents"));
  const tabFeatures     = tabBtn("features", game.i18n.localize("TRESPASSER.Calling.Features"));
  const tabEnhancements = tabBtn("enhancements", game.i18n.localize("TRESPASSER.Calling.Enhancements"));
  const tabProgression  = tabBtn("progression", game.i18n.localize("TRESPASSER.Calling.Progression"));

  const content = `
    <div class="trespasser calling-dialog" style="font-family:var(--trp-font-body);color:var(--trp-text);background:var(--trp-bg-dark);">
      <div class="calling-dlg-header" style="border-bottom:2px solid var(--trp-gold-dim);padding-bottom:8px;margin-bottom:10px;">
        <h2 style="font-family:var(--trp-font-header);color:var(--trp-gold-bright);margin:0 0 4px;">${callingItem.name}</h2>
        ${descHTML}
      </div>
      <nav class="calling-dlg-tabs sheet-tabs" style="display:flex;border-bottom:2px solid var(--trp-border);margin-bottom:8px;">
        ${tabSkills}
        ${tabTalents}
        ${tabFeatures}
        ${tabEnhancements}
        ${tabProgression}
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
        <div class="calling-dlg-pane" data-pane="progression" style="display:none; overflow-y:auto; max-height:270px;">
          ${progTableHTML}
        </div>
      </div>
    </div>
    <style>
      .calling-dialog .calling-dlg-desc{font-size:var(--fs-13);color:var(--trp-text-dim);font-style:italic;margin-top:4px;}
      .calling-dialog .calling-dlg-search{width:100%;box-sizing:border-box;margin-bottom:8px;padding:4px 8px;background:var(--trp-bg-input);border:1px solid var(--trp-border);color:var(--trp-text-bright);font-family:var(--trp-font-body);font-size:var(--fs-13);border-radius:3px;}
      .calling-dialog .calling-dlg-list{display:flex;flex-direction:column;gap:3px;overflow-y:auto;max-height:270px;padding-right:2px;}
      .calling-dialog .calling-dlg-chip-row{display:flex;align-items:center;gap:4px;}
      .calling-dialog .calling-dlg-chip{display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--trp-bg-overlay);border:1px solid var(--trp-border);border-radius:4px;cursor:pointer;transition:background 0.1s;}
      .calling-dialog .calling-dlg-chip:hover{background:var(--trp-gold-overlay);border-color:var(--trp-gold-dim);}
      .calling-dialog .calling-dlg-chip img{border:none;border-radius:50%;flex-shrink:0;}
      .calling-dialog .calling-dlg-name{font-size:var(--fs-13);color:var(--trp-text-bright);flex:1;}
      .calling-dialog .calling-dlg-chip.already-trained .calling-dlg-name{color:var(--trp-text-dim);}
      .calling-dialog .calling-dlg-empty{color:var(--trp-text-dim);font-style:italic;padding:12px 0;text-align:center;}
      .calling-dialog input[type="checkbox"]{flex-shrink:0;accent-color:var(--trp-gold);}
      .calling-dialog .dlg-info-btn{flex-shrink:0;color:var(--trp-text-dim);font-size:var(--fs-12);cursor:pointer;padding:2px 4px;}
      .calling-dialog .dlg-info-btn:hover{color:var(--trp-gold-bright);}
      
      /* Progression Collapsible */
      .calling-dialog .progression-level { border: 1px solid var(--trp-border); border-radius: 4px; margin-bottom: 8px; background: var(--trp-bg-overlay); overflow: hidden; }
      .calling-dialog .level-header { background: var(--trp-bg-overlay); padding: 8px 12px; display: flex; align-items: center; cursor: pointer; user-select: none; transition: background 0.2s; }
      .calling-dialog .level-header:hover { background: var(--trp-shadow-dark); }
      .calling-dialog .level-title { font-family: var(--trp-font-header); font-size: var(--fs-14); color: var(--trp-gold-bright); flex: 1; }
      .calling-dialog .level-toggle { font-size: var(--fs-12); color: var(--trp-text-dim); transition: transform 0.2s; }
      .calling-dialog .progression-level.collapsed .level-toggle { transform: rotate(-90deg); }
      .calling-dialog .progression-level.collapsed .level-content { display: none !important; }
      .calling-dialog .level-content { padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
      .calling-dialog .prog-field { display: flex; align-items: center; justify-content: flex-end; gap: 12px; font-size: var(--fs-12); }
      .calling-dialog .prog-field label { color: var(--trp-text-dim); flex: 1; text-transform: uppercase; letter-spacing: 0.05em; font-size: var(--fs-10); }
      .calling-dialog .prog-field span { font-weight: bold; color: var(--trp-gold-bright); width: 40px; text-align: center; background: var(--trp-bg-overlay); border: 1px solid var(--trp-border); border-radius: 3px; padding: 2px 0; }
      .calling-dialog .prog-field.full-width { grid-column: span 2; flex-direction: column; align-items: flex-start; }
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
            const callingName = callingItem.name;
            
            // 1. Manage Calling Item on Actor
            let actorCalling = actor.items.find(i => i.type === "calling");
            if (!actorCalling) {
              const callingData = callingItem.toObject();
              delete callingData._id;
              const created = await actor.createEmbeddedDocuments("Item", [callingData]);
              actorCalling = created[0];
            } else if (actorCalling.name !== callingName) {
              // Replace calling item if name differs (swapping callings)
              await actorCalling.delete();
              const callingData = callingItem.toObject();
              delete callingData._id;
              const created = await actor.createEmbeddedDocuments("Item", [callingData]);
              actorCalling = created[0];
            }

            // 2. Identify selected Skill keys
            const selectedSkillKeys = new Set();
            html.find(".calling-dlg-check[data-list='skills']:checked").each((_, el) => {
              const row = skillRows[parseInt(el.dataset.index)];
              if (row) selectedSkillKeys.add(row.key);
            });

            // Identify which skills were from THIS calling to potentially un-train them if unchecked
            const oldSkillUpdates = {};
            skillRows.forEach(row => {
              if (row.isFromThisCalling && !selectedSkillKeys.has(row.key)) {
                oldSkillUpdates[`system.skills.${row.key}`] = false;
              }
            });

            const newSkillUpdates = {};
            selectedSkillKeys.forEach(key => {
              newSkillUpdates[`system.skills.${key}`] = true;
            });

            await actor.update({ ...oldSkillUpdates, ...newSkillUpdates, "system.calling": callingName });

            // 3. Talents / Features / Enhancements Picks
            const picks = [];
            for (const listKey of ["talents", "features", "enhancements"]) {
              html.find(`.calling-dlg-check[data-list='${listKey}']:checked`).each((_, el) => {
                const entry = sys[listKey]?.[parseInt(el.dataset.index)];
                if (entry) picks.push(entry);
              });
            }

            // Find current actor items linked to this calling
            const linkedItems = actor.items.filter(it => it.flags.trespasser?.linkedSource === callingName);
            
            // Items to delete (unchecked)
            const toDelete = linkedItems.filter(li => !picks.some(p => p.name === li.name || p.uuid === li.flags.trespasser?.linkedSourceUuid)).map(li => li.id);
            if (toDelete.length > 0) await actor.deleteEmbeddedDocuments("Item", toDelete);

            // Items to create (newly checked)
            const toCreateData = [];
            for (const entry of picks) {
              const alreadyHas = linkedItems.some(li => li.name === entry.name || li.flags.trespasser?.linkedSourceUuid === entry.uuid);
              if (alreadyHas) continue;

              const sourceItem = await fromUuid(entry.uuid);
              if (!sourceItem) continue;
              
              const itemData = sourceItem.toObject();
              delete itemData._id;
              foundry.utils.setProperty(itemData, "flags.trespasser.linkedSource", callingName);
              foundry.utils.setProperty(itemData, "flags.trespasser.linkedSourceUuid", entry.uuid);
              toCreateData.push(itemData);
            }

            if (toCreateData.length > 0) {
              await actor.createEmbeddedDocuments("Item", toCreateData);
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

        // Progression Level Toggle
        html.find(".level-header").on("click", ev => {
          ev.preventDefault();
          const levelRow = ev.currentTarget.closest(".progression-level");
          levelRow.classList.toggle("collapsed");
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
