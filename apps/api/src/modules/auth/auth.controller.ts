import { Controller, Post, Get, Delete, Body, Param, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DeviceService } from './services/device.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto, LogoutDto, Verify2FASetupDto, Verify2FALoginDto, Disable2FADto } from './dto/auth-action.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly deviceService: DeviceService,
  ) {}

  @Post('register')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or email already exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful — returns tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many attempts — account locked' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.authService.login(dto);

    // Track device on successful login
    if (!result.requires2FA && (result as any).user?.id) {
      const deviceInfo = {
        userAgent: req.headers['user-agent'] || 'unknown',
        ip: (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim(),
        language: req.headers['accept-language']?.split(',')[0] || '',
        platform: req.headers['sec-ch-ua-platform'] as string || '',
      };
      const { isNewDevice, fingerprint } = await this.deviceService.trackDevice(
        (result as any).user.id,
        deviceInfo,
      );
      return { ...result, isNewDevice, deviceFingerprint: fingerprint };
    }

    return result;
  }

  @Post('refresh')
  // Limit refresh attempts — a genuine client rotates at most every ~15 min.
  @Throttle({ medium: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New access token issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  // 3 requests/hour is sufficient to prevent email-bombing while still
  // allowing legitimate retries across devices.
  @Throttle({ long: { ttl: 60 * 60 * 1000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent (if account exists)' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('verify-email')
  @Throttle({ medium: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token or code' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token or code' })
  async verifyEmail(@Body() body: { token?: string; code?: string; userId?: string }) {
    return this.authService.verifyEmail(body.token, body.code, body.userId);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limited — wait before resending' })
  async resendVerification(@CurrentUser('id') userId: string) {
    return this.authService.resendVerification(userId);
  }

  // ── 2FA Endpoints ────────────────────────────────────

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize 2FA setup — returns secret + QR URL' })
  @ApiResponse({ status: 201, description: 'TOTP secret and QR URL returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async setup2FA(@CurrentUser('id') userId: string) {
    return this.authService.setup2FA(userId);
  }

  @Post('2fa/verify-setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code and enable 2FA' })
  @ApiResponse({ status: 200, description: '2FA enabled — backup codes returned' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verify2FASetup(
    @CurrentUser('id') userId: string,
    @Body() dto: Verify2FASetupDto,
  ) {
    return this.authService.verify2FASetup(userId, dto.code);
  }

  @Post('2fa/verify')
  // Guard the 2FA window against brute-forcing the 6-digit code.
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code during login' })
  @ApiResponse({ status: 200, description: '2FA verified — tokens returned' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP code' })
  @ApiResponse({ status: 401, description: 'Invalid or expired temp token' })
  async verify2FALogin(
    @Body() dto: Verify2FALoginDto,
  ) {
    return this.authService.verify2FALogin(dto.tempToken, dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA (requires current code)' })
  @ApiResponse({ status: 200, description: '2FA disabled' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async disable2FA(
    @CurrentUser('id') userId: string,
    @Body() dto: Disable2FADto,
  ) {
    return this.authService.disable2FA(userId, dto.code);
  }

  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get 2FA status' })
  @ApiResponse({ status: 200, description: '2FA enabled/disabled status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async get2FAStatus(@CurrentUser('id') userId: string) {
    return this.authService.get2FAStatus(userId);
  }

  // ── Device Management Endpoints ──────────────────

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all known devices' })
  @ApiResponse({ status: 200, description: 'List of user devices' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDevices(@CurrentUser('id') userId: string) {
    const devices = await this.deviceService.getUserDevices(userId);
    return { devices };
  }

  @Post('devices/:fingerprint/trust')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trust a device' })
  @ApiResponse({ status: 200, description: 'Device trusted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async trustDevice(
    @CurrentUser('id') userId: string,
    @Param('fingerprint') fingerprint: string,
  ) {
    await this.deviceService.trustDevice(userId, fingerprint);
    return { message: 'Device trusted' };
  }

  @Delete('devices/:fingerprint')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a device' })
  @ApiResponse({ status: 200, description: 'Device revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async revokeDevice(
    @CurrentUser('id') userId: string,
    @Param('fingerprint') fingerprint: string,
  ) {
    await this.deviceService.revokeDevice(userId, fingerprint);
    return { message: 'Device revoked' };
  }

  @Post('devices/revoke-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all devices except current' })
  @ApiResponse({ status: 200, description: 'All other devices revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async revokeAllDevices(
    @CurrentUser('id') userId: string,
    @Body('currentFingerprint') currentFingerprint?: string,
  ) {
    const revoked = await this.deviceService.revokeAllDevices(userId, currentFingerprint);
    return { revoked, message: `${revoked} device(s) revoked` };
  }

  // ── Google OAuth ─────────────────────────────────────

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  async googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to web app with tokens' })
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const googleUser = req.user as any;

    if (!googleUser) {
      const webUrl = process.env.WEB_URL || 'http://localhost:3000';
      return res.redirect(`${webUrl}/login?error=google_auth_failed`);
    }

    try {
      const result = await this.authService.googleLogin(googleUser);
      const webUrl = process.env.WEB_URL || 'http://localhost:3000';
      const params = new URLSearchParams({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return res.redirect(`${webUrl}/callback/google?${params.toString()}`);
    } catch (error) {
      const webUrl = process.env.WEB_URL || 'http://localhost:3000';
      return res.redirect(`${webUrl}/login?error=google_auth_failed`);
    }
  }

  // ── Apple Sign-in ────────────────────────────────────

  @Post('apple')
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login/Register with Apple Sign-in' })
  @ApiResponse({ status: 200, description: 'Login successful — tokens returned' })
  @ApiResponse({ status: 400, description: 'Invalid Apple ID token' })
  async appleLogin(
    @Body() body: {
      idToken: string;
      authorizationCode?: string;
      firstName?: string;
      lastName?: string;
      nonce?: string;
    },
  ) {
    return this.authService.appleLogin(body);
  }

  // ── OTP Endpoints ────────────────────────────────────

  @Post('otp/send')
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone number' })
  @ApiResponse({ status: 200, description: 'OTP sent to phone' })
  @ApiResponse({ status: 429, description: 'OTP rate limited' })
  async sendOTP(@Body('phone') phone: string) {
    return this.authService.sendOTP(phone);
  }

  @Post('otp/verify')
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code' })
  @ApiResponse({ status: 200, description: 'OTP verified — tokens returned' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOTP(
    @Body('phone') phone: string,
    @Body('code') code: string,
  ) {
    return this.authService.verifyOTP(phone, code);
  }
}
