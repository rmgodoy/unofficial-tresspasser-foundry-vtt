/**
 * Image Picker Helper for ApplicationV2 Actor & Item Sheets
 */

/**
 * Activates click listeners on image elements within an ApplicationV2 sheet.
 * Supported selectors: [data-edit="img"], [data-edit], [data-action="editImage"]
 * 
 * @param {DocumentSheetV2} sheet The sheet instance
 */
export function activateImagePicker(sheet) {
  if (!sheet?.element) return;

  const targets = sheet.element.querySelectorAll('[data-edit="img"], [data-edit], [data-action="editImage"]');
  if (!targets.length) return;

  const isEditable = sheet.isEditable;
  const tooltipText = game.i18n.localize("TRESPASSER.Sheet.EditImage") || "Change Artwork";

  targets.forEach(target => {
    if (!isEditable) {
      target.style.cursor = "default";
      return;
    }

    target.style.cursor = "pointer";
    if (!target.getAttribute("title")) {
      target.setAttribute("title", tooltipText);
    }

    target.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const attr = target.dataset.edit || "img";
      const current = foundry.utils.getProperty(sheet.document, attr) || sheet.document.img || "";

      const fp = new FilePicker({
        current: current,
        type: "image",
        redirectToRoot: [current],
        callback: path => {
          const doc = sheet.document;
          doc.update({ [attr]: path });
          if (attr === "img" && doc?.isToken && doc.token?.actorLink) {
            const baseActor = doc.token.baseActor || game.actors.get(doc.token.actorId);
            if (baseActor && baseActor.img !== path) {
              baseActor.update({ img: path });
            }
          }
        },
        top: sheet.position.top + 40,
        left: sheet.position.left + 10
      });

      return fp.browse(current);
    });
  });
}
