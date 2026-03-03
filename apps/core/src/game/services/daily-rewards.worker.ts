import type { GameClient } from '../game-client'
import type { GameConfigService } from '../game-config.service'
import { Buffer } from 'node:buffer'
import { Logger } from '@nestjs/common'
import { toNum } from '../utils'

function getDateKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getRewardSummary(items: any[], gameConfig: GameConfigService): string {
  return (items || []).filter(it => toNum(it?.count) > 0).map((it) => {
    const id = toNum(it.id)
    const count = toNum(it.count)
    if (id === 1 || id === 1001)
      return `金币${count}`
    if (id === 2 || id === 1101)
      return `经验${count}`
    if (id === 1002)
      return `点券${count}`
    return `${gameConfig.getItemName(id)}x${count}`
  }).join('/')
}

export class DailyRewardsWorker {
  private logger: Logger
  private readonly CHECK_COOLDOWN_MS = 10 * 60 * 1000

  private emailDone = ''
  private emailLastCheck = 0
  private monthCardDone = ''
  private monthCardLastCheck = 0
  private monthCardLastClaim = 0
  private openServerDone = ''
  private openServerLastCheck = 0
  private openServerLastClaim = 0
  private vipDone = ''
  private vipLastCheck = 0
  private vipLastClaim = 0
  private shareDone = ''
  private shareLastCheck = 0
  private shareLastClaim = 0
  private freeGiftDone = ''
  private freeGiftLastCheck = 0
  private fertBuyDone = ''
  private fertBuyLastSuccess = 0
  private fertBuyPausedNoGold = ''

  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: GameClient,
    private gameConfig: GameConfigService,
    private store?: any
  ) {
    this.logger = new Logger(`DailyRewards:${accountId}`)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '信息', meta: { module: 'task', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '警告', meta: { module: 'task', ...(event && { event }) }, isWarn: true })
  }

  // ========== Email ==========

  async checkAndClaimEmails(force = false): Promise<{ claimed: number, rewardItems: number }> {
    const now = Date.now()
    if (!force && this.emailDone === getDateKey())
      return { claimed: 0, rewardItems: 0 }
    if (!force && now - this.emailLastCheck < this.CHECK_COOLDOWN_MS)
      return { claimed: 0, rewardItems: 0 }
    this.emailLastCheck = now

    try {
      const t = this.client.protoTypes
      const getEmailList = async (boxType: number): Promise<any> => {
        const body = Buffer.from(t.GetEmailListRequest.encode(t.GetEmailListRequest.create({ box_type: boxType })).finish())
        const { body: rb } = await this.client.sendMsgAsync('gamepb.emailpb.EmailService', 'GetEmailList', body)
        return t.GetEmailListReply.decode(rb)
      }

      const [box1, box2] = await Promise.all([
        getEmailList(1).catch(() => ({ emails: [] })),
        getEmailList(2).catch(() => ({ emails: [] }))
      ])

      const merged = new Map<string, any>()
      for (const x of [...(box1.emails || []).map((e: any) => ({ ...e, __boxType: 1 })), ...(box2.emails || []).map((e: any) => ({ ...e, __boxType: 2 }))]) {
        if (!x?.id)
          continue
        if (!merged.has(x.id)) {
          merged.set(x.id, x)
          continue
        }
        const old = merged.get(x.id)
        if (!(old?.has_reward && !old?.claimed) && (x?.has_reward && !x?.claimed))
          merged.set(x.id, x)
      }

      const claimable = [...merged.values()].filter(x => x?.has_reward === true && x?.claimed !== true)
      if (claimable.length === 0) {
        this.emailDone = getDateKey()
        this.log('今日暂无可领取邮箱奖励', 'email_rewards')
        return { claimed: 0, rewardItems: 0 }
      }

      const rewards: any[] = []
      let claimed = 0

      // batch claim by box type
      const byBox = new Map<number, any[]>()
      for (const m of claimable) {
        const bt = m.__boxType === 2 ? 2 : 1
        if (!byBox.has(bt))
          byBox.set(bt, [])
        byBox.get(bt)!.push(m)
      }
      for (const [bt, list] of byBox) {
        try {
          const firstId = String(list[0]?.id || '')
          if (!firstId)
            continue
          const body = Buffer.from(t.BatchClaimEmailRequest.encode(t.BatchClaimEmailRequest.create({ box_type: bt, email_id: firstId })).finish())
          const { body: rb } = await this.client.sendMsgAsync('gamepb.emailpb.EmailService', 'BatchClaimEmail', body)
          const rep: any = t.BatchClaimEmailReply.decode(rb)
          if (rep.items?.length)
            rewards.push(...rep.items)
          claimed++
        } catch {}
      }

      for (const m of claimable) {
        const bt = m.__boxType === 2 ? 2 : 1
        try {
          const body = Buffer.from(t.ClaimEmailRequest.encode(t.ClaimEmailRequest.create({ box_type: bt, email_id: String(m.id || '') })).finish())
          const { body: rb } = await this.client.sendMsgAsync('gamepb.emailpb.EmailService', 'ClaimEmail', body)
          const rep: any = t.ClaimEmailReply.decode(rb)
          if (rep.items?.length)
            rewards.push(...rep.items)
          claimed++
        } catch {}
      }

      if (claimed > 0) {
        const rewardStr = getRewardSummary(rewards, this.gameConfig)
        this.log(rewardStr ? `邮箱领取成功 ${claimed} 封 → ${rewardStr}` : `邮箱领取成功 ${claimed} 封`, 'email_rewards')
        this.emailDone = getDateKey()
      }
      return { claimed, rewardItems: rewards.length }
    } catch (e: any) {
      this.warn(`领取邮箱奖励失败: ${e?.message}`, 'email_rewards')
      return { claimed: 0, rewardItems: 0 }
    }
  }

  // ========== Month Card ==========

  async performDailyMonthCardGift(force = false): Promise<boolean> {
    const now = Date.now()
    if (!force && this.monthCardDone === getDateKey())
      return false
    if (!force && now - this.monthCardLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.monthCardLastCheck = now

    try {
      const t = this.client.protoTypes
      const body = Buffer.from(t.GetMonthCardInfosRequest.encode(t.GetMonthCardInfosRequest.create({})).finish())
      const { body: rb } = await this.client.sendMsgAsync('gamepb.mallpb.MallService', 'GetMonthCardInfos', body)
      const rep: any = t.GetMonthCardInfosReply.decode(rb)
      const infos = rep.infos || []
      const claimable = infos.filter((x: any) => x?.can_claim && Number(x.goods_id || 0) > 0)

      if (!claimable.length) {
        this.monthCardDone = getDateKey()
        this.log(infos.length ? '今日暂无可领取月卡礼包' : '当前没有月卡或已过期', 'month_card_gift')
        return false
      }

      let claimed = 0
      for (const info of claimable) {
        try {
          const claimBody = Buffer.from(t.ClaimMonthCardRewardRequest.encode(t.ClaimMonthCardRewardRequest.create({ goods_id: Number(info.goods_id) })).finish())
          const { body: crb } = await this.client.sendMsgAsync('gamepb.mallpb.MallService', 'ClaimMonthCardReward', claimBody)
          const ret: any = t.ClaimMonthCardRewardReply.decode(crb)
          const reward = getRewardSummary(ret.items || [], this.gameConfig)
          this.log(reward ? `月卡领取成功 → ${reward}` : '月卡领取成功', 'month_card_gift')
          claimed++
        } catch (e: any) {
          this.warn(`月卡领取失败: ${e?.message}`, 'month_card_gift')
        }
      }

      if (claimed > 0) {
        this.monthCardLastClaim = Date.now()
        this.monthCardDone = getDateKey()
      }
      return claimed > 0
    } catch (e: any) {
      this.warn(`查询月卡礼包失败: ${e?.message}`, 'month_card_gift')
      return false
    }
  }

  // ========== Open Server Gift ==========

  async performDailyOpenServerGift(force = false): Promise<boolean> {
    const now = Date.now()
    if (!force && this.openServerDone === getDateKey())
      return false
    if (!force && now - this.openServerLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.openServerLastCheck = now

    try {
      const t = this.client.protoTypes
      const body = Buffer.from(t.GetTodayClaimStatusRequest.encode(t.GetTodayClaimStatusRequest.create({})).finish())
      const { body: rb } = await this.client.sendMsgAsync('gamepb.redpacketpb.RedPacketService', 'GetTodayClaimStatus', body)
      const status: any = t.GetTodayClaimStatusReply.decode(rb)
      const claimable = (status.infos || []).filter((x: any) => x?.can_claim && Number(x.id || 0) > 0)

      if (!claimable.length) {
        this.openServerDone = getDateKey()
        this.log('今日暂无可领取开服红包', 'open_server_gift')
        return false
      }

      let claimed = 0
      for (const info of claimable) {
        try {
          const claimBody = Buffer.from(t.ClaimRedPacketRequest.encode(t.ClaimRedPacketRequest.create({ id: Number(info.id) })).finish())
          const { body: crb } = await this.client.sendMsgAsync('gamepb.redpacketpb.RedPacketService', 'ClaimRedPacket', claimBody)
          const ret: any = t.ClaimRedPacketReply.decode(crb)
          const items = ret.item ? [ret.item] : []
          const reward = getRewardSummary(items, this.gameConfig)
          this.log(reward ? `开服红包领取成功 → ${reward}` : '开服红包领取成功', 'open_server_gift')
          claimed++
        } catch (e: any) {
          const msg = String(e?.message || '')
          if (msg.includes('已领取') || msg.includes('次数已达上限')) {
            this.openServerDone = getDateKey()
            break
          }
          this.warn(`开服红包领取失败: ${msg}`, 'open_server_gift')
        }
      }

      if (claimed > 0) {
        this.openServerLastClaim = Date.now()
        this.openServerDone = getDateKey()
      }
      return claimed > 0
    } catch (e: any) {
      this.warn(`领取开服红包失败: ${e?.message}`, 'open_server_gift')
      return false
    }
  }

  // ========== VIP Gift ==========

  async performDailyVipGift(force = false): Promise<boolean> {
    const now = Date.now()
    if (!force && this.vipDone === getDateKey())
      return false
    if (!force && now - this.vipLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.vipLastCheck = now

    try {
      const t = this.client.protoTypes
      const statusBody = Buffer.from(t.GetDailyGiftStatusRequest.encode(t.GetDailyGiftStatusRequest.create({})).finish())
      const { body: srb } = await this.client.sendMsgAsync('gamepb.qqvippb.QQVipService', 'GetDailyGiftStatus', statusBody)
      const status: any = t.GetDailyGiftStatusReply.decode(srb)

      if (!status?.can_claim) {
        this.vipDone = getDateKey()
        this.log('今日暂无可领取会员礼包', 'vip_daily_gift')
        return false
      }

      const claimBody = Buffer.from(t.ClaimDailyGiftRequest.encode(t.ClaimDailyGiftRequest.create({})).finish())
      const { body: crb } = await this.client.sendMsgAsync('gamepb.qqvippb.QQVipService', 'ClaimDailyGift', claimBody)
      const rep: any = t.ClaimDailyGiftReply.decode(crb)
      const reward = getRewardSummary(rep.items || [], this.gameConfig)
      this.log(reward ? `会员礼包领取成功 → ${reward}` : '会员礼包领取成功', 'vip_daily_gift')
      this.vipLastClaim = Date.now()
      this.vipDone = getDateKey()
      return true
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('已领取')) {
        this.vipDone = getDateKey()
        return false
      }
      this.warn(`领取会员礼包失败: ${msg}`, 'vip_daily_gift')
      return false
    }
  }

  // ========== Share ==========

  async performDailyShare(force = false): Promise<boolean> {
    const now = Date.now()
    if (!force && this.shareDone === getDateKey())
      return false
    if (!force && now - this.shareLastCheck < this.CHECK_COOLDOWN_MS)
      return false
    this.shareLastCheck = now

    try {
      const t = this.client.protoTypes

      const checkBody = Buffer.from(t.CheckCanShareRequest.encode(t.CheckCanShareRequest.create({})).finish())
      const { body: crb } = await this.client.sendMsgAsync('gamepb.sharepb.ShareService', 'CheckCanShare', checkBody)
      const can: any = t.CheckCanShareReply.decode(crb)
      if (!can?.can_share) {
        this.shareDone = getDateKey()
        this.log('今日暂无可领取分享礼包', 'daily_share')
        return false
      }

      const reportBody = Buffer.from(t.ReportShareRequest.encode(t.ReportShareRequest.create({ shared: true })).finish())
      const { body: rrb } = await this.client.sendMsgAsync('gamepb.sharepb.ShareService', 'ReportShare', reportBody)
      const report: any = t.ReportShareReply.decode(rrb)
      if (!report?.success) {
        this.warn('上报分享状态失败', 'daily_share')
        return false
      }

      const claimBody = Buffer.from(t.ClaimShareRewardRequest.encode(t.ClaimShareRewardRequest.create({ claimed: true })).finish())
      const { body: clrb } = await this.client.sendMsgAsync('gamepb.sharepb.ShareService', 'ClaimShareReward', claimBody)
      const rep: any = t.ClaimShareRewardReply.decode(clrb)
      if (!rep?.success) {
        this.warn('领取分享礼包失败', 'daily_share')
        return false
      }

      const reward = getRewardSummary(rep.items || [], this.gameConfig)
      this.log(reward ? `分享领取成功 → ${reward}` : '分享领取成功', 'daily_share')
      this.shareLastClaim = Date.now()
      this.shareDone = getDateKey()
      return true
    } catch (e: any) {
      this.warn(`领取分享奖励失败: ${e?.message}`, 'daily_share')
      return false
    }
  }

  // ========== Free Gifts (Mall) ==========

  async buyFreeGifts(force = false): Promise<number> {
    const now = Date.now()
    if (!force && this.freeGiftDone === getDateKey())
      return 0
    if (!force && now - this.freeGiftLastCheck < this.CHECK_COOLDOWN_MS)
      return 0
    this.freeGiftLastCheck = now

    try {
      const t = this.client.protoTypes
      const body = Buffer.from(t.GetMallListBySlotTypeRequest.encode(t.GetMallListBySlotTypeRequest.create({ slot_type: 1 })).finish())
      const { body: rb } = await this.client.sendMsgAsync('gamepb.mallpb.MallService', 'GetMallListBySlotType', body)
      const mall: any = t.GetMallListBySlotTypeResponse.decode(rb)
      const raw = mall.goods_list || []
      const goods: any[] = []
      for (const b of raw) {
        try {
          goods.push(t.MallGoods.decode(b))
        } catch {}
      }
      const free = goods.filter(g => g?.is_free === true && Number(g.goods_id || 0) > 0)
      if (!free.length) {
        this.freeGiftDone = getDateKey()
        this.log('今日暂无可领取免费礼包', 'mall_free_gifts')
        return 0
      }

      let bought = 0
      for (const g of free) {
        try {
          const purchaseBody = Buffer.from(t.PurchaseRequest.encode(t.PurchaseRequest.create({ goods_id: Number(g.goods_id), count: 1 })).finish())
          await this.client.sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', purchaseBody)
          bought++
        } catch {}
      }
      this.freeGiftDone = getDateKey()
      if (bought > 0) {
        this.log(`自动购买免费礼包 x${bought}`, 'mall_free_gifts')
      }
      return bought
    } catch (e: any) {
      this.warn(`领取免费礼包失败: ${e?.message}`, 'mall_free_gifts')
      return 0
    }
  }

  // ========== Organic Fertilizer Buy ==========

  private static readonly BUY_COOLDOWN_MS = 60_000
  private static readonly ORGANIC_FERTILIZER_MALL_GOODS_ID = 10001
  private static readonly MAX_ROUNDS = 20
  private static readonly BUY_PER_ROUND = 10
  private lastBuyAt = 0

  async autoBuyOrganicFertilizer(force = false): Promise<number> {
    const now = Date.now()
    if (!force && now - this.lastBuyAt < DailyRewardsWorker.BUY_COOLDOWN_MS)
      return 0
    this.lastBuyAt = now
    try {
      const t = this.client.protoTypes
      const body = Buffer.from(t.GetMallListBySlotTypeRequest.encode(t.GetMallListBySlotTypeRequest.create({ slot_type: 1 })).finish())
      const { body: rb } = await this.client.sendMsgAsync('gamepb.mallpb.MallService', 'GetMallListBySlotType', body)
      const mall: any = t.GetMallListBySlotTypeResponse.decode(rb)
      const raw = mall.goods_list || []
      const goods: any[] = []
      for (const b of raw) {
        try {
          goods.push(t.MallGoods.decode(b))
        } catch {}
      }
      const target = goods.find(g => Number(g?.goods_id || 0) === DailyRewardsWorker.ORGANIC_FERTILIZER_MALL_GOODS_ID)
      if (!target)
        return 0

      let totalBought = 0
      for (let i = 0; i < DailyRewardsWorker.MAX_ROUNDS; i++) {
        try {
          const purchaseBody = Buffer.from(t.PurchaseRequest.encode(t.PurchaseRequest.create({ goods_id: DailyRewardsWorker.ORGANIC_FERTILIZER_MALL_GOODS_ID, count: DailyRewardsWorker.BUY_PER_ROUND })).finish())
          await this.client.sendMsgAsync('gamepb.mallpb.MallService', 'Purchase', purchaseBody)
          totalBought += DailyRewardsWorker.BUY_PER_ROUND
        } catch { break }
        await new Promise(r => setTimeout(r, 120))
      }

      if (totalBought > 0) {
        this.fertBuyDone = getDateKey()
        this.fertBuyLastSuccess = Date.now()
        this.log(`自动购买有机化肥 x${totalBought}`, 'fertilizer_buy')
      }
      return totalBought
    } catch { return 0 }
  }

  // ========== Daily State Getters ==========

  getEmailDailyState() { return { key: 'email_rewards', doneToday: this.emailDone === getDateKey(), lastCheckAt: this.emailLastCheck } }
  getMonthCardDailyState() { return { key: 'month_card_gift', doneToday: this.monthCardDone === getDateKey(), lastClaimAt: this.monthCardLastClaim } }
  getOpenServerDailyState() { return { key: 'open_server_gift', doneToday: this.openServerDone === getDateKey(), lastClaimAt: this.openServerLastClaim } }
  getVipDailyState() { return { key: 'vip_daily_gift', doneToday: this.vipDone === getDateKey(), lastClaimAt: this.vipLastClaim } }
  getShareDailyState() { return { key: 'daily_share', doneToday: this.shareDone === getDateKey(), lastClaimAt: this.shareLastClaim } }
  getFreeGiftDailyState() { return { key: 'mall_free_gifts', doneToday: this.freeGiftDone === getDateKey() } }
  getFertilizerBuyDailyState() { return { key: 'fertilizer_buy', doneToday: this.fertBuyDone === getDateKey(), pausedNoGoldToday: this.fertBuyPausedNoGold === getDateKey(), lastSuccessAt: this.fertBuyLastSuccess } }
}
