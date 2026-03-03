import type { StoreService } from '../../store/store.service'
import type { GameClient } from '../game-client'
import type { GameConfigService } from '../game-config.service'
import { Buffer } from 'node:buffer'
import { Logger } from '@nestjs/common'
import * as protobuf from 'protobufjs'
import { sleep, toLong, toNum } from '../utils'

const SELL_BATCH_SIZE = 15
const FERTILIZER_RELATED_IDS = new Set([100003, 100004, 80001, 80002, 80003, 80004, 80011, 80012, 80013, 80014])
const FERTILIZER_CONTAINER_LIMIT_HOURS = 990
const NORMAL_CONTAINER_ID = 1011
const ORGANIC_CONTAINER_ID = 1012
const NORMAL_FERTILIZER_ITEM_HOURS = new Map([[80001, 1], [80002, 4], [80003, 8], [80004, 12]])
const ORGANIC_FERTILIZER_ITEM_HOURS = new Map([[80011, 1], [80012, 4], [80013, 8], [80014, 12]])

export class WarehouseWorker {
  private logger: Logger
  private fertilizerGiftDoneDateKey = ''
  private fertilizerGiftLastOpenAt = 0
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: GameClient,
    private gameConfig: GameConfigService,
    private store: StoreService
  ) {
    this.logger = new Logger(`Warehouse:${accountId}`)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '信息', meta: { module: 'warehouse', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '警告', meta: { module: 'warehouse', ...(event && { event }) }, isWarn: true })
  }

  private get t() { return this.client.protoTypes }

  private getDateKey(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  // ========== API ==========

  async getBag(): Promise<any> {
    const body = Buffer.from(this.t.BagRequest.encode(this.t.BagRequest.create({})).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.itempb.ItemService', 'Bag', body)
    return this.t.BagReply.decode(rb)
  }

  getBagItems(bagReply: any): any[] {
    if (bagReply?.item_bag?.items?.length)
      return bagReply.item_bag.items
    return bagReply?.items || []
  }

  async sellItems(items: any[]): Promise<any> {
    const payload = items.map((item: any) => {
      const p: any = { id: toLong(toNum(item?.id)), count: toLong(toNum(item?.count)) }
      const uid = toNum(item?.uid)
      if (uid > 0)
        p.uid = toLong(uid)
      return p
    })
    const body = Buffer.from(this.t.SellRequest.encode(this.t.SellRequest.create({ items: payload })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.itempb.ItemService', 'Sell', body)
    return this.t.SellReply.decode(rb)
  }

  async useItem(itemId: number, count = 1, landIds: number[] = []): Promise<any> {
    const body = Buffer.from(this.t.UseRequest.encode(this.t.UseRequest.create({
      item_id: toLong(itemId),
      count: toLong(count),
      land_ids: landIds.map(id => toLong(id))
    })).finish())
    try {
      const { body: rb } = await this.client.sendMsgAsync('gamepb.itempb.ItemService', 'Use', body)
      return this.t.UseReply.decode(rb)
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (!msg.includes('code=1000020') && !msg.includes('请求参数错误'))
        throw e
      const writer = protobuf.Writer.create()
      const itemWriter = writer.uint32(10).fork()
      itemWriter.uint32(8).int64(toLong(itemId))
      itemWriter.uint32(16).int64(toLong(count))
      itemWriter.ldelim()
      const fallbackBody = Buffer.from(writer.finish())
      const { body: rb } = await this.client.sendMsgAsync('gamepb.itempb.ItemService', 'Use', fallbackBody)
      return this.t.UseReply.decode(rb)
    }
  }

  async batchUseItems(items: { itemId: number, count: number, uid?: number }[]): Promise<any> {
    const payload = items.map(it => ({ id: toLong(it.itemId), count: toLong(it.count || 1), uid: toLong(it.uid || 0) }))
    const body = Buffer.from(this.t.BatchUseRequest.encode(this.t.BatchUseRequest.create({ items: payload })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.itempb.ItemService', 'BatchUse', body)
    return this.t.BatchUseReply.decode(rb)
  }

  // ========== Fertilizer Gift Packs ==========

  private isFertilizerRelatedItemId(itemId: number): boolean {
    if (itemId <= 0 || itemId === 1011 || itemId === 1012)
      return false
    if (FERTILIZER_RELATED_IDS.has(itemId))
      return true
    const info = this.gameConfig.getItemById(itemId)
    if (!info)
      return false
    const interactionType = String(info.interaction_type || '').toLowerCase()
    return interactionType === 'fertilizer' || interactionType === 'fertilizerpro'
  }

  private getFertilizerItemTypeAndHours(itemId: number) {
    if (NORMAL_FERTILIZER_ITEM_HOURS.has(itemId))
      return { type: 'normal' as const, perItemHours: NORMAL_FERTILIZER_ITEM_HOURS.get(itemId)! }
    if (ORGANIC_FERTILIZER_ITEM_HOURS.has(itemId))
      return { type: 'organic' as const, perItemHours: ORGANIC_FERTILIZER_ITEM_HOURS.get(itemId)! }
    const info = this.gameConfig.getItemById(itemId) || {} as any
    const interactionType = String(info.interaction_type || '').toLowerCase()
    if (interactionType === 'fertilizer')
      return { type: 'normal' as const, perItemHours: 1 }
    if (interactionType === 'fertilizerpro')
      return { type: 'organic' as const, perItemHours: 1 }
    return { type: 'other' as const, perItemHours: 0 }
  }

  async autoOpenFertilizerGiftPacks(): Promise<number> {
    try {
      const bagReply = await this.getBag()
      const bagItems = this.getBagItems(bagReply)

      const merged = new Map<number, number>()
      for (const it of bagItems) {
        const id = toNum(it?.id)
        const count = Math.max(0, toNum(it?.count))
        if (id > 0 && count > 0 && this.isFertilizerRelatedItemId(id))
          merged.set(id, (merged.get(id) || 0) + count)
      }
      if (!merged.size)
        return 0

      const containerHours = { normal: 0, organic: 0 }
      for (const it of bagItems) {
        const id = toNum(it?.id)
        const count = Math.max(0, toNum(it?.count))
        if (id === NORMAL_CONTAINER_ID)
          containerHours.normal = count / 3600
        if (id === ORGANIC_CONTAINER_ID)
          containerHours.organic = count / 3600
      }

      let opened = 0
      const details: string[] = []
      for (const [itemId, rawCount] of merged) {
        const { type, perItemHours } = this.getFertilizerItemTypeAndHours(itemId)
        if (type === 'normal' || type === 'organic') {
          const currentHours = type === 'normal' ? containerHours.normal : containerHours.organic
          if (currentHours >= FERTILIZER_CONTAINER_LIMIT_HOURS)
            continue
          if (perItemHours > 0) {
            const maxCount = Math.floor(Math.max(0, FERTILIZER_CONTAINER_LIMIT_HOURS - currentHours) / perItemHours)
            if (maxCount <= 0)
              continue
            const useCount = Math.min(rawCount, maxCount)
            try {
              await this.batchUseItems([{ itemId, count: useCount }])
              opened += useCount
              details.push(`${this.gameConfig.getItemName(itemId)}x${useCount}`)
              if (type === 'normal')
                containerHours.normal += useCount * perItemHours
              else
                containerHours.organic += useCount * perItemHours
            } catch {
              continue
            }
          }
        }
        await sleep(100)
      }

      if (opened > 0) {
        this.fertilizerGiftDoneDateKey = this.getDateKey()
        this.fertilizerGiftLastOpenAt = Date.now()
        this.log(`自动使用化肥类道具 x${opened}${details.length ? ` [${details.join('，')}]` : ''}`, 'fertilizer_gift_open')
      }
      return opened
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('code=1003002') || msg.includes('化肥容器已'))
        return 0
      this.warn(`开启化肥礼包失败: ${msg}`, 'fertilizer_gift_open')
      return 0
    }
  }

  // ========== Sell Fruits ==========

  private getGoldFromItems(items: any[]): number {
    for (const item of (items || [])) {
      const id = toNum(item.id)
      if ((id === 1 || id === 1001) && toNum(item.count) > 0)
        return toNum(item.count)
    }
    return 0
  }

  async sellAllFruits() {
    if (!this.store.isAutomationOn('sell', this.accountId))
      return
    try {
      const bagReply = await this.getBag()
      const items = this.getBagItems(bagReply)
      const toSell: any[] = []
      const names: string[] = []
      for (const item of items) {
        const id = toNum(item.id)
        const count = toNum(item.count)
        if (this.gameConfig.getPlantByFruitId(id) && count > 0) {
          toSell.push(item)
          names.push(`${this.gameConfig.getFruitName(id)}x${count}`)
        }
      }
      if (!toSell.length)
        return

      const goldBefore = Number(this.client.userState?.gold || 0)
      let serverGoldTotal = 0
      for (let i = 0; i < toSell.length; i += SELL_BATCH_SIZE) {
        const batch = toSell.slice(i, i + SELL_BATCH_SIZE)
        try {
          const reply = await this.sellItems(batch)
          const gain = Math.max(0, this.getGoldFromItems(reply?.get_items || []))
          if (gain > 0)
            serverGoldTotal += gain
        } catch {
          for (const it of batch) {
            try {
              const r = await this.sellItems([it])
              const g = Math.max(0, this.getGoldFromItems(r?.get_items || []))
              if (g > 0)
                serverGoldTotal += g
            } catch {}
          }
        }
        if (i + SELL_BATCH_SIZE < toSell.length)
          await sleep(300)
      }

      await sleep(500)
      const goldAfter = Number(this.client.userState?.gold || 0)
      const totalGoldEarned = Math.max(serverGoldTotal, goldAfter > goldBefore ? goldAfter - goldBefore : 0)
      this.log(`出售 ${names.join(', ')}${totalGoldEarned > 0 ? `，获得 ${totalGoldEarned} 金币` : ''}`, 'sell_success')
      if (totalGoldEarned > 0)
        this.client.emit('sell', totalGoldEarned)
    } catch (e: any) { this.warn(`出售失败: ${e?.message}`, 'sell_success') }
  }

  // ========== Bag Detail ==========

  async getBagDetail() {
    const bagReply = await this.getBag()
    const rawItems = this.getBagItems(bagReply)
    const merged = new Map<number, any>()
    for (const it of rawItems) {
      const id = toNum(it.id)
      const count = toNum(it.count)
      if (id <= 0 || count <= 0)
        continue
      const info = this.gameConfig.getItemById(id)
      let name = info?.name || ''
      let category = 'item'
      if (id === 1 || id === 1001) {
        name = '金币'
        category = 'gold'
      } else if (id === 1101) {
        name = '经验'
        category = 'exp'
      } else if (this.gameConfig.getPlantByFruitId(id)) {
        name = name || `${this.gameConfig.getFruitName(id)}果实`
        category = 'fruit'
      } else if (this.gameConfig.getPlantBySeedId(id)) {
        const p = this.gameConfig.getPlantBySeedId(id)
        name = name || `${p?.name || '未知'}种子`
        category = 'seed'
      }
      if (!name)
        name = `物品${id}`
      const interactionType = info?.interaction_type ? String(info.interaction_type) : ''

      if (!merged.has(id)) {
        merged.set(id, {
          id,
          count: 0,
          uid: 0,
          name,
          image: this.gameConfig.getItemImageById(id),
          category,
          itemType: info ? (Number(info.type) || 0) : 0,
          price: info ? (Number(info.price) || 0) : 0,
          level: info ? (Number(info.level) || 0) : 0,
          interactionType,
          hoursText: ''
        })
      }
      merged.get(id)!.count += count
    }

    const items = Array.from(merged.values()).map((row) => {
      if (row.interactionType === 'fertilizerbucket' && row.count > 0) {
        row.hoursText = `${(Math.floor((row.count / 3600) * 10) / 10).toFixed(1)}小时`
      }
      return row
    })
    items.sort((a, b) => (b.count - a.count) || (a.id - b.id))
    return { totalKinds: items.length, items }
  }

  async getCurrentTotalsFromBag() {
    const bagReply = await this.getBag()
    const items = this.getBagItems(bagReply)
    let gold: number | null = null
    let exp: number | null = null
    for (const item of items) {
      const id = toNum(item.id)
      const count = toNum(item.count)
      if (id === 1 || id === 1001)
        gold = count
      if (id === 1101)
        exp = count
    }
    return { gold, exp }
  }

  // ========== State for UI ==========

  getFertilizerGiftDailyState() {
    return { key: 'fertilizer_gift_open', doneToday: this.fertilizerGiftDoneDateKey === this.getDateKey(), lastOpenAt: this.fertilizerGiftLastOpenAt }
  }
}
