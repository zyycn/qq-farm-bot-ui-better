import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  uin: text('uin').default(''),
  qq: text('qq').default(''),
  name: text('name').default(''),
  nick: text('nick').default(''),
  platform: text('platform').default('qq'),
  code: text('code').default(''),
  avatar: text('avatar').default(''),
  loginType: text('login_type').default('qr'),
  running: integer('running', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'number' }).default(0),
  updatedAt: integer('updated_at', { mode: 'number' }).default(0)
})

export const accountConfigs = sqliteTable('account_configs', {
  accountId: text('account_id').primaryKey(),
  automation: text('automation', { mode: 'json' }).$type<Record<string, any>>().default({}),
  plantingStrategy: text('planting_strategy').default('preferred'),
  preferredSeedId: integer('preferred_seed_id').default(0),
  intervals: text('intervals', { mode: 'json' }).$type<Record<string, number>>().default({}),
  friendQuietHours: text('friend_quiet_hours', { mode: 'json' }).$type<Record<string, any>>().default({}),
  friendBlacklist: text('friend_blacklist', { mode: 'json' }).$type<number[]>().default([]),
  stealCropBlacklist: text('steal_crop_blacklist', { mode: 'json' }).$type<number[]>().default([])
})

export const globalConfig = sqliteTable('global_config', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<any>()
})

export const logs = sqliteTable('logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').default(''),
  accountName: text('account_name').default(''),
  tag: text('tag').default(''),
  module: text('module').default(''),
  event: text('event').default(''),
  msg: text('msg').default(''),
  isWarn: integer('is_warn', { mode: 'boolean' }).default(false),
  ts: integer('ts', { mode: 'number' }).default(0),
  meta: text('meta', { mode: 'json' }).$type<Record<string, any>>().default({})
})

export const accountLogs = sqliteTable('account_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').default(''),
  accountName: text('account_name').default(''),
  action: text('action').default(''),
  msg: text('msg').default(''),
  reason: text('reason').default(''),
  ts: integer('ts', { mode: 'number' }).default(0),
  extra: text('extra', { mode: 'json' }).$type<Record<string, any>>().default({})
})
