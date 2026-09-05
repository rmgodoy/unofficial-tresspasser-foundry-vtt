/**
 * Evaluates modifier strings, placeholder substitutions, and dice expressions.
 */

/**
 * Replaces the <Int> placeholder in a string with the provided intensity value.
 * @param {string} modifierString 
 * @param {number} intensity 
 * @returns {string}
 */
export function parseModifier(modifierString, intensity) {
  if (!modifierString) return "0";
  return modifierString.toString().replace(/<Int>/g, intensity.toString());
}

/**
 * Replaces <sd> and <wd> placeholders in a formula, handling multipliers correctly.
 * If <sd> is "2d6", "2<sd>" becomes "4d6".
 * 
 * @param {string} formula The dice formula (e.g., "2<sd> + 5")
 * @param {Actor} actor The actor providing the skill die
 * @param {string} [weaponDie] Optional weapon die override
 * @returns {string} The resolved formula
 */
export function replacePlaceholders(formula, actor, weaponDie = "d4") {
  if (!formula) return "";
  let resolved = formula;
  
  const sd = actor?.system?.skill_die || actor?.system?.damage_die || "d6";
  let wd = weaponDie;
  if (!wd || wd === "d4") {
    if (actor?.system?.weapon_die || actor?.system?.weaponDie || actor?.system?.damage_die) {
      wd = actor.system.weapon_die || actor.system.weaponDie || actor.system.damage_die;
    } else {
      wd = "d4";
    }
  }

  const multiplyDice = (expression, factor) => {
    let fullExpr = /^\d/.test(expression) ? expression : `1${expression}`;
    const match = fullExpr.match(/^(\d+)(d\d+.*)$/i);
    if (!match) return expression;
    const count = parseInt(match[1]) * factor;
    return `${count}${match[2]}`;
  };

  const placeholderRegex = /(\d*)<(sd|wd|sb)>/gi;
  resolved = resolved.replace(placeholderRegex, (match, factorStr, type) => {
    const factor = factorStr === "" ? 1 : parseInt(factorStr);
    const ltype = type.toLowerCase();
    
    if (ltype === "sb") {
      const skillBonus = actor?.system?.skill ?? actor?.system?.skillBonus ?? 0;
      return (skillBonus * factor).toString();
    }

    const diceExpr = (ltype === "sd") ? sd : wd;
    return multiplyDice(diceExpr, factor);
  });

  return resolved;
}

/**
 * Helper for asynchronous string replacement with regex.
 * @param {string} str
 * @param {RegExp} regex
 * @param {Function} replacer
 * @returns {Promise<string>}
 */
export async function asyncStringReplace(str, regex, replacer) {
  const matches = [];
  str.replace(regex, (...args) => {
    matches.push(args);
    return args[0];
  });

  let offset = 0;
  for (const match of matches) {
    const replacement = await replacer(...match);
    const matchIndex = match[match.length - 2];
    const matchString = match[0];
    
    str = str.slice(0, matchIndex + offset) + replacement + str.slice(matchIndex + matchString.length + offset);
    offset += replacement.length - matchString.length;
  }
  return str;
}

/**
 * Evaluates a modifier string, replacing <Int> and rolling any dice formulas.
 * @param {string} modifierString 
 * @param {number} intensity 
 * @param {Object} [options] 
 * @param {Actor} [options.actor] Optional actor for roll data
 * @param {boolean} [options.toMessage] Whether to post the roll to chat
 * @param {string} [options.weaponDie]
 * @param {boolean} [options.returnRoll]
 * @returns {Promise<number|Roll>}
 */
export async function evaluateModifier(modifierString, intensity, { actor = null, toMessage = false, weaponDie = null, returnRoll = false } = {}) {
  let parsed = parseModifier(modifierString, intensity);

  // Resolve <sd> (skill die) and <wd> (weapon die) tokens dynamically
  parsed = replacePlaceholders(parsed, actor, weaponDie);
  
  // 2. Handle max(...) and min(...) functions recursively
  const mathRegex = /(max|min)\(([^()]+)\)/gi;
  while (mathRegex.test(parsed)) {
    parsed = await asyncStringReplace(parsed, mathRegex, async (match, func, args) => {
      const values = args.split(',').map(arg => arg.trim());
      const resolvedValues = await Promise.all(values.map(val => 
        evaluateModifier(val, intensity, { actor, toMessage: false, weaponDie })
      ));
      
      if (func.toLowerCase() === 'max') {
        return Math.max(...resolvedValues).toString();
      } else {
        return Math.min(...resolvedValues).toString();
      }
    });
  }

  // 3. Evaluate the remaining formula
  const isFormula = /[0-9]*d[0-9]+|[\+\-\*\/\(\)]/.test(parsed);
  
  if (!isFormula) {
    return parseFloat(parsed) || 0;
  }

  // It's a formula, roll it
  const roll = new foundry.dice.Roll(parsed, actor?.getRollData() || {});
  await roll.evaluate();
  
  if (toMessage) {
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize("TRESPASSER.Chat.Trigger.Evaluation")
    });
  }
  
  if (returnRoll) return roll;
  return roll.total;
}
