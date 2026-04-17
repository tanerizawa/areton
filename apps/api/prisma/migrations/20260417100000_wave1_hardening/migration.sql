-- Wave 1 hardening: webhook idempotency table, BookingStatus.EXPIRED,
-- and hot-path composite indexes.

-- 1) Add EXPIRED to BookingStatus (append a new enum value).
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- 2) Composite indexes for hot-path queries.
CREATE INDEX IF NOT EXISTS "bookings_escortId_status_startTime_idx"
    ON "bookings" ("escortId", "status", "startTime");

CREATE INDEX IF NOT EXISTS "payments_status_createdAt_idx"
    ON "payments" ("status", "createdAt");

-- 3) Webhook idempotency table. We store raw payloads (as JSONB) to ease
--    manual replays, and enforce UNIQUE(provider, eventId) so duplicate
--    deliveries become no-ops.
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "rawPayload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "notes" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_eventId_key"
    ON "webhook_events" ("provider", "eventId");

CREATE INDEX IF NOT EXISTS "webhook_events_provider_receivedAt_idx"
    ON "webhook_events" ("provider", "receivedAt");
