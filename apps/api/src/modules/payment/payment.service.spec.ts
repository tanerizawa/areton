import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PrismaService } from '@/config/prisma.service';
import { RedisService } from '@/config/redis.service';
import { XenditService } from './xendit.service';
import { CryptoPaymentService } from './crypto-payment.service';
import { DokuService } from './doku.service';
import { WebhookEventService } from './webhook-event.service';
import { EmailService } from '@modules/notification/email.service';
import { Prisma } from '@prisma/client';

describe('PaymentService', () => {
  let service: PaymentService;

  const mockPrisma: any = {
    booking: { findUnique: jest.fn(), update: jest.fn() },
    payment: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    withdrawal: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    del: jest.fn(),
    getClient: jest.fn().mockReturnValue({ ttl: jest.fn() }),
  };

  const mockXendit = {
    createInvoice: jest.fn(),
  };

  const mockCrypto = {
    createInvoice: jest.fn(),
  };

  const mockDoku = {
    createInvoice: jest.fn(),
  };

  const mockEmail = {
    sendPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
  };

  const mockWebhookEvents = {
    claim: jest.fn().mockResolvedValue({ firstSeen: true, recordId: 'wh-1' }),
    markProcessed: jest.fn().mockResolvedValue(undefined),
    markIgnored: jest.fn().mockResolvedValue(undefined),
    markRejected: jest.fn().mockResolvedValue(undefined),
  };

  const baseBooking = {
    id: 'booking-1',
    clientId: 'client-1',
    escortId: 'escort-1',
    status: 'CONFIRMED',
    totalAmount: new Prisma.Decimal(2000000),
    serviceType: 'COMPANION',
    payment: null,
    client: { id: 'client-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', phone: '08123456789' },
    escort: { id: 'escort-1', firstName: 'Jane', lastName: 'Smith' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: XenditService, useValue: mockXendit },
        { provide: CryptoPaymentService, useValue: mockCrypto },
        { provide: DokuService, useValue: mockDoku },
        { provide: WebhookEventService, useValue: mockWebhookEvents },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  describe('create', () => {
    const dto = {
      bookingId: 'booking-1',
      method: 'doku_va',
      paymentType: 'FULL',
      tipAmount: 0,
    };

    it('should create a DOKU payment successfully', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
      mockDoku.createInvoice.mockResolvedValue({
        orderId: 'ARETON-booking-1',
        transactionId: 'doku-txn-1',
        redirectUrl: 'https://doku.com/pay',
        invoiceUrl: 'https://doku.com/invoice',
        expiryDate: new Date().toISOString(),
      });
      mockPrisma.payment.upsert.mockResolvedValue({
        id: 'payment-1',
        bookingId: 'booking-1',
        status: 'PENDING',
        method: 'doku_va',
      });

      const result = await service.create('client-1', dto as any);

      expect(result).toBeDefined();
      expect(mockDoku.createInvoice).toHaveBeenCalledTimes(1);
      expect(mockPrisma.payment.upsert).toHaveBeenCalledTimes(1);
    });

    it('should create a crypto payment successfully', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
      mockCrypto.createInvoice.mockResolvedValue({
        orderId: 'ARETON-booking-1',
        transactionId: 'crypto-txn-1',
        invoiceUrl: 'https://nowpayments.io/pay',
        payCurrency: 'btc',
        payAmount: 0.005,
      });
      mockPrisma.payment.upsert.mockResolvedValue({
        id: 'payment-1',
        bookingId: 'booking-1',
        status: 'PENDING',
        method: 'crypto_btc',
      });

      const result = await service.create('client-1', { ...dto, method: 'crypto_btc' } as any);

      expect(result).toBeDefined();
      expect(mockCrypto.createInvoice).toHaveBeenCalledTimes(1);
    });

    it('should create a Xendit payment for non-doku non-crypto methods', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
      mockXendit.createInvoice.mockResolvedValue({
        orderId: 'ARETON-booking-1',
        transactionId: 'xendit-txn-1',
        redirectUrl: 'https://xendit.co/pay',
        invoiceUrl: 'https://xendit.co/invoice',
        paymentType: 'bank_transfer',
        expiryDate: new Date().toISOString(),
      });
      mockPrisma.payment.upsert.mockResolvedValue({
        id: 'payment-1',
        bookingId: 'booking-1',
        status: 'PENDING',
        method: 'bca_va',
      });

      const result = await service.create('client-1', { ...dto, method: 'bca_va' } as any);

      expect(result).toBeDefined();
      expect(mockXendit.createInvoice).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if booking not found', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.create('client-1', dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the client', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);

      await expect(service.create('other-user', dto as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw if payment already processed', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        payment: { status: 'ESCROW' },
      });

      await expect(service.create('client-1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if booking not CONFIRMED', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: 'PENDING',
      });

      await expect(service.create('client-1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if DOKU gateway fails', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
      mockDoku.createInvoice.mockRejectedValue(new Error('DOKU gateway unavailable'));

      await expect(service.create('client-1', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if crypto gateway fails', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
      mockCrypto.createInvoice.mockRejectedValue(new Error('NOWPayments unavailable'));

      await expect(service.create('client-1', { ...dto, method: 'crypto' } as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if Xendit gateway fails', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
      mockXendit.createInvoice.mockRejectedValue(new Error('Xendit unavailable'));

      await expect(service.create('client-1', { ...dto, method: 'bca_va' } as any)).rejects.toThrow(BadRequestException);
    });

    it('should support DP_50 payment type', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(baseBooking);
      mockDoku.createInvoice.mockResolvedValue({
        orderId: 'ARETON-booking-1',
        transactionId: 'doku-txn-1',
        redirectUrl: 'https://doku.com/pay',
        invoiceUrl: 'https://doku.com/invoice',
        expiryDate: new Date().toISOString(),
      });
      mockPrisma.payment.upsert.mockResolvedValue({
        id: 'payment-1',
        bookingId: 'booking-1',
        status: 'PENDING',
        paymentType: 'DP_50',
      });

      const result = await service.create('client-1', { ...dto, paymentType: 'DP_50' } as any);

      expect(result).toBeDefined();
      // Verify amount charged is 50% for DP
      const callArgs = mockDoku.createInvoice.mock.calls[0][0];
      expect(callArgs.amount).toBe(1000000); // 50% of 2,000,000
    });
  });
});
