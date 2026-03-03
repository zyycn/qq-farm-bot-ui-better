import type { GameConfigService } from '../game-config.service'

function parseGrowTime(growPhases: string): number {
  if (!growPhases)
    return 0
  return growPhases.split(';').filter(Boolean).reduce((total, phase) => {
    const match = phase.match(/:(\d+)$/)
    return total + (match ? Number.parseInt(match[1]) : 0)
  }, 0)
}

function parseNormalFertilizerReduceSec(growPhases: string): number {
  if (!growPhases)
    return 0
  const phases = growPhases.split(';').filter(Boolean)
  if (!phases.length)
    return 0
  const match = phases[0].match(/:(\d+)$/)
  return match ? Number.parseInt(match[1]) : 0
}

function formatTime(seconds: number): string {
  if (seconds < 60)
    return `${seconds}秒`
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
}

export class AnalyticsWorker {
  constructor(private gameConfig: GameConfigService) {}

  getPlantRankings(sortBy = 'exp') {
    const plants = this.gameConfig.getAllPlants()
    const normalPlants = plants.filter(p => p.seed_id > 0 && p.grow_phases)
    const results: any[] = []

    for (const plant of normalPlants) {
      const baseGrowTime = parseGrowTime(plant.grow_phases)
      if (baseGrowTime <= 0)
        continue
      const seasons = Number((plant as any).seasons) || 1
      const isTwoSeason = seasons === 2
      const growTime = isTwoSeason ? baseGrowTime * 1.5 : baseGrowTime
      const harvestExpBase = Number(plant.exp) || 0
      const harvestExp = isTwoSeason ? harvestExpBase * 2 : harvestExpBase
      const expPerHour = (harvestExp / growTime) * 3600
      const reduceSecBase = parseNormalFertilizerReduceSec(plant.grow_phases)
      const reduceSecApplied = isTwoSeason ? reduceSecBase * 2 : reduceSecBase
      const fertilizedGrowTime = Math.max(1, growTime - reduceSecApplied)
      const normalFertilizerExpPerHour = (harvestExp / fertilizedGrowTime) * 3600
      const fruitId = Number(plant.fruit?.id) || 0
      const fruitCount = Number((plant.fruit as any)?.count) || 0
      const fruitPrice = this.gameConfig.getFruitPrice(fruitId)
      const seedPrice = this.gameConfig.getSeedPrice(plant.seed_id)
      const income = (fruitCount * fruitPrice) * (isTwoSeason ? 2 : 1)
      const netProfit = income - seedPrice
      const goldPerHour = (income / growTime) * 3600
      const profitPerHour = (netProfit / growTime) * 3600
      const normalFertilizerProfitPerHour = (netProfit / fertilizedGrowTime) * 3600
      const cfgLevel = Number(plant.land_level_need)

      results.push({
        id: plant.id,
        seedId: plant.seed_id,
        name: plant.name,
        seasons,
        level: (Number.isFinite(cfgLevel) && cfgLevel > 0) ? cfgLevel : null,
        growTime,
        growTimeStr: formatTime(growTime),
        reduceSec: reduceSecBase,
        reduceSecApplied,
        expPerHour: +expPerHour.toFixed(2),
        normalFertilizerExpPerHour: +normalFertilizerExpPerHour.toFixed(2),
        goldPerHour: +goldPerHour.toFixed(2),
        profitPerHour: +profitPerHour.toFixed(2),
        normalFertilizerProfitPerHour: +normalFertilizerProfitPerHour.toFixed(2),
        income,
        netProfit,
        fruitId,
        fruitCount,
        fruitPrice,
        seedPrice,
        image: this.gameConfig.getItemImageById(plant.seed_id)
      })
    }

    const sortMap: Record<string, (a: any, b: any) => number> = {
      exp: (a, b) => b.expPerHour - a.expPerHour,
      fert: (a, b) => b.normalFertilizerExpPerHour - a.normalFertilizerExpPerHour,
      gold: (a, b) => b.goldPerHour - a.goldPerHour,
      profit: (a, b) => b.profitPerHour - a.profitPerHour,
      fert_profit: (a, b) => b.normalFertilizerProfitPerHour - a.normalFertilizerProfitPerHour,
      level: (a, b) => (b.level ?? -1) - (a.level ?? -1)
    }
    if (sortMap[sortBy])
      results.sort(sortMap[sortBy])
    return results
  }
}
