import { Logger } from '@nestjs/common'

interface TaskMeta {
  kind: 'timeout' | 'interval'
  delayMs: number
  createdAt: number
  nextRunAt: number
  lastRunAt: number
  runCount: number
  running: boolean
  preventOverlap: boolean
  handle: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null
}

export interface TaskSnapshot {
  name: string
  kind: string
  delayMs: number
  createdAt: number
  nextRunAt: number
  lastRunAt: number
  runCount: number
  running: boolean
  preventOverlap: boolean
}

export class Scheduler {
  private timers = new Map<string, TaskMeta>()
  private logger: Logger

  constructor(private namespace: string) {
    this.logger = new Logger(`Scheduler:${namespace}`)
  }

  clear(taskName: string): boolean {
    const entry = this.timers.get(taskName)
    if (!entry)
      return false
    this.timers.delete(taskName)
    if (entry.kind === 'interval')
      clearInterval(entry.handle as ReturnType<typeof setInterval>)
    else
      clearTimeout(entry.handle as ReturnType<typeof setTimeout>)
    return true
  }

  clearAll() {
    for (const key of Array.from(this.timers.keys()))
      this.clear(key)
  }

  setTimeoutTask(taskName: string, delayMs: number, taskFn: () => any): ReturnType<typeof setTimeout> {
    if (!taskName)
      throw new Error('taskName 不能为空')
    this.clear(taskName)
    const delay = Math.max(0, Math.floor(Number(delayMs) || 0))
    const entry: TaskMeta = {
      kind: 'timeout',
      delayMs: delay,
      createdAt: Date.now(),
      nextRunAt: Date.now() + delay,
      lastRunAt: 0,
      runCount: 0,
      running: false,
      preventOverlap: true,
      handle: null
    }
    const handle = setTimeout(async () => {
      const current = this.timers.get(taskName)
      if (!current || current.handle !== handle)
        return
      current.running = true
      current.lastRunAt = Date.now()
      current.runCount++
      try {
        await taskFn()
      } catch (e: any) {
        this.logger.warn(`timeout 任务执行失败: ${taskName} - ${e?.message}`)
      } finally {
        const after = this.timers.get(taskName)
        if (after && after.handle === handle)
          this.timers.delete(taskName)
      }
    }, delay)
    entry.handle = handle
    this.timers.set(taskName, entry)
    return handle
  }

  setIntervalTask(
    taskName: string,
    intervalMs: number,
    taskFn: () => any,
    options: { preventOverlap?: boolean, runImmediately?: boolean } = {}
  ): ReturnType<typeof setInterval> {
    if (!taskName)
      throw new Error('taskName 不能为空')
    this.clear(taskName)
    const delay = Math.max(1, Math.floor(Number(intervalMs) || 1000))
    const preventOverlap = options.preventOverlap !== false
    const entry: TaskMeta = {
      kind: 'interval',
      delayMs: delay,
      createdAt: Date.now(),
      nextRunAt: Date.now() + delay,
      lastRunAt: 0,
      runCount: 0,
      running: false,
      preventOverlap,
      handle: null
    }

    const runner = async () => {
      const current = this.timers.get(taskName)
      if (!current)
        return
      if (preventOverlap && current.running)
        return
      current.running = true
      current.lastRunAt = Date.now()
      current.runCount++
      try {
        await taskFn()
      } catch (e: any) {
        this.logger.warn(`interval 任务执行失败: ${taskName} - ${e?.message}`)
      } finally {
        const updated = this.timers.get(taskName)
        if (updated) {
          updated.running = false
          updated.nextRunAt = Date.now() + delay
        }
      }
    }

    if (options.runImmediately)
      Promise.resolve().then(runner).catch(() => null)

    const handle = setInterval(runner, delay)
    entry.handle = handle
    this.timers.set(taskName, entry)
    return handle
  }

  has(taskName: string): boolean {
    return this.timers.has(taskName)
  }

  getTaskNames(): string[] {
    return Array.from(this.timers.keys())
  }

  getSnapshot(): { namespace: string, taskCount: number, tasks: TaskSnapshot[] } {
    const tasks: TaskSnapshot[] = []
    for (const [name, meta] of this.timers.entries()) {
      tasks.push({
        name,
        kind: meta.kind,
        delayMs: meta.delayMs,
        createdAt: meta.createdAt,
        nextRunAt: meta.nextRunAt,
        lastRunAt: meta.lastRunAt,
        runCount: meta.runCount,
        running: meta.running,
        preventOverlap: meta.preventOverlap
      })
    }
    tasks.sort((a, b) => a.name.localeCompare(b.name))
    return { namespace: this.namespace, taskCount: tasks.length, tasks }
  }
}

const registryMap = new Map<string, Scheduler>()

export function createScheduler(namespace = 'default'): Scheduler {
  const existing = registryMap.get(namespace)
  if (existing)
    return existing
  const s = new Scheduler(namespace)
  registryMap.set(namespace, s)
  return s
}

export function getSchedulerRegistrySnapshot(namespace?: string) {
  const list: any[] = []
  for (const [name, scheduler] of registryMap.entries()) {
    if (namespace && name !== namespace)
      continue
    list.push(scheduler.getSnapshot())
  }
  list.sort((a: any, b: any) => a.namespace.localeCompare(b.namespace))
  return { generatedAt: Date.now(), schedulerCount: list.length, schedulers: list }
}
