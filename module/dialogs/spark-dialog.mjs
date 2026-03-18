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
    { key: "deed",    label: game.i18n.localize("TRESPASSER.Spark.DeedSpark"),  desc: game.i18n.localize("TRESPASSER.Spark.DeedSparkDesc") },
    { key: "impact",  label: game.i18n.localize("TRESPASSER.Spark.Impact"),     desc: game.i18n.localize("TRESPASSER.Spark.ImpactDesc") },
    { key: "potency", label: game.i18n.localize("TRESPASSER.Spark.Potency"),    desc: game.i18n.localize("TRESPASSER.Spark.PotencyDesc") },
    { key: "power",   label: game.i18n.localize("TRESPASSER.Spark.Power"),      desc: game.i18n.localize("TRESPASSER.Spark.PowerDesc") }
  ];

  // Build HTML for each layer
  let html = `<div class="trespasser-dialog spark-dialog">`;
  html += `<p>${game.i18n.format("TRESPASSER.Spark.DialogIntro", { count: maxSparks })}</p>`;

  for (let layer = 1; layer <= maxSparks; layer++) {
    const eligibleTargets = sparkTargets.filter(t => t.sparks >= layer);
    const targetNames = eligibleTargets.map(t => t.tokenName).join(", ");

    html += `<div class="spark-layer" data-layer="${layer}">`;
    html += `<h4>${game.i18n.format("TRESPASSER.Spark.Layer", { n: layer })} <span class="spark-layer-targets">(${targetNames})</span></h4>`;

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

  return new Promise((resolve) => {
    new Dialog({
      title: game.i18n.localize("TRESPASSER.Spark.DialogTitle"),
      content: html,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-sun"></i>',
          label: game.i18n.localize("TRESPASSER.Spark.Confirm"),
          callback: (dialogHtml) => {
            const choices = _parseSparkChoices(dialogHtml, sparkTargets, maxSparks);
            resolve(choices);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("TRESPASSER.General.Cancel"),
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      render: (dialogHtml) => {
        // Enforce deed spark uniqueness: only allow one across all layers
        dialogHtml.find('input[type="radio"]').on("change", () => {
          const deedChecked = dialogHtml.find('input[value="deed"]:checked').length > 0;
          // Disable deed options in other layers when one is selected
          dialogHtml.find('input[value="deed"]').each((i, el) => {
            if (!el.checked) {
              el.disabled = deedChecked;
              el.closest("label")?.classList.toggle("disabled", deedChecked);
            }
          });
        });
      }
    }, {
      classes: ["trespasser", "dialog", "spark-select"],
      width: 400
    }).render(true);
  });
}

/**
 * Parse the dialog HTML into structured spark choices.
 */
function _parseSparkChoices(dialogHtml, sparkTargets, maxSparks) {
  const layerChoices = [];

  for (let layer = 1; layer <= maxSparks; layer++) {
    const checked = dialogHtml.find(`input[name="spark-layer-${layer}"]:checked`);
    layerChoices.push(checked.length > 0 ? checked.val() : null);
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
