import type { DrizzleDB } from '../../database/drizzle.provider'
import crypto from 'node:crypto'
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '../../database/drizzle.provider'
import * as schema from '../../database/schema'

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(DRIZZLE_TOKEN) private db: DrizzleDB
  ) {}

  private hashPassword(pwd: string): string {
    return crypto.createHash('sha256').update(String(pwd || '')).digest('hex')
  }

  private async getAdminPasswordHash(): Promise<string> {
    const row = await this.db
      .select()
      .from(schema.globalConfig)
      .where(eq(schema.globalConfig.key, 'adminPasswordHash'))
      .get()
    return row?.value ? String(row.value) : ''
  }

  private async setAdminPasswordHash(hash: string): Promise<void> {
    await this.db
      .insert(schema.globalConfig)
      .values({ key: 'adminPasswordHash', value: hash as any })
      .onConflictDoUpdate({
        target: schema.globalConfig.key,
        set: { value: hash as any }
      })
  }

  async login(password: string): Promise<{ token: string }> {
    const input = String(password || '')
    const storedHash = await this.getAdminPasswordHash()
    let ok = false

    if (storedHash) {
      ok = this.hashPassword(input) === storedHash
    } else {
      ok = input === this.configService.get<string>('app.adminPassword', 'admin')
    }

    if (!ok) {
      throw new UnauthorizedException('密码错误')
    }

    const payload = { sub: 'admin', role: 'admin' as const }
    const token = this.jwtService.sign(payload)
    return { token }
  }

  async validate(): Promise<{ valid: boolean }> {
    return { valid: true }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 4) {
      throw new BadRequestException('新密码长度至少为 4 位')
    }

    const storedHash = await this.getAdminPasswordHash()
    const ok = storedHash
      ? this.hashPassword(oldPassword) === storedHash
      : oldPassword === this.configService.get<string>('app.adminPassword', 'admin')

    if (!ok) {
      throw new BadRequestException('原密码错误')
    }

    await this.setAdminPasswordHash(this.hashPassword(newPassword))
  }
}
