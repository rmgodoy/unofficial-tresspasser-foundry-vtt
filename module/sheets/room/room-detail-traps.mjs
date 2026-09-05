/**
 * room-detail-traps.mjs
 * Detail traps handlers for Room item sheets.
 */

/**
 * Adds a new default detail trap.
 * @param {object} sheet
 */
export async function addDetailTrap(sheet) {
  const traps = [...(sheet.document.system.detailTraps ?? [])];
  traps.push({
    featureIndex: 0,
    hiddenValue: 0,
    trigger: "",
    effect: "",
    magical: false,
    disarmed: false
  });
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.detailTraps": traps
  });
}

/**
 * Removes a detail trap at index.
 * @param {object} sheet
 * @param {number} index
 */
export async function removeDetailTrap(sheet, index) {
  if (isNaN(index)) return;
  const traps = [...(sheet.document.system.detailTraps ?? [])];
  traps.splice(index, 1);
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.detailTraps": traps
  });
}

/**
 * Updates a specific field on a detail trap.
 * @param {object} sheet
 * @param {number} index
 * @param {string} field
 * @param {any} rawValue
 */
export async function changeDetailTrapField(sheet, index, field, rawValue) {
  if (isNaN(index)) return;
  const traps = [...(sheet.document.system.detailTraps ?? [])];
  if (!traps[index]) return;
  const value = field === "featureIndex" || field === "hiddenValue"
    ? parseInt(rawValue) || 0
    : rawValue;
  traps[index] = { ...traps[index], [field]: value };
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.detailTraps": traps
  });
}

/**
 * Toggles a boolean flag on a detail trap.
 * @param {object} sheet
 * @param {number} index
 * @param {string} flag
 */
export async function toggleDetailTrapFlag(sheet, index, flag) {
  if (isNaN(index)) return;
  const traps = [...(sheet.document.system.detailTraps ?? [])];
  if (!traps[index]) return;
  traps[index] = { ...traps[index], [flag]: !traps[index][flag] };
  await sheet.document.update({
    ...sheet._getUnsavedEditorsData(),
    "system.detailTraps": traps
  });
}
