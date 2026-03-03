import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { Catch, HttpException, HttpStatus } from '@nestjs/common'

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, any>
        message = resp.message || resp.error || message
        if (Array.isArray(message)) {
          message = message.join('; ')
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || message
      // Soft runtime errors get 200 with error info
      if (message === '账号未运行' || message === 'API Timeout') {
        response.status(200).json({
          code: 200,
          message,
          data: null
        })
        return
      }
    }

    response.status(status).json({
      code: status,
      message,
      data: null
    })
  }
}
