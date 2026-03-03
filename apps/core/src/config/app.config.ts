import process from 'node:process'
import { registerAs } from '@nestjs/config'

export default registerAs('app', () => ({
  port: Number(process.env.ADMIN_PORT) || 3000,
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  jwtSecret: process.env.JWT_SECRET || 'qq-farm-bot-jwt-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  serverUrl: 'wss://gate-obt.nqf.qq.com/prod/ws',
  clientVersion: '1.6.0.14_20251224',
  platform: 'qq',
  os: 'iOS',
  heartbeatInterval: 25000
}))
