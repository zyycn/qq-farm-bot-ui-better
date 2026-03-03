import { Logger } from '@nestjs/common'

export class StatsTracker {
  private logger: Logger
  private bootAt = Date.now()
  operations = {
    harvest: 0,
    water: 0,
    weed: 0,
    bug: 0,
    fertilize: 0,
    plant: 0,
    steal: 0,
    helpWater: 0,
    helpWeed: 0,
    helpBug: 0,
    taskClaim: 0,
    sell: 0,
    upgrade: 0,
    levelUp: 0
  }

  private lastState = { gold: -1, exp: -1, coupon: -1 }
  private initialState: { gold: number | null, exp: number | null, coupon: number | null } = { gold: null, exp: null, coupon: null }
  session = { goldGained: 0, expGained: 0, couponGained: 0, lastExpGain: 0, lastGoldGain: 0, lastExpTime: 0 }

  constructor(accountId: string) {
    this.logger = new Logger(`Stats:${accountId}`)
  }

  recordOperation(type: string, count = 1) {
    if ((this.operations as any)[type] !== undefined)
      (this.operations as any)[type] += count
  }

  initStats(gold: number, exp: number, coupon = 0) {
    this.lastState = { gold, exp, coupon }
    this.initialState = { gold, exp, coupon }
  }

  updateStats(currentGold: number, currentExp: number) {
    if (this.lastState.gold === -1)
      this.lastState.gold = currentGold
    if (this.lastState.exp === -1)
      this.lastState.exp = currentExp

    this.session.lastGoldGain = currentGold > this.lastState.gold ? currentGold - this.lastState.gold : 0
    this.lastState.gold = currentGold

    if (currentExp > this.lastState.exp) {
      const delta = currentExp - this.lastState.exp
      const now = Date.now()
      if (!(delta === this.session.lastExpGain && now - this.session.lastExpTime < 1000)) {
        this.session.lastExpGain = delta
        this.session.lastExpTime = now
      }
    } else {
      this.session.lastExpGain = 0
    }
    this.lastState.exp = currentExp
  }

  private recompute(gold: number, exp: number, coupon: number) {
    if (this.initialState.gold === null) {
      this.initialState = { gold, exp, coupon }
    }
    this.session.goldGained = gold - this.initialState.gold!
    this.session.expGained = exp - this.initialState.exp!
    this.session.couponGained = coupon - this.initialState.coupon!
  }

  getStats(userState: any, connected: boolean, limits?: any) {
    const gold = Number(userState?.gold) || 0
    const exp = Number(userState?.exp) || 0
    const coupon = Number(userState?.coupon) || 0
    if (connected) {
      this.updateStats(gold, exp)
      this.recompute(gold, exp, coupon)
    }
    return {
      connection: { connected },
      status: { name: userState?.name, level: userState?.level || 0, gold, coupon, exp, platform: userState?.platform || 'qq' },
      uptime: Math.max(0, Math.floor((Date.now() - this.bootAt) / 1000)),
      operations: { ...this.operations },
      sessionExpGained: this.session.expGained,
      sessionGoldGained: this.session.goldGained,
      sessionCouponGained: this.session.couponGained,
      lastExpGain: this.session.lastExpGain,
      lastGoldGain: this.session.lastGoldGain,
      limits
    }
  }
}
