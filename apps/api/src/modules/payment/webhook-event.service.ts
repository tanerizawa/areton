import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/config/prisma.service';

export type WebhookProvider = 'xendit' | 'doku' | 'nowpayments';

export interface WebhookIdempotencyResult {
  /** True if this is the first time we see the event. Act on it. */
  firstSeen: boolean;
  /** Internal row id (for follow-up updates). */
  recordId: string;
}

/**
 * Tracks webhook deliveries so that we can make processing idempotent.
 * Payment gateways routinely retry webhooks — without dedup we would apply
 * status transitions multiple times, which can break escrow/refund accounting.
 */
@Injectable()
export class WebhookEventService {
  private readonly logger = new Logger(WebhookEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claim (provider, eventId) for processing. If this is a duplicate, we
   * return { firstSeen: false } and callers should skip side effects.
   *
   * `eventId` should be the gateway's own event id when provided. When the
   * gateway does not supply one, pass a deterministic fallback (e.g. a hash
   * of the payload + their invoice id) so that retries of the same message
   * are still deduplicated.
   */
  async claim(
    provider: WebhookProvider,
    eventId: string,
    rawPayload: unknown,
  ): Promise<WebhookIdempotencyResult> {
    try {
      const created = await this.prisma.webhookEvent.create({
        data: {
          provider,
          eventId,
          rawPayload: rawPayload as any,
        },
        select: { id: true },
      });
      return { firstSeen: true, recordId: created.id };
    } catch (err: any) {
      // Unique constraint violation on (provider, eventId) → duplicate.
      if (err?.code === 'P2002') {
        const existing = await this.prisma.webhookEvent.findUnique({
          where: { provider_eventId: { provider, eventId } },
          select: { id: true },
        });
        if (existing) {
          this.logger.log(
            `Duplicate webhook suppressed: provider=${provider} eventId=${eventId}`,
          );
          return { firstSeen: false, recordId: existing.id };
        }
      }
      // Anything else is an actual DB problem — surface it so the provider
      // retries (they will, which is why dedup exists).
      throw err;
    }
  }

  async markProcessed(recordId: string, notes?: string): Promise<void> {
    await this.prisma.webhookEvent
      .update({
        where: { id: recordId },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          notes: notes?.slice(0, 500),
        },
      })
      .catch((err) => {
        // Never throw from bookkeeping.
        this.logger.warn(`Failed to mark webhook ${recordId} processed: ${err?.message}`);
      });
  }

  async markIgnored(recordId: string, reason: string): Promise<void> {
    await this.prisma.webhookEvent
      .update({
        where: { id: recordId },
        data: { status: 'IGNORED', processedAt: new Date(), notes: reason.slice(0, 500) },
      })
      .catch(() => undefined);
  }

  async markRejected(recordId: string, reason: string): Promise<void> {
    await this.prisma.webhookEvent
      .update({
        where: { id: recordId },
        data: { status: 'REJECTED', processedAt: new Date(), notes: reason.slice(0, 500) },
      })
      .catch(() => undefined);
  }

  /**
   * Deterministic fallback id for gateways that don't embed one in their
   * payload. Using SHA-256 keeps it short and collision-resistant.
   */
  static fallbackEventId(parts: Array<string | undefined | null>): string {
    const hasher = createHash('sha256');
    hasher.update(parts.filter(Boolean).join('|'));
    return `fallback:${hasher.digest('hex').slice(0, 32)}`;
  }
}
