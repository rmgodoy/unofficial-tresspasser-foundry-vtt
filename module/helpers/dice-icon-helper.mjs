/**
 * DiceIconHelper — Utility to replace <sd> (Skill Die) and <wd> (Weapon Damage)
 * placeholders in user-facing text with stylized, scale-adaptive SVG icons.
 */

const DIE_REGEX = /(?:<|&lt;)(sd|wd)(?:>|&gt;)/gi;

/**
 * Replace <sd> and <wd> tokens in an HTML/plain-text string with icon markup.
 * @param {string} str - Raw text or HTML string
 * @returns {string} String with tokens replaced by .trespasser-die-icon spans
 */
export function formatDiceIcons(str) {
  if (typeof str !== "string" || !str) return str ?? "";
  if (!/(?:<|&lt;)(?:sd|wd)(?:>|&gt;)/i.test(str)) return str;

  const skillTitle = game.i18n?.localize("TRESPASSER.Global.Dice.SkillDie") || "Skill Die";
  const weaponTitle = game.i18n?.localize("TRESPASSER.Global.Dice.WeaponDamage") || "Weapon Damage";

  return str.replace(DIE_REGEX, (_match, token) => {
    const isSkill = token.toLowerCase() === "sd";
    const title = isSkill ? skillTitle : weaponTitle;
    const cls = isSkill ? "trespasser-die-icon-sd" : "trespasser-die-icon-wd";
    return `<span class="trespasser-die-icon ${cls}" title="${title}" aria-label="${title}"></span>`;
  });
}

/**
 * Recursively walk text nodes in an HTMLElement and replace <sd> and <wd>
 * tokens in-place without disturbing child elements, listeners, or input values.
 * Ignores INPUT, TEXTAREA, SCRIPT, STYLE, CODE, and contenteditable elements.
 * @param {HTMLElement|Node} root - Root element to process
 */
export function replaceDiceInElement(root) {
  if (!root || !(root instanceof Node)) return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT" || tag === "CODE") {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (/(?:<|&lt;)(?:sd|wd)(?:>|&gt;)/i.test(node.nodeValue)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodesToProcess = [];
  while (walker.nextNode()) {
    nodesToProcess.push(walker.currentNode);
  }

  if (nodesToProcess.length === 0) return;

  const skillTitle = game.i18n?.localize("TRESPASSER.Global.Dice.SkillDie") || "Skill Die";
  const weaponTitle = game.i18n?.localize("TRESPASSER.Global.Dice.WeaponDamage") || "Weapon Damage";

  for (const node of nodesToProcess) {
    const parent = node.parentNode;
    if (!parent) continue;

    const text = node.nodeValue;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    DIE_REGEX.lastIndex = 0;
    while ((match = DIE_REGEX.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      const isSkill = match[1].toLowerCase() === "sd";
      const span = document.createElement("span");
      span.className = `trespasser-die-icon trespasser-die-icon-${isSkill ? "sd" : "wd"}`;
      const title = isSkill ? skillTitle : weaponTitle;
      span.title = title;
      span.setAttribute("aria-label", title);
      fragment.appendChild(span);

      lastIndex = DIE_REGEX.lastIndex;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    parent.replaceChild(fragment, node);
  }
}

/**
 * Register TextEditor custom enrichers for Foundry VTT.
 * Integrates with TextEditor.enrichHTML across journals, descriptions, and notes.
 */
export function registerDiceEnrichers() {
  if (!CONFIG.TextEditor?.enrichers) return;

  CONFIG.TextEditor.enrichers.push(
    {
      pattern: /(?:<|&lt;)sd(?:>|&gt;)/gi,
      enricher: async () => {
        const span = document.createElement("span");
        span.className = "trespasser-die-icon trespasser-die-icon-sd";
        const title = game.i18n?.localize("TRESPASSER.Global.Dice.SkillDie") || "Skill Die";
        span.title = title;
        span.setAttribute("aria-label", title);
        return span;
      }
    },
    {
      pattern: /(?:<|&lt;)wd(?:>|&gt;)/gi,
      enricher: async () => {
        const span = document.createElement("span");
        span.className = "trespasser-die-icon trespasser-die-icon-wd";
        const title = game.i18n?.localize("TRESPASSER.Global.Dice.WeaponDamage") || "Weapon Damage";
        span.title = title;
        span.setAttribute("aria-label", title);
        return span;
      }
    }
  );
}

/**
 * Register Handlebars helpers for template formatting.
 */
export function registerDiceHandlebarsHelpers() {
  Handlebars.registerHelper("formatDice", function (text) {
    if (text === null || text === undefined) return "";
    return new Handlebars.SafeString(formatDiceIcons(String(text)));
  });

  Handlebars.registerHelper("trespasserDice", function (text) {
    if (text === null || text === undefined) return "";
    return new Handlebars.SafeString(formatDiceIcons(String(text)));
  });
}

/**
 * Initialize all dice icon enrichers and helpers.
 */
export function initDiceIcons() {
  registerDiceEnrichers();
  registerDiceHandlebarsHelpers();
}
