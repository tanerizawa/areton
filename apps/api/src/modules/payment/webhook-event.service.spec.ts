import { Test, TestingModule } from '@nestjs/testing';
import { WebhookEventService } from './webhook-event.service';
import { PrismaService } from '@/config/prisma.service';

describe('WebhookEventService', () => {
  let service: WebhookEventService;

  const mockPrisma: any = {
    webhookEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookEventService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(WebhookEventService);
  });

  it('claim() returns firstSeen=true on successful insert', async () => {
    mockPrisma.webhookEvent.create.mockResolvedValue({ id: 'wh-1' });
    const result = await service.claim('xendit', 'evt-123', { foo: 1 });
    expect(result).toEqual({ firstSeen: true, recordId: 'wh-1' });
  });

  it('claim() dedupes on unique constraint violation (P2002)', async () => {
    mockPrisma.webhookEvent.create.mockRejectedValue({ code: 'P2002' });
    mockPrisma.webhookEvent.findUnique.mockResolvedValue({ id: 'wh-existing' });
    const result = await service.claim('xendit', 'evt-123', { foo: 1 });
    expect(result).toEqual({ firstSeen: false, recordId: 'wh-existing' });
  });

  it('fallbackEventId() returns a deterministic id from parts', () => {
    const a = WebhookEventService.fallbackEventId(['xendit', 'order-1', 'PAID']);
    const b = WebhookEventService.fallbackEventId(['xendit', 'order-1', 'PAID']);
    const c = WebhookEventService.fallbackEventId(['xendit', 'order-2', 'PAID']);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.startsWith('fallback:')).toBe(true);
  });
});
