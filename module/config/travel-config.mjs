/**
 * Overland Travel Configuration
 *
 * Configures terrain costs, weather modifiers, periods, actions, and camp activities.
 * Intended to be merged into CONFIG.TRESPASSER.travel at system init.
 */
export const TRAVEL_CONFIG = {
  travelPointsPerAdvance: 6,

  terrainCosts: {
    flat:  { cost: 1, label: "TRESPASSER.Terms.Travel.Terrain.Flat",  examples: "TRESPASSER.Terms.Travel.Terrain.FlatExamples" },
    mixed: { cost: 2, label: "TRESPASSER.Terms.Travel.Terrain.Mixed", examples: "TRESPASSER.Terms.Travel.Terrain.MixedExamples" },
    rough: { cost: 3, label: "TRESPASSER.Terms.Travel.Terrain.Rough", examples: "TRESPASSER.Terms.Travel.Terrain.RoughExamples" }
  },

  weatherModifiers: {
    clear:   { extraCost: 0, label: "TRESPASSER.Terms.Travel.Weather.Clear" },
    poor:    { extraCost: 1, label: "TRESPASSER.Terms.Travel.Weather.Poor",    examples: "TRESPASSER.Terms.Travel.Weather.PoorExamples" },
    extreme: { extraCost: 2, label: "TRESPASSER.Terms.Travel.Weather.Extreme", examples: "TRESPASSER.Terms.Travel.Weather.ExtremeExamples" }
  },

  periods: {
    morning: { label: "TRESPASSER.Terms.Travel.Period.Morning", icon: "fa-solid fa-sun" },
    evening: { label: "TRESPASSER.Terms.Travel.Period.Evening", icon: "fa-solid fa-cloud-sun" },
    night:   { label: "TRESPASSER.Terms.Travel.Period.Night",   icon: "fa-solid fa-moon" }
  },

  travelActions: {
    advance:    { label: "TRESPASSER.Terms.Travel.Actions.Advance",    icon: "fa-solid fa-route",      description: "TRESPASSER.Terms.Travel.Actions.AdvanceDesc" },
    camp:       { label: "TRESPASSER.Terms.Travel.Actions.Camp",       icon: "fa-solid fa-campground", description: "TRESPASSER.Terms.Travel.Actions.CampDesc" },
    nightsRest: { label: "TRESPASSER.Terms.Travel.Actions.NightsRest", icon: "fa-solid fa-bed",        description: "TRESPASSER.Terms.Travel.Actions.NightsRestDesc" }
  },

  campActivities: {
    assist:          { label: "TRESPASSER.Terms.Travel.Camp.Assist",          icon: "fa-solid fa-hands-helping",  description: "TRESPASSER.Terms.Travel.Camp.AssistDesc" },
    campAlchemy:     { label: "TRESPASSER.Terms.Travel.Camp.CampAlchemy",     icon: "fa-solid fa-flask",          description: "TRESPASSER.Terms.Travel.Camp.CampAlchemyDesc" },
    cook:            { label: "TRESPASSER.Terms.Travel.Camp.Cook",            icon: "fa-solid fa-utensils",       description: "TRESPASSER.Terms.Travel.Camp.CookDesc" },
    craft:           { label: "TRESPASSER.Terms.Travel.Camp.Craft",           icon: "fa-solid fa-hammer",         description: "TRESPASSER.Terms.Travel.Camp.CraftDesc" },
    forage:          { label: "TRESPASSER.Terms.Travel.Camp.Forage",          icon: "fa-solid fa-leaf",           description: "TRESPASSER.Terms.Travel.Camp.ForageDesc" },
    fish:            { label: "TRESPASSER.Terms.Travel.Camp.Fish",            icon: "fa-solid fa-fish",           description: "TRESPASSER.Terms.Travel.Camp.FishDesc" },
    hunt:            { label: "TRESPASSER.Terms.Travel.Camp.Hunt",            icon: "fa-solid fa-crosshairs",     description: "TRESPASSER.Terms.Travel.Camp.HuntDesc" },
    liftSpirits:     { label: "TRESPASSER.Terms.Travel.Camp.LiftSpirits",     icon: "fa-solid fa-glass-cheers",   description: "TRESPASSER.Terms.Travel.Camp.LiftSpiritsDesc" },
    prepareTorches:  { label: "TRESPASSER.Terms.Travel.Camp.PrepareTorches",  icon: "fa-solid fa-fire",           description: "TRESPASSER.Terms.Travel.Camp.PrepareTorchesDesc" },
    pursue:          { label: "TRESPASSER.Terms.Travel.Camp.Pursue",          icon: "fa-solid fa-bullseye",       description: "TRESPASSER.Terms.Travel.Camp.PursueDesc" },
    restEarly:       { label: "TRESPASSER.Terms.Travel.Camp.RestEarly",       icon: "fa-solid fa-clock",          description: "TRESPASSER.Terms.Travel.Camp.RestEarlyDesc" },
    salvage:         { label: "TRESPASSER.Terms.Travel.Camp.Salvage",         icon: "fa-solid fa-recycle",        description: "TRESPASSER.Terms.Travel.Camp.SalvageDesc" },
    scout:           { label: "TRESPASSER.Terms.Travel.Camp.Scout",           icon: "fa-solid fa-binoculars",     description: "TRESPASSER.Terms.Travel.Camp.ScoutDesc" },
    survey:          { label: "TRESPASSER.Terms.Travel.Camp.Survey",          icon: "fa-solid fa-map",            description: "TRESPASSER.Terms.Travel.Camp.SurveyDesc" }
  }
};
