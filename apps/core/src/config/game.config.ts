export const PlantPhase = {
  UNKNOWN: 0,
  SEED: 1,
  GERMINATION: 2,
  SMALL_LEAVES: 3,
  LARGE_LEAVES: 4,
  BLOOMING: 5,
  MATURE: 6,
  DEAD: 7
} as const

export const PHASE_NAMES = ['未知', '种子', '发芽', '小叶', '大叶', '开花', '成熟', '枯死']
