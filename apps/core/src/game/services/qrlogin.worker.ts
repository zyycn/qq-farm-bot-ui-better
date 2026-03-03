import { Buffer } from 'node:buffer'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import { CookieUtils, HashUtils } from '../utils'

const ChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface QRPreset {
  name: string
  description: string
  aid: string
  daid: string
  redirectUri: string
  referrer: string
}

interface MiniProgramPreset {
  name: string
  description: string
  appid: string
}

const QR_PRESETS: Record<string, QRPreset> = {
  vip: {
    name: 'QQ会员 (VIP)',
    description: 'QQ会员官网',
    aid: '8000201',
    daid: '18',
    redirectUri: 'https://vip.qq.com/loginsuccess.html',
    referrer: 'https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=8000201&style=20&s_url=https%3A%2F%2Fvip.qq.com%2Floginsuccess.html&maskOpacity=60&daid=18&target=self'
  },
  qzone: {
    name: 'QQ空间 (QZone)',
    description: 'QQ空间网页版',
    aid: '549000912',
    daid: '5',
    redirectUri: 'https://qzs.qzone.qq.com/qzone/v5/loginsucc.html?para=izone',
    referrer: 'https://qzone.qq.com/'
  }
}

const _MINI_PROGRAM_PRESETS: Record<string, MiniProgramPreset> = {
  farm: { name: 'QQ经典农场 (Farm)', description: 'QQ经典农场小程序', appid: '1112386029' }
}

export class QRLoginService {
  private logger = new Logger('QRLogin')

  async requestQRCode(presetKey = 'vip') {
    const config = QR_PRESETS[presetKey] || QR_PRESETS.vip
    const params = new URLSearchParams({
      appid: config.aid,
      e: '2',
      l: 'M',
      s: '3',
      d: '72',
      v: '4',
      t: String(Math.random()),
      daid: config.daid,
      u1: config.redirectUri
    })
    const url = `https://ssl.ptlogin2.qq.com/ptqrshow?${params.toString()}`
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'Referer': config.referrer || 'https://xui.ptlogin2.qq.com/', 'User-Agent': ChromeUA }
    })
    const setCookie = response.headers['set-cookie'] || null
    const qrsig = CookieUtils.getValue(setCookie, 'qrsig')
    const qrcodeBase64 = Buffer.from(response.data).toString('base64')
    return { qrsig, qrcode: `data:image/png;base64,${qrcodeBase64}`, url }
  }

  async checkQRStatus(qrsig: string, presetKey = 'vip') {
    const config = QR_PRESETS[presetKey] || QR_PRESETS.vip
    const ptqrtoken = HashUtils.hash(qrsig)
    const params = new URLSearchParams({
      ptqrtoken: String(ptqrtoken),
      from_ui: '1',
      aid: config.aid,
      daid: config.daid,
      action: `0-0-${Date.now()}`,
      pt_uistyle: '40',
      js_ver: '21020514',
      js_type: '1',
      u1: config.redirectUri
    })
    const api = `https://ssl.ptlogin2.qq.com/ptqrlogin?${params.toString()}`
    const response = await axios.get(api, {
      headers: { 'Cookie': `qrsig=${qrsig}`, 'Referer': config.referrer || 'https://xui.ptlogin2.qq.com/', 'User-Agent': ChromeUA }
    })
    const text = response.data
    const match = text.match(/ptuiCB\((.+)\)/)
    if (!match)
      throw new Error('Invalid response format')
    const args: string[] = []
    const argMatcher = /'([^']*)'/g
    for (let m = argMatcher.exec(match[1]); m !== null; m = argMatcher.exec(match[1])) args.push(m[1])
    const [ret, , jumpUrl, , msg, nickname] = args
    return { ret, msg, nickname, jumpUrl, cookie: response.headers['set-cookie'] }
  }

  async requestMiniProgramLoginCode() {
    const QUA = 'V1_HT5_QDT_0.70.2209190_x64_0_DEV_D'
    const headers = { 'qua': QUA, 'host': 'q.qq.com', 'accept': 'application/json', 'content-type': 'application/json', 'user-agent': ChromeUA }
    const response = await axios.get('https://q.qq.com/ide/devtoolAuth/GetLoginCode', { headers })
    const { code, data } = response.data
    if (+code !== 0)
      throw new Error('获取登录码失败')
    const loginCode = data.code || ''
    const loginUrl = `https://h5.qzone.qq.com/qqq/code/${loginCode}?_proxy=1&from=ide`
    let QRCode: any
    try {
      QRCode = (await import('qrcode'))
    } catch {
      QRCode = null
    }
    const image = QRCode ? await QRCode.toDataURL(loginUrl, { width: 300, margin: 1, errorCorrectionLevel: 'M' }) : loginUrl
    return { code: loginCode, url: loginUrl, image }
  }

  async queryMiniProgramStatus(loginCode: string) {
    const QUA = 'V1_HT5_QDT_0.70.2209190_x64_0_DEV_D'
    const headers = { 'qua': QUA, 'host': 'q.qq.com', 'accept': 'application/json', 'content-type': 'application/json', 'user-agent': ChromeUA }
    const response = await axios.get(`https://q.qq.com/ide/devtoolAuth/syncScanSateGetTicket?code=${loginCode}`, { headers })
    if (response.status !== 200)
      return { status: 'Error' as const }
    const { code, data } = response.data
    if (+code === 0) {
      if (+data.ok !== 1)
        return { status: 'Wait' as const }
      return { status: 'OK' as const, ticket: data.ticket, uin: data.uin, nickname: data.nick || '' }
    }
    if (+code === -10003)
      return { status: 'Used' as const }
    return { status: 'Error' as const, msg: `Code: ${code}` }
  }

  async getMiniProgramAuthCode(ticket: string, appid = '1112386029') {
    const QUA = 'V1_HT5_QDT_0.70.2209190_x64_0_DEV_D'
    const headers = { 'qua': QUA, 'host': 'q.qq.com', 'accept': 'application/json', 'content-type': 'application/json', 'user-agent': ChromeUA }
    try {
      const response = await axios.post('https://q.qq.com/ide/login', { appid, ticket }, { headers })
      return response.status === 200 ? (response.data.code || '') : ''
    } catch { return '' }
  }
}
