import process from 'node:process'
import { Body, Controller, Get, Post } from '@nestjs/common'
import pkg from '../../../package.json'
import { Public } from '../../common/decorators/public.decorator'
import { AuthService } from './auth.service'

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body('password') password: string) {
    return this.authService.login(password)
  }

  @Get('auth/validate')
  async validate() {
    return this.authService.validate()
  }

  @Post('admin/change-password')
  async changePassword(
    @Body('oldPassword') oldPassword: string,
    @Body('newPassword') newPassword: string
  ) {
    await this.authService.changePassword(oldPassword, newPassword)
    return null
  }

  @Post('logout')
  async logout() {
    return null
  }

  @Get('ping')
  async ping() {
    return { ok: true, uptime: process.uptime(), version: pkg.version }
  }
}
