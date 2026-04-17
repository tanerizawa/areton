import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger('EncryptionService');
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('app.encryptionKey');
    if (!secret) {
      // `app.config.ts` already enforces this at boot, but we double-check to
      // fail loudly rather than silently derive from a known default.
      throw new Error('ENCRYPTION_KEY is not configured');
    }
    // Derive a 32-byte key from the secret via scrypt.
    this.key = scryptSync(secret, 'areton-salt-v1', 32);
  }

  /**
   * Encrypt sensitive PII data (KTP, phone, etc.)
   * Returns format: iv:authTag:encryptedData (all hex)
   */
  encrypt(plainText: string): string {
    try {
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(plainText, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag().toString('hex');

      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error: any) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt PII data
   */
  decrypt(encryptedText: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

      if (!ivHex || !authTagHex || !encrypted) {
        throw new Error('Invalid encrypted text format');
      }

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Mask sensitive data for display (e.g., "3275****1234")
   */
  maskKTP(ktp: string): string {
    if (ktp.length <= 8) return '****' + ktp.slice(-4);
    return ktp.slice(0, 4) + '****' + ktp.slice(-4);
  }

  /**
   * Mask phone number for display (e.g., "+62812****5678")
   */
  maskPhone(phone: string): string {
    if (phone.length <= 7) return '****' + phone.slice(-4);
    return phone.slice(0, phone.length - 8) + '****' + phone.slice(-4);
  }

  /**
   * Hash sensitive data for indexing/searching (one-way)
   */
  hash(data: string): string {
    const { createHash } = require('crypto');
    return createHash('sha256')
      .update(data + 'areton-hash-salt')
      .digest('hex');
  }
}
