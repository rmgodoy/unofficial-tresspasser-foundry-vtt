import { matchesDisposition } from "./targeting-geometry.mjs";

/**
 * TargetClassifier — Evaluates tokens during interactive targeting or AoE placement.
 * Determines semantic role (Enemy, Friendly Fire, Ally, Self, etc.), PIXI color codes,
 * and localized labels.
 */
export class TargetClassifier {
  static ROLES = {
    HOSTILE_TARGET: "hostile_target",
    FRIENDLY_FIRE:  "friendly_fire",
    ALLY_BENEFICIAL: "ally_beneficial",
    ENEMY_BENEFICIAL: "enemy_beneficial",
    SELF:           "self",
    NEUTRAL:        "neutral",
    UNAFFECTED:     "unaffected"
  };

  /** Generic uniform target overlay style used when preview outcome details are disabled */
  static GENERIC_TARGET_STYLE = {
    color: 0xFF3333,
    cssVar: "var(--trp-red, #ff5252)",
    labelKey: "TRESPASSER.HUD.Target.GenericTarget",
    defaultLabel: "Target",
    icon: "fa-solid fa-crosshairs",
    fillAlpha: 0.10,
    lineWidth: 3.5,
    lineAlpha: 1.0,
    dashed: false
  };

  static ROLE_STYLES = {
    [TargetClassifier.ROLES.HOSTILE_TARGET]: {
      color: 0xFF4444,
      cssVar: "var(--trp-red, #ff5252)",
      labelKey: "TRESPASSER.HUD.Target.EnemyTarget",
      defaultLabel: "Enemy Target",
      icon: "fa-solid fa-skull",
      fillAlpha: 0.25,
      lineWidth: 2,
      lineAlpha: 0.95
    },
    [TargetClassifier.ROLES.FRIENDLY_FIRE]: {
      color: 0xFF8800,
      cssVar: "#ff8800",
      labelKey: "TRESPASSER.HUD.Target.FriendlyFire",
      defaultLabel: "Friendly Fire!",
      icon: "fa-solid fa-triangle-exclamation",
      fillAlpha: 0.35,
      lineWidth: 3,
      lineAlpha: 1.0,
      dashed: true
    },
    [TargetClassifier.ROLES.ALLY_BENEFICIAL]: {
      color: 0x4ADE80,
      cssVar: "var(--trp-green-bright, #4a8a4a)",
      labelKey: "TRESPASSER.HUD.Target.AllyTarget",
      defaultLabel: "Ally",
      icon: "fa-solid fa-heart",
      fillAlpha: 0.25,
      lineWidth: 2,
      lineAlpha: 0.95
    },
    [TargetClassifier.ROLES.ENEMY_BENEFICIAL]: {
      color: 0x9575CD,
      cssVar: "var(--trp-purple, #9575cd)",
      labelKey: "TRESPASSER.HUD.Target.EnemyBeneficial",
      defaultLabel: "Enemy (Benefiting)",
      icon: "fa-solid fa-triangle-exclamation",
      fillAlpha: 0.25,
      lineWidth: 2,
      lineAlpha: 0.90
    },
    [TargetClassifier.ROLES.SELF]: {
      color: 0x4FC3F7,
      cssVar: "var(--trp-spark, #4fc3f7)",
      labelKey: "TRESPASSER.HUD.Target.Self",
      defaultLabel: "Self",
      icon: "fa-solid fa-user",
      fillAlpha: 0.25,
      lineWidth: 2,
      lineAlpha: 0.90
    },
    [TargetClassifier.ROLES.NEUTRAL]: {
      color: 0xFFD700,
      cssVar: "var(--trp-gold, #c9a84c)",
      labelKey: "TRESPASSER.HUD.Target.Neutral",
      defaultLabel: "Neutral",
      icon: "fa-solid fa-shield",
      fillAlpha: 0.20,
      lineWidth: 2,
      lineAlpha: 0.85
    },
    [TargetClassifier.ROLES.UNAFFECTED]: {
      color: 0x888888,
      cssVar: "var(--trp-text-dim, #a09070)",
      labelKey: "TRESPASSER.HUD.Target.Unaffected",
      defaultLabel: "Unaffected",
      icon: "fa-solid fa-ban",
      fillAlpha: 0.08,
      lineWidth: 1,
      lineAlpha: 0.40
    }
  };

  /**
   * Classify a token relative to the caster and the specific intent of a deed branch.
   * @param {Token|TokenDocument} targetToken - The token being evaluated
   * @param {Token|TokenDocument} casterToken - The caster token
   * @param {object} [options]
   * @param {"harmful"|"beneficial"|"neutral"} [options.intent="harmful"] - Deed branch intent
   * @param {string} [options.filterDisposition="any"] - Required disposition filter (if any)
   * @param {boolean} [options.ignoreSelf=false] - Whether self is bypassed
   * @returns {{ role: string, style: object, label: string }}
   */
  static classifyToken(targetToken, casterToken, options = {}) {
    const {
      intent = "harmful",
      filterDisposition = "any",
      ignoreSelf = false
    } = options;

    if (!targetToken) {
      const style = this.ROLE_STYLES[this.ROLES.UNAFFECTED];
      return { role: this.ROLES.UNAFFECTED, style, label: style.defaultLabel };
    }

    const targetId = targetToken?.id || targetToken?.document?.id || null;
    const casterId = casterToken?.id || casterToken?.document?.id || null;
    const isSelf = Boolean(targetId && casterId && targetId === casterId);

    // 1. Check self bypass
    if (isSelf) {
      if (ignoreSelf) {
        const style = this.ROLE_STYLES[this.ROLES.UNAFFECTED];
        return { role: this.ROLES.UNAFFECTED, style, label: this._localize(style) };
      }
      const style = this.ROLE_STYLES[this.ROLES.SELF];
      return { role: this.ROLES.SELF, style, label: this._localize(style) };
    }

    // 2. Check disposition filter
    if (filterDisposition && filterDisposition !== "any") {
      const matches = matchesDisposition(targetToken, filterDisposition, casterToken);
      if (!matches) {
        const style = this.ROLE_STYLES[this.ROLES.UNAFFECTED];
        return { role: this.ROLES.UNAFFECTED, style, label: this._localize(style) };
      }
    }

    // 3. Determine alignment relative to caster
    const isEnemy = matchesDisposition(targetToken, "enemy", casterToken);
    const isAlly = matchesDisposition(targetToken, "ally", casterToken);

    let role = this.ROLES.NEUTRAL;

    if (intent === "harmful") {
      if (isEnemy) role = this.ROLES.HOSTILE_TARGET;
      else if (isAlly) role = this.ROLES.FRIENDLY_FIRE;
      else role = this.ROLES.NEUTRAL;
    } else if (intent === "beneficial") {
      if (isAlly) role = this.ROLES.ALLY_BENEFICIAL;
      else if (isEnemy) role = this.ROLES.ENEMY_BENEFICIAL;
      else role = this.ROLES.NEUTRAL;
    } else {
      if (isEnemy) role = this.ROLES.HOSTILE_TARGET;
      else if (isAlly) role = this.ROLES.ALLY_BENEFICIAL;
      else role = this.ROLES.NEUTRAL;
    }

    const style = this.ROLE_STYLES[role] || this.ROLE_STYLES[this.ROLES.NEUTRAL];
    return { role, style, label: this._localize(style) };
  }

  static _localize(style) {
    if (style.labelKey && game.i18n?.has(style.labelKey)) {
      return game.i18n.localize(style.labelKey);
    }
    return style.defaultLabel;
  }
}
