import { Injectable, NotFoundException } from '@nestjs/common'
import { AccountManagerService } from '../../game/account-manager.service'
import { StoreService } from '../../store/store.service'

@Injectable()
export class AccountService {
  constructor(
    private manager: AccountManagerService,
    private store: StoreService
  ) {}

  getAccounts() {
    return this.manager.getAccounts()
  }

  createOrUpdateAccount(payload: any) {
    const isUpdateById = !!payload.id
    const resolvedUpdateId = isUpdateById ? this.manager.resolveAccountId(payload.id) : ''
    const body = isUpdateById ? { ...payload, id: resolvedUpdateId || String(payload.id) } : payload

    const before = this.manager.getAccounts()
    const beforeAccounts = before.accounts || []

    // 显式 id 更新：以 id 为主；否则（QQ 平台）尝试按 uin+platform 匹配已有账号
    let targetBefore: any = null
    if (isUpdateById) {
      targetBefore = beforeAccounts.find((a: any) => String(a.id) === String(body.id))
    } else if (payload.uin && (payload.platform || 'qq') === 'qq') {
      const uin = String(payload.uin)
      const platform = String(payload.platform || 'qq')
      targetBefore = beforeAccounts.find((a: any) =>
        String(a.uin) === uin && String(a.platform || 'qq') === platform
      )
    }

    let wasRunning = false
    if (targetBefore)
      wasRunning = this.manager.isAccountRunning(String(targetBefore.id))

    let onlyRemarkChanged = false
    if (isUpdateById) {
      const oldAccount = beforeAccounts.find((a: any) => String(a.id) === String(body.id))
      if (oldAccount) {
        const keys = Object.keys(body)
        onlyRemarkChanged = keys.length === 2 && keys.includes('id') && keys.includes('name')
      }
    }

    const data = this.store.addOrUpdateAccount(body)
    const afterAccounts = data.accounts || []

    // 先按 QQ uin+platform 匹配最新账号，否则回退到 id；用于日志与启动/重启
    let targetAfter: any = null
    if (payload.uin && (payload.platform || 'qq') === 'qq') {
      const uin = String(payload.uin)
      const platform = String(payload.platform || 'qq')
      targetAfter = afterAccounts.find((a: any) =>
        String(a.uin) === uin && String(a.platform || 'qq') === platform
      )
    }
    if (!targetAfter && isUpdateById) {
      targetAfter = afterAccounts.find((a: any) => String(a.id) === String(body.id))
    }

    const accountId = targetAfter
      ? String(targetAfter.id)
      : (isUpdateById
          ? String(body.id)
          : String((afterAccounts[afterAccounts.length - 1] || {}).id || ''))

    const effectiveIsUpdate = !!targetBefore

    this.manager.addAccountLog(
      effectiveIsUpdate ? 'update' : 'add',
      effectiveIsUpdate
        ? `更新账号: ${(targetAfter && (targetAfter.name || targetAfter.nick)) || body.name || accountId}`
        : `添加账号: ${(targetAfter && (targetAfter.name || targetAfter.nick)) || body.name || accountId}`,
      accountId,
      (targetAfter && (targetAfter.name || targetAfter.nick)) || body.name || ''
    )

    if (!effectiveIsUpdate) {
      const newAcc = afterAccounts.find((a: any) => String(a.id) === accountId) || afterAccounts[afterAccounts.length - 1]
      if (newAcc)
        this.manager.startAccount(String(newAcc.id))
    } else if (wasRunning && !onlyRemarkChanged) {
      this.manager.restartAccount(accountId)
    }

    return data
  }

  deleteAccount(id: string) {
    const resolvedId = this.manager.resolveAccountId(id) || String(id)
    const before = this.manager.getAccounts()
    const target = (before.accounts || []).find((a: any) =>
      String(a.id) === resolvedId || String(a.uin) === id || String(a.qq) === id
    )

    this.manager.stopAccount(resolvedId)
    const data = this.store.deleteAccount(resolvedId)

    this.manager.addAccountLog(
      'delete',
      `删除账号: ${(target && target.name) || id}`,
      resolvedId,
      target ? target.name : ''
    )

    return data
  }

  startAccount(id: string) {
    const resolvedId = (this.manager.resolveAccountId(id) || String(id || '').trim()).trim()
    if (!resolvedId)
      throw new NotFoundException('账号未找到')
    const acc = this.store.getAccountById(resolvedId)
    if (!acc)
      throw new NotFoundException('账号未找到')
    if (!acc.code || String(acc.code).trim() === '') {
      throw new NotFoundException('请先扫码登录获取 Code 后再启动')
    }
    const ok = this.manager.startAccount(resolvedId)
    if (!ok)
      throw new NotFoundException('账号已在运行中')
    return null
  }

  stopAccount(id: string) {
    const resolvedId = this.manager.resolveAccountId(id)
    this.manager.stopAccount(resolvedId)
    return null
  }

  updateRemark(body: any) {
    const rawRef = body.id || body.accountId || body.uin
    const accounts = this.manager.getAccounts().accounts || []
    const target = accounts.find((a: any) =>
      String(a.id) === String(rawRef) || String(a.uin) === String(rawRef) || String(a.qq) === String(rawRef)
    )

    if (!target?.id)
      throw new NotFoundException('账号未找到')

    const remark = String(body.remark ?? body.name ?? '').trim()
    if (!remark)
      throw new NotFoundException('缺少备注')

    const data = this.store.addOrUpdateAccount({ id: String(target.id), name: remark })
    this.manager.setRuntimeAccountName(String(target.id), remark)
    this.manager.addAccountLog('update', `更新账号备注: ${remark}`, String(target.id), remark)

    return data
  }

  getAccountLogs(limit: number) {
    return this.manager.getAccountLogs(limit)
  }
}
