import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '@/config/prisma.service';
import { RedisService } from '@/config/redis.service';
import { AuditService } from '@/common/services/audit.service';
import { EmailService } from '@modules/notification/email.service';
import { NotificationService } from '@modules/notification/notification.service';
import { AppleAuthService } from './services/apple-auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
    private readonly appleAuth: AppleAuthService,
  ) {}

  async register(dto: RegisterDto) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role || 'CLIENT',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    // If registering as escort, create escort profile with submitted data
    if (dto.role === 'ESCORT') {
      await this.prisma.escortProfile.create({
        data: {
          userId: user.id,
          bio: dto.bio || null,
          hourlyRate: dto.hourlyRate || 0,
          languages: dto.languages || [],
          skills: dto.skills || [],
          portfolioUrls: dto.portfolioUrls || [],
        },
      });

      // Notify admins of new escort registration
      this.notificationService.notifyAdmins(
        'Escort Baru Mendaftar',
        `${user.firstName} ${user.lastName} mendaftar sebagai escort dan menunggu verifikasi profil.`,
        'SYSTEM',
        { link: '/escorts/pending' },
      ).catch(() => {});
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.role);

    // Send email verification (fire & forget)
    this.sendVerificationEmail(user.id, user.email, user.firstName).catch((err) => {
      this.logger.error(`Failed to send verification email to ${user.email}: ${err?.message}`);
    });

    return {
      user,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    // Check account lockout
    const lockKey = `login_lock:${dto.email}`;
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      throw new UnauthorizedException('Akun terkunci sementara. Coba lagi dalam 15 menit.');
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      // Track failed attempts
      const attemptKey = `login_attempts:${dto.email}`;
      const attempts = parseInt(await this.redis.get(attemptKey) || '0') + 1;
      await this.redis.set(attemptKey, String(attempts), 900); // 15 min window
      if (attempts >= 5) {
        await this.redis.set(lockKey, '1', 900); // Lock for 15 min
        await this.audit.log({
          userId: user.id,
          action: 'ACCOUNT_LOCKED',
          resource: 'auth',
          severity: 'WARN',
          details: { reason: 'too_many_failed_logins', attempts },
        });
      }
      // Audit failed login
      await this.audit.log({
        userId: user.id,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        severity: 'WARN',
        details: { reason: 'invalid_password', attempt: attempts },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failed attempts on success
    await this.redis.del(`login_attempts:${dto.email}`);
    await this.redis.del(lockKey);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // Return partial response — client must verify 2FA
      const tempToken = await this.jwt.signAsync(
        { sub: user.id, purpose: '2fa-verify' },
        { secret: this.config.get('jwt.accessSecret'), expiresIn: '5m' },
      );
      return {
        requires2FA: true,
        tempToken,
        user: { id: user.id, email: user.email },
      };
    }

    // Audit login
    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      resource: 'auth',
      severity: 'INFO',
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profilePhoto: user.profilePhoto,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });

      // Check if token is blacklisted
      const isBlacklisted = await this.redis.exists(`bl_refresh:${refreshToken}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Blacklist old refresh token (rotation)
      await this.redis.set(`bl_refresh:${refreshToken}`, '1', 7 * 24 * 60 * 60);

      // Generate new tokens
      return this.generateTokens(payload.sub, payload.role);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string) {
    // Blacklist the refresh token
    await this.redis.set(`bl_refresh:${refreshToken}`, '1', 7 * 24 * 60 * 60);
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    // Anti-enumeration: always return the same generic success message,
    // regardless of whether the email exists. Attackers must not be able to
    // distinguish registered vs. unregistered emails via this endpoint.
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const isDev = this.config.get('app.nodeEnv') === 'development';
    const genericResponse: { message: string; resetToken?: string } = {
      message: 'Jika email terdaftar, tautan reset sudah dikirim.',
    };

    if (!user) {
      // Still audit the attempt for abuse monitoring, but do not reveal it.
      await this.audit.log({
        action: 'PASSWORD_RESET_REQUESTED_UNKNOWN_EMAIL',
        resource: 'auth',
        severity: 'WARN',
        details: { email: dto.email },
      });
      return genericResponse;
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');

    // Store token in Redis with 1 hour expiry. We key on a SHA-256 hash of the
    // token instead of the raw token so that a Redis snapshot leak does not
    // directly reveal valid reset tokens.
    const tokenKey = this.hashResetToken(resetToken);
    await this.redis.set(
      `pwd_reset:${tokenKey}`,
      JSON.stringify({ userId: user.id }),
      60 * 60,
    );

    const frontendUrl = this.config.get('app.webUrl') || 'https://areton.id';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    this.emailService
      .sendPasswordReset(user.email, {
        name: user.firstName || 'User',
        resetUrl,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to send password reset email to ${user.email}: ${err?.message}`,
        );
      });

    if (isDev) {
      // Only expose the token in dev for local QA.
      genericResponse.resetToken = resetToken;
    }

    return genericResponse;
  }

  private hashResetToken(token: string): string {
    // SHA-256 is enough here: the reset token has 256 bits of entropy
    // (randomBytes(32)), so pre-image resistance is not an issue.
    const { createHash } = require('crypto');
    return createHash('sha256').update(token).digest('hex');
  }

  async resetPassword(dto: ResetPasswordDto) {
    // Token is stored hashed in Redis (see `forgotPassword`).
    const tokenKey = this.hashResetToken(dto.token);
    const tokenData = await this.redis.get(`pwd_reset:${tokenKey}`);

    if (!tokenData) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const { userId } = JSON.parse(tokenData);

    // Hash new password
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Delete used token
    await this.redis.del(`pwd_reset:${tokenKey}`);

    // Invalidate all existing sessions by incrementing a version counter
    await this.redis.set(
      `pwd_version:${userId}`,
      Date.now().toString(),
      30 * 24 * 60 * 60,
    );

    await this.audit.log({
      userId,
      action: 'PASSWORD_RESET_COMPLETED',
      resource: 'auth',
      severity: 'INFO',
    });

    return { message: 'Password has been reset successfully' };
  }

  // ── 2FA TOTP Management (P6-BE-08) ─────────────────

  async setup2FA(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA sudah aktif');
    }

    // Generate TOTP secret (base32 compatible)
    const secret = this.generateTOTPSecret();

    // Store secret temporarily in Redis until user verifies
    await this.redis.setJSON(`2fa_setup:${userId}`, { secret }, 600); // 10 min expiry

    // Generate otpauth URL for QR code
    const issuer = 'ARETON.id';
    const otpauthUrl = `otpauth://totp/${issuer}:${user.email}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    return {
      secret,
      otpauthUrl,
      message: 'Scan QR code lalu verifikasi dengan kode 6 digit',
    };
  }

  async verify2FASetup(userId: string, code: string) {
    const setupData = await this.redis.getJSON<{ secret: string }>(`2fa_setup:${userId}`);

    if (!setupData) {
      throw new BadRequestException('Setup 2FA expired. Silakan mulai ulang.');
    }

    const isValid = this.verifyTOTP(setupData.secret, code);
    if (!isValid) {
      throw new BadRequestException('Kode tidak valid');
    }

    // Enable 2FA and store secret
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: setupData.secret,
      },
    });

    // Clean up temp data
    await this.redis.del(`2fa_setup:${userId}`);

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      randomBytes(4).toString('hex').toUpperCase(),
    );
    await this.redis.setJSON(`2fa_backup:${userId}`, backupCodes);

    await this.audit.log({
      userId,
      action: '2FA_ENABLED',
      resource: 'auth',
      severity: 'INFO',
    });

    return {
      message: '2FA berhasil diaktifkan',
      backupCodes,
    };
  }

  async verify2FALogin(tempToken: string, code: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(tempToken, {
        secret: this.config.get('jwt.accessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Token tidak valid atau sudah expired');
    }

    if (payload.purpose !== '2fa-verify') {
      throw new UnauthorizedException('Token tidak valid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.twoFactorSecret) {
      throw new UnauthorizedException('User tidak ditemukan');
    }

    // Try TOTP code first
    let isValid = this.verifyTOTP(user.twoFactorSecret, code);

    // If TOTP fails, try backup codes
    if (!isValid) {
      const backupCodes = await this.redis.getJSON<string[]>(`2fa_backup:${user.id}`);
      if (backupCodes) {
        const codeIndex = backupCodes.indexOf(code.toUpperCase());
        if (codeIndex !== -1) {
          isValid = true;
          // Remove used backup code
          backupCodes.splice(codeIndex, 1);
          await this.redis.setJSON(`2fa_backup:${user.id}`, backupCodes);
        }
      }
    }

    if (!isValid) {
      await this.audit.log({
        userId: user.id,
        action: '2FA_FAILED',
        resource: 'auth',
        severity: 'WARN',
      });
      throw new UnauthorizedException('Kode 2FA tidak valid');
    }

    await this.audit.log({
      userId: user.id,
      action: 'LOGIN_2FA',
      resource: 'auth',
      severity: 'INFO',
    });

    const tokens = await this.generateTokens(user.id, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profilePhoto: user.profilePhoto,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  async disable2FA(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA tidak aktif');
    }

    const isValid = this.verifyTOTP(user.twoFactorSecret, code);
    if (!isValid) {
      throw new BadRequestException('Kode tidak valid');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    await this.redis.del(`2fa_backup:${userId}`);

    await this.audit.log({
      userId,
      action: '2FA_DISABLED',
      resource: 'auth',
      severity: 'WARN',
    });

    return { message: '2FA berhasil dinonaktifkan' };
  }

  async get2FAStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');

    return { twoFactorEnabled: user.twoFactorEnabled };
  }

  // ── TOTP Helpers ─────────────────────────────────────

  private generateTOTPSecret(): string {
    // Generate a random base32 secret (20 bytes = 32 chars in base32)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    const bytes = randomBytes(20);
    for (let i = 0; i < 20; i++) {
      secret += chars[bytes[i] % 32];
    }
    return secret;
  }

  private verifyTOTP(secret: string, code: string): boolean {
    // Support current window and ±1 window (30-sec step). Comparison is done
    // with constant-time equality to avoid leaking timing information about
    // matching digits.
    if (typeof code !== 'string' || code.length !== 6) return false;
    const now = Math.floor(Date.now() / 1000);
    const codeBuf = Buffer.from(code, 'utf8');
    let matched = false;
    for (let i = -1; i <= 1; i++) {
      const counter = Math.floor((now + i * 30) / 30);
      const generated = this.generateTOTPCode(secret, counter);
      const genBuf = Buffer.from(generated, 'utf8');
      if (genBuf.length === codeBuf.length && timingSafeEqual(genBuf, codeBuf)) {
        matched = true;
        // Do not early-return — keep loop iterations constant to avoid a
        // coarse timing signal about which window matched.
      }
    }
    return matched;
  }

  private generateTOTPCode(secret: string, counter: number): string {
    // Decode base32 secret
    const key = this.base32Decode(secret);

    // Counter to 8-byte buffer (big-endian)
    const buffer = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
      buffer[i] = counter & 0xff;
      counter = counter >> 8;
    }

    // HMAC-SHA1
    const hmac = createHmac('sha1', key);
    hmac.update(buffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const code =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    return (code % 1000000).toString().padStart(6, '0');
  }

  private base32Decode(encoded: string): Buffer {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of encoded.toUpperCase()) {
      const val = chars.indexOf(char);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private async generateTokens(userId: string, role: string) {
    const payload = { sub: userId, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.accessSecret'),
        expiresIn: this.config.get('jwt.accessExpiry'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiry'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  // ── Email Verification ─────────────────

  private async sendVerificationEmail(userId: string, email: string, firstName: string) {
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const token = randomBytes(32).toString('hex');

    // Store in Redis with 24h expiry
    await this.redis.set(
      `email_verify:${token}`,
      JSON.stringify({ userId, email, code }),
      24 * 60 * 60,
    );
    // Also store code-based lookup
    await this.redis.set(
      `email_verify_code:${userId}`,
      JSON.stringify({ token, code }),
      24 * 60 * 60,
    );

    const frontendUrl = this.config.get('app.webUrl') || 'https://areton.id';
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    return this.emailService.sendEmailVerification(email, {
      name: firstName,
      verifyUrl,
      code,
    });
  }

  async verifyEmail(token?: string, code?: string, userId?: string) {
    let verifyData: { userId: string; email: string; code: string } | null = null;

    if (token) {
      // Token-based verification (link click)
      const stored = await this.redis.get(`email_verify:${token}`);
      if (!stored) throw new BadRequestException('Token verifikasi tidak valid atau telah kadaluarsa');
      verifyData = JSON.parse(stored);
    } else if (code && userId) {
      // Code-based verification (manual input)
      const stored = await this.redis.get(`email_verify_code:${userId}`);
      if (!stored) throw new BadRequestException('Kode verifikasi telah kadaluarsa. Silakan minta kode baru.');
      const { token: storedToken, code: storedCode } = JSON.parse(stored);
      if (storedCode !== code) throw new BadRequestException('Kode verifikasi salah');
      const tokenData = await this.redis.get(`email_verify:${storedToken}`);
      if (!tokenData) throw new BadRequestException('Token verifikasi telah kadaluarsa');
      verifyData = JSON.parse(tokenData);
      // Clean up the token too
      await this.redis.del(`email_verify:${storedToken}`);
    } else {
      throw new BadRequestException('Token atau kode verifikasi diperlukan');
    }

    // Update user
    await this.prisma.user.update({
      where: { id: verifyData!.userId },
      data: { emailVerifiedAt: new Date() },
    });

    // Clean up Redis
    if (token) await this.redis.del(`email_verify:${token}`);
    await this.redis.del(`email_verify_code:${verifyData!.userId}`);

    // Send welcome email now that email is verified
    this.emailService.sendWelcome(verifyData!.email, {
      name: (await this.prisma.user.findUnique({ where: { id: verifyData!.userId }, select: { firstName: true } }))?.firstName || 'User',
    }).catch((err) => {
      this.logger.error(`Failed to send welcome email to ${verifyData!.email}: ${err?.message}`);
    });

    return { message: 'Email berhasil diverifikasi' };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (user.emailVerifiedAt) throw new BadRequestException('Email sudah terverifikasi');

    // Rate limit: 1 resend per 2 minutes
    const rateLimitKey = `email_verify_ratelimit:${userId}`;
    const existing = await this.redis.get(rateLimitKey);
    if (existing) throw new BadRequestException('Tunggu 2 menit sebelum mengirim ulang');
    await this.redis.set(rateLimitKey, '1', 120);

    // Clean up old tokens
    const oldCode = await this.redis.get(`email_verify_code:${userId}`);
    if (oldCode) {
      const { token: oldToken } = JSON.parse(oldCode);
      await this.redis.del(`email_verify:${oldToken}`);
      await this.redis.del(`email_verify_code:${userId}`);
    }

    await this.sendVerificationEmail(user.id, user.email, user.firstName);
    return { message: 'Email verifikasi telah dikirim ulang' };
  }

  // ── Google OAuth ─────────────────────────────────────

  async googleLogin(googleUser: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    profilePhoto: string;
  }) {
    if (!googleUser?.email) {
      throw new UnauthorizedException('Google login gagal — email tidak ditemukan');
    }

    // Check if user already exists by email
    let user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (user) {
      // Update Google profile photo if not set
      if (!user.profilePhoto && googleUser.profilePhoto) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { profilePhoto: googleUser.profilePhoto },
        });
      }
    } else {
      // Create new user from Google profile
      const randomPassword = randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          firstName: googleUser.firstName,
          lastName: googleUser.lastName,
          profilePhoto: googleUser.profilePhoto,
          passwordHash,
          isVerified: true, // Google-verified email
          role: 'CLIENT',
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Akun dinonaktifkan');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      action: 'GOOGLE_LOGIN',
      resource: 'auth',
      severity: 'INFO',
    });

    const tokens = await this.generateTokens(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profilePhoto: user.profilePhoto,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  // ── OTP Service ──────────────────────────────────────

  async sendOTP(phone: string) {
    // Rate limit: max 3 OTPs per phone per hour (check BEFORE generating)
    const otpCountKey = `otp_count:${phone}`;
    const currentCount = await this.redis.get(otpCountKey);
    if (currentCount && parseInt(currentCount) >= 3) {
      throw new BadRequestException('Terlalu banyak permintaan OTP. Coba lagi dalam 1 jam.');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Redis with 5 min expiry
    await this.redis.set(`otp:${phone}`, otp, 300);

    // Increment rate limit counter
    await this.redis.set(otpCountKey, String((parseInt(currentCount || '0') + 1)), 3600);

    // TODO: Send via Twilio/SMS provider when credentials available
    const isDev = this.config.get('app.nodeEnv') === 'development';

    if (isDev) {
      console.log(`[OTP] Phone: ${phone}, Code: ${otp}`);
    }

    return {
      message: 'OTP berhasil dikirim',
      expiresIn: 300,
      ...(isDev && { otp }), // Only expose in development
    };
  }

  async verifyOTP(phone: string, code: string) {
    // Brute force protection: max 5 verification attempts per OTP
    const attemptKey = `otp_attempts:${phone}`;
    const attempts = parseInt(await this.redis.get(attemptKey) || '0');
    if (attempts >= 5) {
      await this.redis.del(`otp:${phone}`);
      await this.redis.del(attemptKey);
      throw new BadRequestException('Terlalu banyak percobaan. OTP telah expired. Silakan minta OTP baru.');
    }

    const storedOTP = await this.redis.get(`otp:${phone}`);

    if (!storedOTP) {
      throw new BadRequestException('OTP expired atau tidak ditemukan');
    }

    if (storedOTP !== code) {
      await this.redis.set(attemptKey, String(attempts + 1), 300); // Track attempt
      throw new BadRequestException('Kode OTP tidak valid');
    }

    // Delete used OTP and attempts
    await this.redis.del(`otp:${phone}`);
    await this.redis.del(attemptKey);

    // Find user by phone
    const user = await this.prisma.user.findFirst({
      where: { phone },
    });

    if (!user) {
      // Phone not registered yet — return verification status
      return {
        verified: true,
        userExists: false,
        message: 'Nomor terverifikasi. Silakan daftar akun.',
      };
    }

    // Generate tokens for existing user
    const tokens = await this.generateTokens(user.id, user.role);

    await this.audit.log({
      userId: user.id,
      action: 'OTP_LOGIN',
      resource: 'auth',
      severity: 'INFO',
    });

    return {
      verified: true,
      userExists: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      ...tokens,
    };
  }

  // ── Apple Sign-in ─────────────────────────────────────

  async appleLogin(dto: {
    idToken: string;
    authorizationCode?: string;
    firstName?: string;
    lastName?: string;
    nonce?: string;
  }) {
    // 1. Verify the Apple ID token
    const appleUser = await this.appleAuth.verifyIdToken(dto.idToken, dto.nonce);

    if (!appleUser?.email) {
      throw new UnauthorizedException('Apple login gagal — email tidak ditemukan');
    }

    // 2. Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: appleUser.email },
    });

    if (user) {
      // Existing user — just log in
      if (!user.isActive) {
        throw new UnauthorizedException('Akun dinonaktifkan');
      }
    } else {
      // Create new user from Apple profile
      // Apple only sends name on first authorization, so use provided names or defaults
      const firstName = dto.firstName || 'Apple';
      const lastName = dto.lastName || 'User';
      const randomPassword = randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await this.prisma.user.create({
        data: {
          email: appleUser.email,
          firstName,
          lastName,
          passwordHash,
          isVerified: appleUser.emailVerified,
          role: 'CLIENT',
        },
      });
    }

    // 3. Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      action: 'APPLE_LOGIN',
      resource: 'auth',
      severity: 'INFO',
    });

    // 4. Generate tokens
    const tokens = await this.generateTokens(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        profilePhoto: user.profilePhoto,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }
}
