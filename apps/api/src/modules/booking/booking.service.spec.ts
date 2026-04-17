import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { BookingService } from './booking.service';
import { PrismaService } from '@/config/prisma.service';
import { RedisService } from '@/config/redis.service';
import { NotificationService } from '@modules/notification/notification.service';
import { EncryptionService } from '@common/services/encryption.service';

describe('BookingService', () => {
  let service: BookingService;
  let prisma: jest.Mocked<PrismaService>;
  let redis: jest.Mocked<RedisService>;

  const mockPrisma: any = {
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    booking: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    escortProfile: { findUnique: jest.fn() },
    payment: { upsert: jest.fn(), updateMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    otp: { deleteMany: jest.fn() },
    refundClaim: { create: jest.fn() },
    // Transaction executes the callback with a tx that is just the same mock
    // object — sufficient for unit tests that exercise the orchestration
    // logic without a real PG backend.
    $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    // Advisory-lock raw call is a no-op in tests.
    $executeRaw: jest.fn().mockResolvedValue(1),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    getClient: jest.fn().mockReturnValue({ ttl: jest.fn() }),
    getJSON: jest.fn(),
  };

  const mockNotification = {
    notifyBookingStatus: jest.fn().mockResolvedValue(undefined),
    notifyAdmins: jest.fn().mockResolvedValue(undefined),
  };

  const mockEncryption = {
    encrypt: jest.fn((v: string) => v),
    decrypt: jest.fn((v: string) => v),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: NotificationService, useValue: mockNotification },
        { provide: EncryptionService, useValue: mockEncryption },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
  });

  describe('create', () => {
    const clientId = 'client-1';
    const dto = {
      escortId: 'escort-1',
      serviceType: 'COMPANION',
      startTime: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      endTime: new Date(Date.now() + 86400000 + 4 * 3600000).toISOString(), // +4 hours
      location: 'Jakarta',
      specialRequests: 'None',
    };

    const mockEscort = {
      id: 'escort-1',
      role: 'ESCORT',
      isActive: true,
      escortProfile: {
        isApproved: true,
        // Booking service constructs Prisma.Decimal from this; feed a plain
        // number which Prisma.Decimal accepts.
        hourlyRate: 500000 as any,
      },
    };

    it('should create a booking successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockEscort);
      mockPrisma.booking.findFirst.mockResolvedValue(null); // no overlap
      mockPrisma.booking.create.mockResolvedValue({
        id: 'booking-1',
        clientId,
        escortId: dto.escortId,
        status: 'PENDING',
        totalAmount: { toNumber: () => 2000000 },
      });

      const result = await service.create(clientId, dto as any);

      expect(result).toBeDefined();
      expect(result.id).toBe('booking-1');
      expect(mockPrisma.booking.create).toHaveBeenCalledTimes(1);
      expect(mockNotification.notifyBookingStatus).toHaveBeenCalledWith('booking-1', 'PENDING');
    });

    it('should throw if escort not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.escortProfile.findUnique.mockResolvedValue(null);

      await expect(service.create(clientId, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if escort is not approved', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockEscort,
        escortProfile: { ...mockEscort.escortProfile, isApproved: false },
      });

      await expect(service.create(clientId, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if client books themselves', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockEscort);

      await expect(service.create('escort-1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if duration < 3 hours', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockEscort);
      const shortDto = {
        ...dto,
        endTime: new Date(Date.now() + 86400000 + 3600000).toISOString(), // +1 hour only
      };

      await expect(service.create(clientId, shortDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if time slot overlaps', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockEscort);
      mockPrisma.booking.findFirst.mockResolvedValue({ id: 'existing-booking' });

      await expect(service.create(clientId, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if start time is in the past', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockEscort);
      const pastDto = {
        ...dto,
        startTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        endTime: new Date(Date.now() + 3600000 * 4).toISOString(),
      };

      await expect(service.create(clientId, pastDto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('accept', () => {
    it('should accept a PENDING booking', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        escortId: 'escort-1',
        status: 'PENDING',
        totalAmount: { toNumber: () => 2000000, mul: jest.fn().mockReturnValue({ toNumber: () => 400000 }), sub: jest.fn().mockReturnValue({ toNumber: () => 1600000 }) },
      });
      mockRedis.get.mockResolvedValue(null); // default commission rate
      mockPrisma.booking.update.mockResolvedValue({ id: 'booking-1', status: 'CONFIRMED' });
      mockPrisma.payment.upsert.mockResolvedValue({});

      const result = await service.accept('escort-1', 'booking-1');

      expect(result.status).toBe('CONFIRMED');
      expect(mockPrisma.payment.upsert).toHaveBeenCalledTimes(1);
    });

    it('should throw if booking not found', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.accept('escort-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw if not the assigned escort', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        escortId: 'other-escort',
        status: 'PENDING',
      });

      await expect(service.accept('escort-1', 'booking-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw if booking is not PENDING', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        escortId: 'escort-1',
        status: 'CONFIRMED',
      });

      await expect(service.accept('escort-1', 'booking-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('checkin', () => {
    it('should throw if payment not in ESCROW', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        clientId: 'client-1',
        escortId: 'escort-1',
        status: 'CONFIRMED',
        payment: { status: 'PENDING' },
      });

      await expect(service.checkin('client-1', 'booking-1')).rejects.toThrow(BadRequestException);
    });
  });
});
