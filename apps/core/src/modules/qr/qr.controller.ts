import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { QRLoginService } from '../../game/services/qrlogin.worker'

@Controller('qr')
export class QrController {
  constructor(private qrLogin: QRLoginService) {}

  @Public()
  @Post('create')
  async create() {
    return this.qrLogin.requestMiniProgramLoginCode()
  }

  @Public()
  @Post('check')
  async check(@Body('code') code: string) {
    if (!code)
      throw new BadRequestException('缺少 code')

    const result = await this.qrLogin.queryMiniProgramStatus(code)

    if (result.status === 'OK') {
      const ticket = result.ticket
      const uin = result.uin || ''
      const nickname = result.nickname || ''
      const authCode = await this.qrLogin.getMiniProgramAuthCode(ticket!, '1112386029')
      const avatar = uin ? `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640` : ''
      return { status: 'OK', code: authCode, uin, avatar, nickname }
    }
    if (result.status === 'Used')
      return { status: 'Used' }
    if (result.status === 'Wait')
      return { status: 'Wait' }
    return { status: 'Error', error: (result as any).msg }
  }
}
