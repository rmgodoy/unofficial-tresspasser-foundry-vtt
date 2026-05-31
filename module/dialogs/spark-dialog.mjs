/**
 * Spark selection dialog for deed rolls.
 *
 * Rules:
 *   - Spark types: Deed Spark, Impact, Potency, Power
 *   - Deed Spark can only be chosen ONCE across all targets
 *   - Layering: 1st spark applies to ALL hit targets, 2nd to those with 2+, etc.
 *   - Each spark choice can only be picked once per "layer" (per target)
 *
 * @param {Array} results  Per-target results from the roll: { tokenId, tokenName, sparks, ... }
 * @returns {Promise<object|null>}  Spark choices or null if cancelled
 */
export async function askSparkDialog(results) {
  // Filter to only targets with sparks
  const sparkTargets = results
    .filter(r => r.isHit && r.sparks > 0)
    .sort((a, b) => b.sparks - a.sparks);

  if (sparkTargets.length === 0) return null;

  const maxSparks = Math.max(...sparkTargets.map(r => r.sparks));

  const sparkTypes = [
    { key: "deed",    label: game.i18n.localize("TRESPASSER.Dialog.Spark.DeedSpark"),  desc: game.i18n.localize("TRESPASSER.Dialog.Spark.DeedSparkDesc") },
    { key: "impact",  label: game.i18n.localize("TRESPASSER.Dialog.Spark.Impact"),     desc: game.i18n.localize("TRESPASSER.Dialog.Spark.ImpactDesc") },
    { key: "potency", label: game.i18n.localize("TRESPASSER.Dialog.Spark.Potency"),    desc: game.i18n.localize("TRESPASSER.Dialog.Spark.PotencyDesc") },
    { key: "power",   label: game.i18n.localize("TRESPASSER.Dialog.Spark.Power"),      desc: game.i18n.localize("TRESPASSER.Dialog.Spark.PowerDesc") }
  ];

  // Build HTML for each layer
  let html = `<div class="trespasser-dialog spark-dialog" style="max-height:60vh;overflow-y:auto;">`;
  html += `<p>${game.i18n.format("TRESPASSER.Dialog.Spark.Intro", { count: maxSparks })}</p>`;

  for (let layer = 1; layer <= maxSparks; layer++) {
    const eligibleTargets = sparkTargets.filter(t => t.sparks >= layer);
    const targetNames = eligibleTargets.map(t => t.tokenName).join(", ");

    html += `<div class="spark-layer" data-layer="${layer}">`;
    html += `<h4>${game.i18n.format("TRESPASSER.Dialog.Spark.Layer", { n: layer })} <span class="spark-layer-targets">(${targetNames})</span></h4>`;

    for (const st of sparkTypes) {
      // Deed Spark has a global limit of 1 — use radio-like logic via data attribute
      const deedAttr = st.key === "deed" ? ` data-deed-spark="true"` : "";
      html += `<label class="spark-choice" data-layer="${layer}" data-type="${st.key}"${deedAttr}>`;
      html += `<input type="radio" name="spark-layer-${layer}" value="${st.key}" />`;
      html += `<span class="spark-choice-label">${st.label}</span>`;
      html += `<span class="spark-choice-desc">${st.desc}</span>`;
      html += `</label>`;
    }

    html += `</div>`;
  }

  html += `</div>`;

  return foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("TRESPASSER.Dialog.Spark.Title"),
      width: 400,
      resizable: true
    },
    classes: ["trespasser", "dialog", "spark-select"],
    content: html,
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("TRESPASSER.Global.Action.Confirm"),
        icon: "fas fa-sun",
        default: true,
        callback: (event, button, dialog) => {
          return _parseSparkChoices(button.form, sparkTargets, maxSparks);
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
        icon: "fas fa-times",
        callback: () => null
      }
    ],
    render: (event, dialog) => {
      const el = dialog.element;
      // Enforce deed spark uniqueness: only allow one across all layers
      el.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener("change", () => {
          const deedChecked = el.querySelectorAll('input[value="deed"]:checked').length > 0;
          // Disable deed options in other layers when one is selected
          el.querySelectorAll('input[value="deed"]').forEach(deedEl => {
            if (!deedEl.checked) {
              deedEl.disabled = deedChecked;
              deedEl.closest("label")?.classList.toggle("disabled", deedChecked);
            }
          });
        });
      });
    },
    rejectClose: false
  });
}

/**
 * Parse the dialog HTML into structured spark choices.
 */
function _parseSparkChoices(element, sparkTargets, maxSparks) {
  const layerChoices = [];

  for (let layer = 1; layer <= maxSparks; layer++) {
    const checked = element.querySelector(`input[name="spark-layer-${layer}"]:checked`);
    layerChoices.push(checked ? checked.value : null);
  }

  let applyDeedSpark = false;
  let impactBonus = 0;
  let potencyBonus = 0;
  let powerBonusDice = 0;

  // Build per-target map: each target gets the choices from layers 1..N where N=their sparks
  const perTarget = new Map();

  for (const target of sparkTargets) {
    const targetChoices = { deed: false, impact: 0, potency: 0, power: 0 };

    for (let layer = 1; layer <= target.sparks; layer++) {
      const choice = layerChoices[layer - 1];
      if (!choice) continue;

      switch (choice) {
        case "deed":
          targetChoices.deed = true;
          applyDeedSpark = true;
          break;
        case "impact":
          targetChoices.impact += 1;
          impactBonus += 2; // +2 forced movement per impact
          break;
        case "potency":
          targetChoices.potency += 1;
          potencyBonus += 1;
          break;
        case "power":
          targetChoices.power += 1;
          powerBonusDice += 1;
          break;
      }
    }

    perTarget.set(target.tokenId, targetChoices);
  }

  return {
    applyDeedSpark,
    impactBonus,
    potencyBonus,
    powerBonusDice,
    perTarget,
    layerChoices
  };
}
