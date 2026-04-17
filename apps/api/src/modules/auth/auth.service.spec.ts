import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/config/prisma.service';
import { RedisService } from '@/config/redis.service';
import { AuditService } from '@/common/services/audit.service';
import { EmailService } from '@modules/notification/email.service';
import { NotificationService } from '@modules/notification/notification.service';
import { AppleAuthService } from './services/apple-auth.service';

/**
 * These tests lock in the Wave 1 security posture:
 *   - forgotPassword never leaks whether an email is registered;
 *   - reset tokens are stored hashed in Redis so a Redis leak is not enough
 *     to compromise an in-flight reset.
 */
describe('AuthService — password reset hardening', () => {
  let service: AuthService;

  const mockPrisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };

  const mockJwt: any = { signAsync: jest.fn(), verify: jest.fn() };

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'app.nodeEnv') return 'development';
      if (key === 'app.webUrl') return 'http://localhost:3000';
      return undefined;
    }),
  };

  const mockRedis: any = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockAudit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const mockEmail: any = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
  const mockNotification: any = { notifyAdmins: jest.fn() };
  const mockApple: any = { verifyIdToken: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: mockAudit },
        { provide: EmailService, useValue: mockEmail },
        { provide: NotificationService, useValue: mockNotification },
        { provide: AppleAuthService, useValue: mockApple },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('forgotPassword returns a generic message when the email does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await service.forgotPassword({ email: 'ghost@example.com' });

    expect(result).toEqual({
      message: 'Jika email terdaftar, tautan reset sudah dikirim.',
    });
    // We must NOT have touched Redis or the email service for an unknown email.
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(mockEmail.sendPasswordReset).not.toHaveBeenCalled();
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PASSWORD_RESET_REQUESTED_UNKNOWN_EMAIL',
      }),
    );
  });

  it('forgotPassword stores a hashed token (raw token never appears as a Redis key)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'u@example.com',
      firstName: 'U',
    });

    const result = await service.forgotPassword({ email: 'u@example.com' });

    expect(mockEmail.sendPasswordReset).toHaveBeenCalled();
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const [redisKey, value] = mockRedis.set.mock.calls[0];
    // Stored key must be the sha256 hash prefix — not the raw token.
    expect(redisKey).toMatch(/^pwd_reset:[a-f0-9]{64}$/);
    expect(redisKey).not.toContain(result.resetToken!);
    // The raw reset token is only exposed in dev for QA purposes.
    expect(result.resetToken).toMatch(/^[a-f0-9]{64}$/);
    // Stored value should NOT contain the email either.
    expect(value).toBe(JSON.stringify({ userId: 'user-1' }));
  });
});
