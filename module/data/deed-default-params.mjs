/**
 * Default parameters for all deed behavior node types.
 */
export const DEFAULT_PARAMS = {
  selectTarget: {
    targetMode: "creatures",
    disposition: "any",
    targetCount: 1,
    aoeType: "blast",
    aoeSize: 1,
    areaRelation: "inside",
    ignoreSelf: false,
    chooseCreatures: false
  },
  selectArea: {
    targetMode: "squares",
    targetCount: 1,
    aoeType: "blast",
    aoeSize: 1
  },
  roll: {
    expression: "",
    rollBehaviorId: "",
    usePowerSparks: false
  },
  rollAccuracy: {
    actionType: "attack",
    abilityType: "innate",
    versus: "Guard",
    branchingMode: "hitThenSpark",
    allyOverride: {
      enabled: false,
      actionType: "support",
      versus: "10"
    }
  },
  applyDamage: {
    expression: "",
    rollBehaviorId: "",
    distribute: false
  },
  healTarget: { expression: "", rollBehaviorId: "", distribute: false },
  grantRecovery: { intensity: 1 },
  applyEffects: {
    effects: [],
    appliesWeaponEffects: false
  },
  modifyEffects: {
    operation: "invert",
    effectFilter: "hasOpposite",
    specificStateId: "",
    choiceMode: "choose_count",
    choiceCount: 1,
    intensityDelta: 1,
    referencedNodeId: "",
    targetScope: "targets"
  },
  transferState: {
    transferMode: "targetToSelf",
    effectFilter: "all",
    specificStateId: "",
    choiceMode: "choose_count",
    choiceCount: 1,
    intensityMode: "full",
    intensityDelta: 1,
    keepOnSource: false,
    invertOnTransfer: false,
    referencedNodeId: ""
  },
  spawnTerrain: {
    terrainUuid: "",
    terrainName: "",
    terrainImg: "",
    intensity: null,
    placement: "on_target",
    ignoreSourceSquare: false
  },
  moveTerrain: {
    terrainBehaviorId: ""
  },
  moveSource: {
    destinationMode: "distance",
    movementType: "walk",
    distance: 1
  },
  forceMoveTargets: {
    type: "push",
    distance: 1
  },
  swapPositions: {
    swapMode: "selfWithTarget",
    movementType: "teleport"
  },
  clearTargets: {},
  executeDeed: {
    deedUuid: "",
    deedName: "",
    deedImg: ""
  }
};
