import { TrespasserPartyHelper } from "../../helpers/party-helper.mjs";

/**
 * Roll a group check for all or selected party members.
 * @param {object} sheet - TrespasserPartySheet instance
 * @param {Event} event
 * @param {HTMLElement} target
 */
export async function runGroupCheck(sheet, event, target) {
  const attribute = sheet.element.querySelector(".group-check-attribute")?.value;
  const skill = sheet.element.querySelector(".group-check-skill")?.value;
  const dc = parseInt(sheet.element.querySelector(".group-check-dc")?.value) || 12;

  if (!attribute) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Dialog.Party.SelectAttribute"));
    return;
  }

  const memberIds = sheet.document.system.members ?? [];
  const allMembers = memberIds
    .map(id => game.actors.get(id))
    .filter(a => a?.type === "character" || a?.type === "commoner");

  if (allMembers.length === 0) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Party.NoMembers"));
    return;
  }

  let members = allMembers;
  const promptSelection = game.settings.get("trespasser", "enableGroupCheckSelection");
  if (promptSelection) {
    const selection = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("TRESPASSER.Dialog.Party.SelectParticipants") },
      classes: ["trespasser", "dialog", "group-participant-select"],
      content: `
        <p>${game.i18n.localize("TRESPASSER.Dialog.Party.SelectParticipantsHint")}</p>
        <div class="participant-selection" style="max-height: 300px; overflow-y: auto; margin-bottom: 10px;">
          ${allMembers.map(m => `
            <div class="form-group" style="display: flex; align-items: center; margin-bottom: 5px; gap: 10px; border-bottom: 1px solid var(--trp-border); padding: 4px;">
              <input type="checkbox" name="participant" value="${m.id}" checked>
              <img src="${m.img}" style="width: 40px !important; height: 40px !important; flex: 0 0 40px !important; object-fit: cover !important; border-radius: 4px; border: 1px solid var(--trp-text-dim);">
              <label style="flex: 1;">${m.name}</label>
            </div>
          `).join('')}
        </div>
      `,
      buttons: [
        {
          action: "run",
          label: game.i18n.localize("TRESPASSER.Global.Action.RunCheck"),
          icon: "fas fa-dice",
          default: true,
          callback: (event, button) => {
            const selectedIds = Array.from(button.form.querySelectorAll('input[name="participant"]:checked')).map(el => el.value);
            return allMembers.filter(m => selectedIds.includes(m.id));
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
          icon: "fas fa-times",
          callback: () => null
        }
      ],
      rejectClose: false
    });

    if (!selection || selection.length === 0) return;
    members = selection;
  }

  // Build the check label
  const attrLabels = {
    mighty: "TRESPASSER.Terms.Attribute.Mighty",
    agility: "TRESPASSER.Terms.Attribute.Agility",
    intellect: "TRESPASSER.Terms.Attribute.Intellect",
    spirit: "TRESPASSER.Terms.Attribute.Spirit"
  };
  const attrLabel = game.i18n.localize(attrLabels[attribute]);
  const skillLabel = skill
    ? game.i18n.localize(`TRESPASSER.Terms.Skill.${skill.charAt(0).toUpperCase() + skill.slice(1)}`)
    : null;
  const checkLabel = skillLabel ? `${attrLabel} | ${skillLabel}` : attrLabel;

  // Create the pending Chat Message
  const messageFlags = {
    trespasser: {
      groupCheck: {
        attribute,
        skill,
        dc,
        checkLabel,
        participants: members.map(m => m.id),
        results: [],
        status: "pending"
      }
    }
  };

  const content = TrespasserPartyHelper.buildGroupCheckPendingHtml(checkLabel, dc, members.map(m => m.id), []);

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ alias: sheet.document.name }),
    flags: messageFlags
  });
}
