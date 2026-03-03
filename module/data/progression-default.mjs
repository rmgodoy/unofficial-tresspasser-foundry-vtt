/**
 * Default Progression Table for Trespasser TTRPG.
 * 
 * Columns:
 * - level: 0-9
 * - xp: XP required to reach the NEXT level (at level 0, it's '-' in the image, so we'll use 0 or 20 for level 1)
 * - hp: Base HP for this level (formula: (level+1)*5)
 * - skillBonus: Skill bonus added to rolls
 * - skillDie: Die size for skills
 * - attributePoints: Total attribute points available at this level
 * - callingAbilities: Text description of what is granted
 * - deedsLight: Max light deeds
 * - deedsHeavy: Max heavy deeds
 * - deedsMighty: Max mighty deeds
 */
export const DEFAULT_PROGRESSION_TABLE = [
  { level: 0, xp: 20, hp: 5,  skillBonus: 2, skillDie: "d6",  attributePoints: 0,  callingAbilities: "Past Life",          deedsLight: 0, deedsHeavy: 0, deedsMighty: 0 },
  { level: 1, xp: 30, hp: 10, skillBonus: 2, skillDie: "d6",  attributePoints: 2,  callingAbilities: "Calling, 1st Craft", deedsLight: 2, deedsHeavy: 1, deedsMighty: 0 },
  { level: 2, xp: 40, hp: 15, skillBonus: 2, skillDie: "d6",  attributePoints: 3,  callingAbilities: "Talent",             deedsLight: 2, deedsHeavy: 2, deedsMighty: 0 },
  { level: 3, xp: 50, hp: 20, skillBonus: 3, skillDie: "d8",  attributePoints: 4,  callingAbilities: "Enhancement",        deedsLight: 2, deedsHeavy: 2, deedsMighty: 1 },
  { level: 4, xp: 60, hp: 25, skillBonus: 3, skillDie: "d8",  attributePoints: 5,  callingAbilities: "2nd Craft",          deedsLight: 3, deedsHeavy: 3, deedsMighty: 1 },
  { level: 5, xp: 70, hp: 30, skillBonus: 3, skillDie: "d8",  attributePoints: 6,  callingAbilities: "Talent",             deedsLight: 3, deedsHeavy: 3, deedsMighty: 2 },
  { level: 6, xp: 80, hp: 35, skillBonus: 4, skillDie: "d10", attributePoints: 7,  callingAbilities: "Enhancement",        deedsLight: 3, deedsHeavy: 3, deedsMighty: 2 },
  { level: 7, xp: 90, hp: 40, skillBonus: 4, skillDie: "d10", attributePoints: 8,  callingAbilities: "3rd Craft",          deedsLight: 4, deedsHeavy: 4, deedsMighty: 3 },
  { level: 8, xp: 100,hp: 45, skillBonus: 4, skillDie: "d10", attributePoints: 9,  callingAbilities: "Talent",             deedsLight: 4, deedsHeavy: 4, deedsMighty: 3 },
  { level: 9, xp: 0,  hp: 50, skillBonus: 5, skillDie: "d12", attributePoints: 10, callingAbilities: "Enhancement",        deedsLight: 4, deedsHeavy: 4, deedsMighty: 4 },
];
