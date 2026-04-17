import { registerAs } from '@nestjs/config';

/**
 * JWT configuration.
 *
 * Secrets are enforced as required (min 32 chars) via the Joi env validation
 * in `AppModule`, so they are guaranteed to be present here — no "dev-only"
 * fallback. Having a silent fallback would let a misconfigured environment
 * sign tokens with a publicly known secret.
 */
export default registerAs('jwt', () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!accessSecret || !refreshSecret) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set (>= 32 chars). ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  return {
    accessSecret,
    refreshSecret,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  };
});
