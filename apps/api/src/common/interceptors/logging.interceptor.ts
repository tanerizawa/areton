import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const userId = request.user?.id || 'anonymous';
    const now = Date.now();

    // Correlation ID: reuse incoming header (x-correlation-id or x-request-id)
    // so correlation propagates across LB/reverse-proxy hops; otherwise mint
    // a fresh UUID. We reflect it back under both headers to ease tracing
    // from either naming convention.
    const correlationId =
      request.get('x-correlation-id') || request.get('x-request-id') || randomUUID();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    response.setHeader('x-request-id', correlationId);

    return next.handle().pipe(
      tap({
        next: () => {
          const { statusCode } = response;
          const duration = Date.now() - now;
          this.logger.log(
            `${method} ${url} ${statusCode} ${duration}ms — user:${userId} ip:${ip} cid:${correlationId} ua:${userAgent.substring(0, 50)}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          this.logger.error(
            `${method} ${url} ${error.status || 500} ${duration}ms — user:${userId} ip:${ip} cid:${correlationId} — ${error.message}`,
          );
        },
      }),
    );
  }
}
