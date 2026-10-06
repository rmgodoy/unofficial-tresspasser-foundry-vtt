/**
 * Detect eligible spark types for a deed based purely on graph architecture and system data.
 * @param {Item} item
 * @param {object} [context]
 * @param {Actor} [actor]
 * @returns {Array<{ key: string, label: string, desc: string }>}
 */
export function getEligibleSparkTypes(item, context = {}, actor = null) {
  if (!item) {
    return [
      { key: "power", label: game.i18n.localize("TRESPASSER.Dialog.Spark.Power"), desc: game.i18n.localize("TRESPASSER.Dialog.Spark.PowerDesc") }
    ];
  }

  const graph = item.system?.graph || (context.executor?.system?.graph ?? null);
  const nodes = graph?.nodes || [];
  const connections = graph?.connections || [];

  // 1. Detect Deed Spark
  let hasDeedSpark = false;

  // A. Check if any node in graph explicitly has phase === "spark"
  if (nodes.some(n => n.phase === "spark")) {
    hasDeedSpark = true;
  }

  // B. Check direct onSpark flow connections from rollAccuracy or other nodes
  if (!hasDeedSpark) {
    const onSparkConns = connections.filter(c => c.type !== "reference" && c.sourcePort === "onSpark");
    if (onSparkConns.length > 0) {
      hasDeedSpark = true;
    }
  }

  // C. Check switch nodes: onSpark input plugged in
  if (!hasDeedSpark) {
    const switchNodes = nodes.filter(n => n.type === "switch");
    for (const swNode of switchNodes) {
      const swConns = connections.filter(c => c.targetId === swNode.id);
      if (swConns.some(c => c.targetPort === "onSpark")) {
        hasDeedSpark = true;
        break;
      }
    }
  }

  // D. Phase description check
  if (!hasDeedSpark && item.system?.phases?.spark?.description?.trim() && !item.system?.phases?.spark?.skipPhase) {
    hasDeedSpark = true;
  }

  // E. Legacy non-graph fallback (if graph is empty)
  if (!hasDeedSpark && nodes.length === 0) {
    const legacySpark = item.system?.legacyPhases?.spark || item.system?.effects?.spark;
    if (legacySpark?.appliesWeaponEffects || legacySpark?.appliedEffects?.length > 0 || legacySpark?.damage?.trim()) {
      hasDeedSpark = true;
    }
  }

  // 2. Detect Impact (Forced Movement)
  const hasImpact = nodes.some(n => n.type === "forceMoveTargets") ||
    (nodes.length === 0 && Boolean(item.system?.effects?.start?.forcedMovement || item.system?.effects?.hit?.forcedMovement));

  // 3. Detect Potency (States, Recovery, Intensity)
  const hasPotency = nodes.some(n =>
    n.type === "grantRecovery" ||
    n.type === "applyEffects" ||
    n.type === "modifyEffects" ||
    n.type === "spawnTerrain"
  ) || (nodes.length === 0 && Boolean(item.system?.effects?.hit?.appliedEffects?.length > 0 || item.system?.effects?.spark?.appliedEffects?.length > 0));

  // 4. Detect Power (Damage)
  const hasPower = nodes.some(n =>
    (n.type === "applyDamage" && !n.params?.disablePowerSparks) ||
    (n.type === "roll" && (n.params?.usePowerSparks || (n.params?.expression && !n.params?.expression?.includes?.("d20"))))
  ) || (nodes.length === 0 && Boolean(item.system?.effects?.hit?.damage?.trim() || item.system?.effects?.base?.damage?.trim()));

  const types = [];
  if (hasDeedSpark) {
    types.push({
      key: "deed",
      label: game.i18n.localize("TRESPASSER.Dialog.Spark.DeedSpark"),
      desc: game.i18n.localize("TRESPASSER.Dialog.Spark.DeedSparkDesc")
    });
  }
  if (hasImpact) {
    types.push({
      key: "impact",
      label: game.i18n.localize("TRESPASSER.Dialog.Spark.Impact"),
      desc: game.i18n.localize("TRESPASSER.Dialog.Spark.ImpactDesc")
    });
  }
  if (hasPotency) {
    types.push({
      key: "potency",
      label: game.i18n.localize("TRESPASSER.Dialog.Spark.Potency"),
      desc: game.i18n.localize("TRESPASSER.Dialog.Spark.PotencyDesc")
    });
  }
  if (hasPower) {
    types.push({
      key: "power",
      label: game.i18n.localize("TRESPASSER.Dialog.Spark.Power"),
      desc: game.i18n.localize("TRESPASSER.Dialog.Spark.PowerDesc")
    });
  }

  // Fallback to Deed Spark or Potency if none detected
  if (types.length === 0) {
    if (hasDeedSpark) {
      types.push({
        key: "deed",
        label: game.i18n.localize("TRESPASSER.Dialog.Spark.DeedSpark"),
        desc: game.i18n.localize("TRESPASSER.Dialog.Spark.DeedSparkDesc")
      });
    } else {
      types.push({
        key: "potency",
        label: game.i18n.localize("TRESPASSER.Dialog.Spark.Potency"),
        desc: game.i18n.localize("TRESPASSER.Dialog.Spark.PotencyDesc")
      });
    }
  }

  return types;
}

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
 * @param {object} [options]  Options containing { item, context, actor, allowedSparkTypes }
 * @returns {Promise<object|null>}  Spark choices or null if cancelled
 */
export async function askSparkDialog(results, options = {}) {
  // Filter to only targets with sparks
  const sparkTargets = results
    .filter(r => r.isHit && r.sparks > 0)
    .sort((a, b) => b.sparks - a.sparks);

  if (sparkTargets.length === 0) return null;

  const maxSparks = Math.max(...sparkTargets.map(r => r.sparks));
  const { item, context, actor } = options;
  const sparkTypes = options.allowedSparkTypes || getEligibleSparkTypes(item, context, actor);

  // Build HTML for each layer
  let html = `<div class="trespasser-dialog spark-dialog" style="max-height:60vh;overflow-y:auto;">`;
  html += `<p>${game.i18n.format("TRESPASSER.Dialog.Spark.Intro", { count: maxSparks })}</p>`;

  for (let layer = 1; layer <= maxSparks; layer++) {
    const eligibleTargets = sparkTargets.filter(t => t.sparks >= layer);
    const validNames = eligibleTargets.map(t => t.tokenName).filter(Boolean);
    const targetNamesSpan = validNames.length > 0
      ? ` <span class="spark-layer-targets">(${validNames.join(", ")})</span>`
      : "";

    html += `<div class="spark-layer" data-layer="${layer}">`;
    html += `<h4>${game.i18n.format("TRESPASSER.Dialog.Spark.Layer", { n: layer })}${targetNamesSpan}</h4>`;

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
          const root = dialog?.element || button?.form || button?.closest(".application") || button?.closest(".window-app") || document;
          return _parseSparkChoices(root, sparkTargets, maxSparks);
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
  if (!element) return null;
  const layerChoices = [];
  let deedSparkLayer = null;

  for (let layer = 1; layer <= maxSparks; layer++) {
    const checked = element.querySelector(`input[name="spark-layer-${layer}"]:checked`);
    const val = checked ? checked.value : null;
    layerChoices.push(val);
    if (val === "deed") {
      deedSparkLayer = layer;
    }
  }

  let applyDeedSpark = deedSparkLayer !== null;
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
          break;
        case "impact":
          targetChoices.impact += 1;
          impactBonus += 2;
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
    deedSparkLayer,
    impactBonus,
    potencyBonus,
    powerBonusDice,
    perTarget,
    layerChoices
  };
}
