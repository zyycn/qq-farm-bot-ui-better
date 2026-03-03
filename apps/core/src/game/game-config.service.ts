import type { OnModuleInit } from '@nestjs/common'
import fs from 'node:fs'
import path from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import { ASSETS_DIR, CORE_ROOT, DIST_ROOT } from '../config/paths'

export interface PlantInfo {
  id: number
  name: string
  seed_id: number
  fruit: { id: number, name?: string }
  exp: number
  grow_phases: string
  land_level_need?: number
  [key: string]: any
}

export interface ItemInfo {
  id: number
  name: string
  type: number
  price: number
  asset_name?: string
  [key: string]: any
}

export interface RoleLevelInfo {
  level: number
  exp: number
}

@Injectable()
export class GameConfigService implements OnModuleInit {
  private readonly logger = new Logger(GameConfigService.name)

  private roleLevelConfig: RoleLevelInfo[] = []
  private levelExpTable: number[] = []

  private plantConfig: PlantInfo[] = []
  private plantMap = new Map<number, PlantInfo>()
  private seedToPlant = new Map<number, PlantInfo>()
  private fruitToPlant = new Map<number, PlantInfo>()

  private itemInfoConfig: ItemInfo[] = []
  private itemInfoMap = new Map<number, ItemInfo>()
  private seedItemMap = new Map<number, ItemInfo>()
  private seedImageMap = new Map<number, string>()
  private seedAssetImageMap = new Map<string, string>()

  onModuleInit() {
    this.loadConfigs()
  }

  private resolveConfigDir(): string {
    const candidates = [
      path.join(ASSETS_DIR, 'gameConfig'),
      path.join(DIST_ROOT, 'assets', 'gameConfig'),
      path.join(CORE_ROOT, 'src', 'assets', 'gameConfig')
    ]
    return candidates.find(p => fs.existsSync(p)) || candidates[0]
  }

  getConfigDir(): string {
    return this.resolveConfigDir()
  }

  loadConfigs() {
    const configDir = this.resolveConfigDir()
    this.loadRoleLevels(configDir)
    this.loadPlants(configDir)
    this.loadItems(configDir)
    this.loadSeedImages(configDir)
  }

  private loadRoleLevels(configDir: string) {
    try {
      const p = path.join(configDir, 'RoleLevel.json')
      if (!fs.existsSync(p))
        return
      this.roleLevelConfig = JSON.parse(fs.readFileSync(p, 'utf8'))
      this.levelExpTable = []
      for (const item of this.roleLevelConfig)
        this.levelExpTable[item.level] = item.exp
      this.logger.log(`已加载等级经验表 (${this.roleLevelConfig.length} 级)`)
    } catch (e: any) {
      this.logger.warn(`加载 RoleLevel.json 失败: ${e.message}`)
    }
  }

  private loadPlants(configDir: string) {
    try {
      const p = path.join(configDir, 'Plant.json')
      if (!fs.existsSync(p))
        return
      this.plantConfig = JSON.parse(fs.readFileSync(p, 'utf8'))
      this.plantMap.clear()
      this.seedToPlant.clear()
      this.fruitToPlant.clear()
      for (const plant of this.plantConfig) {
        this.plantMap.set(plant.id, plant)
        if (plant.seed_id)
          this.seedToPlant.set(plant.seed_id, plant)
        if (plant.fruit?.id)
          this.fruitToPlant.set(plant.fruit.id, plant)
      }
      this.logger.log(`已加载植物配置 (${this.plantConfig.length} 种)`)
    } catch (e: any) {
      this.logger.warn(`加载 Plant.json 失败: ${e.message}`)
    }
  }

  private loadItems(configDir: string) {
    try {
      const p = path.join(configDir, 'ItemInfo.json')
      if (!fs.existsSync(p))
        return
      this.itemInfoConfig = JSON.parse(fs.readFileSync(p, 'utf8'))
      this.itemInfoMap.clear()
      this.seedItemMap.clear()
      for (const item of this.itemInfoConfig) {
        const id = Number(item?.id) || 0
        if (id <= 0)
          continue
        this.itemInfoMap.set(id, item)
        if (Number(item.type) === 5)
          this.seedItemMap.set(id, item)
      }
      this.logger.log(`已加载物品配置 (${this.itemInfoConfig.length} 项)`)
    } catch (e: any) {
      this.logger.warn(`加载 ItemInfo.json 失败: ${e.message}`)
    }
  }

  private loadSeedImages(configDir: string) {
    try {
      const seedImageDir = path.join(configDir, 'seed_images_named')
      this.seedImageMap.clear()
      this.seedAssetImageMap.clear()
      if (!fs.existsSync(seedImageDir))
        return
      const files = fs.readdirSync(seedImageDir)
      for (const file of files) {
        const filename = String(file || '')
        const fileUrl = `/game-config/seed_images_named/${encodeURIComponent(file)}`

        const byId = filename.match(/^(\d+)_.*\.(?:png|jpg|jpeg|webp|gif)$/i)
        if (byId) {
          const seedId = Number(byId[1]) || 0
          if (seedId > 0 && !this.seedImageMap.has(seedId))
            this.seedImageMap.set(seedId, fileUrl)
        }

        const byAsset = filename.match(/(Crop_\d+)_Seed\.(?:png|jpg|jpeg|webp|gif)$/i)
        if (byAsset) {
          const assetName = byAsset[1]
          if (assetName && !this.seedAssetImageMap.has(assetName))
            this.seedAssetImageMap.set(assetName, fileUrl)
        }
      }
      this.logger.log(`已加载种子图片映射 (${this.seedImageMap.size} 项)`)
    } catch (e: any) {
      this.logger.warn(`加载 seed_images_named 失败: ${e.message}`)
    }
  }

  // ---- 等级经验 ----

  getLevelExpTable(): number[] {
    return this.levelExpTable
  }

  getLevelExpProgress(level: number, totalExp: number): { current: number, needed: number } {
    if (!this.levelExpTable.length || level <= 0)
      return { current: 0, needed: 0 }
    const currentLevelStart = this.levelExpTable[level] || 0
    const nextLevelStart = this.levelExpTable[level + 1] || (currentLevelStart + 100000)
    return {
      current: Math.max(0, totalExp - currentLevelStart),
      needed: nextLevelStart - currentLevelStart
    }
  }

  // ---- 植物 ----

  getPlantById(plantId: number): PlantInfo | undefined {
    return this.plantMap.get(plantId)
  }

  getPlantBySeedId(seedId: number): PlantInfo | undefined {
    return this.seedToPlant.get(seedId)
  }

  getPlantName(plantId: number): string {
    return this.plantMap.get(plantId)?.name ?? `植物${plantId}`
  }

  getPlantNameBySeedId(seedId: number): string {
    return this.seedToPlant.get(seedId)?.name ?? `种子${seedId}`
  }

  getPlantGrowTime(plantId: number): number {
    const plant = this.plantMap.get(plantId)
    if (!plant?.grow_phases)
      return 0
    return plant.grow_phases
      .split(';')
      .filter(Boolean)
      .reduce((total, phase) => {
        const match = phase.match(/:(\d+)/)
        return total + (match ? Number.parseInt(match[1]) : 0)
      }, 0)
  }

  formatGrowTime(seconds: number): string {
    if (seconds < 60)
      return `${seconds}秒`
    if (seconds < 3600)
      return `${Math.floor(seconds / 60)}分钟`
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`
  }

  getPlantExp(plantId: number): number {
    return this.plantMap.get(plantId)?.exp ?? 0
  }

  getAllPlants(): PlantInfo[] {
    return Array.from(this.plantMap.values())
  }

  // ---- 果实 ----

  getFruitName(fruitId: number): string {
    return this.fruitToPlant.get(fruitId)?.name ?? `果实${fruitId}`
  }

  getPlantByFruitId(fruitId: number): PlantInfo | undefined {
    return this.fruitToPlant.get(fruitId)
  }

  // ---- 物品 / 种子 ----

  getItemById(itemId: number): ItemInfo | undefined {
    return this.itemInfoMap.get(Number(itemId) || 0)
  }

  getSeedPrice(seedId: number): number {
    return Number(this.seedItemMap.get(Number(seedId) || 0)?.price) || 0
  }

  getFruitPrice(fruitId: number): number {
    return Number(this.itemInfoMap.get(Number(fruitId) || 0)?.price) || 0
  }

  getAllSeeds(): Array<{ seedId: number, name: string, requiredLevel: number, price: number, image: string }> {
    return Array.from(this.seedToPlant.values()).map(p => ({
      seedId: p.seed_id,
      name: p.name,
      requiredLevel: Number(p.land_level_need) || 0,
      price: this.getSeedPrice(p.seed_id),
      image: this.getSeedImageBySeedId(p.seed_id)
    }))
  }

  // ---- 图片 ----

  getSeedImageBySeedId(seedId: number): string {
    return this.seedImageMap.get(Number(seedId) || 0) || ''
  }

  getItemImageById(itemId: number): string {
    const id = Number(itemId) || 0
    if (id <= 0)
      return ''

    const getImg = (targetId: number): string => {
      const direct = this.seedImageMap.get(targetId)
      if (direct)
        return direct
      const item = this.itemInfoMap.get(targetId)
      const assetName = item?.asset_name ? String(item.asset_name) : ''
      if (assetName) {
        const byAsset = this.seedAssetImageMap.get(assetName)
        if (byAsset)
          return byAsset
      }
      return ''
    }

    let img = getImg(id)
    if (img)
      return img

    const plant = this.getPlantByFruitId(id)
    if (plant?.seed_id) {
      img = getImg(plant.seed_id)
      if (img)
        return img
    }

    return ''
  }

  getItemName(itemId: number): string {
    const item = this.itemInfoMap.get(Number(itemId) || 0)
    if (item)
      return item.name
    const plant = this.fruitToPlant.get(Number(itemId) || 0)
    if (plant)
      return plant.name
    return `物品#${itemId}`
  }

  resolveItemNameInText(text: string): string {
    return text.replace(/物品#(\d+)/g, (_, id) => {
      const numId = Number(id)
      return this.getItemName(numId)
    })
  }
}
