import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

// Optional Sentry integration — loaded lazily
let sentryModule: any = null;
try {
  sentryModule = require('@sentry/node');
} catch {
  // @sentry/node not installed — will skip error capture
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as any;
        message = res.message || res.error || message;
        errors = res.errors || (Array.isArray(res.message) ? res.message : undefined);
        if (Array.isArray(message)) {
          errors = message;
          message = 'Validation failed';
        }
      }

      // Log validation errors with request body for debugging
      if (status === 400) {
        this.logger.warn(`400 on ${request.method} ${request.url}: msg=${JSON.stringify(message)} errors=${JSON.stringify(errors)} body=${JSON.stringify(request.body)}`);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);

      // Capture unhandled errors in Sentry (500s only)
      if (sentryModule) {
        sentryModule.withScope((scope: any) => {
          scope.setTag('url', request.url);
          scope.setTag('method', request.method);
          scope.setExtra('body', request.body);
          scope.setExtra('query', request.query);
          sentryModule.captureException(exception);
        });
      }
    }

    const correlationId =
      (request as any).correlationId ||
      request.get('x-correlation-id') ||
      request.get('x-request-id');

    const errorResponse = {
      success: false,
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
    };

    response.status(status).json(errorResponse);
  }
}
