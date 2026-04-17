import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ImageModule } from '@modules/image/image.module';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './config/prisma.module';
import { RedisModule } from './config/redis.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ReviewModule } from './modules/review/review.module';
import { SafetyModule } from './modules/safety/safety.module';
import { AdminModule } from './modules/admin/admin.module';
import { MatchingModule } from './modules/matching/matching.module';
import { CorporateModule } from './modules/corporate/corporate.module';
import { TrainingModule } from './modules/training/training.module';
import { PremiumModule } from './modules/premium/premium.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { KycModule } from './modules/kyc/kyc.module';
import { ReferralModule } from './modules/referral/referral.module';
import { ArticleModule } from './modules/article/article.module';
import { TestimonialModule } from './modules/testimonial/testimonial.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { HealthModule } from './modules/health/health.module';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, databaseConfig, redisConfig],
      envFilePath: ['.env', '../../.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(4000),
        DATABASE_URL: Joi.string().required(),
        // Cryptographic material is required in every environment to avoid
        // weak/default fallbacks. Minimum 32 chars enforces enough entropy
        // for AES-256-GCM key derivation and HMAC-signed JWTs.
        ENCRYPTION_KEY: Joi.string().min(32).required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Static files (uploads)
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false },
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Infrastructure
    PrismaModule,
    RedisModule,
    CommonModule,
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    UserModule,
    BookingModule,
    PaymentModule,
    ChatModule,
    NotificationModule,
    ReviewModule,
    SafetyModule,
    AdminModule,
    MatchingModule,
    CorporateModule,
    TrainingModule,
    PremiumModule,
    MetricsModule,
    KycModule,
    ImageModule,
    ReferralModule,
    ArticleModule,
    TestimonialModule,
    GdprModule,
    AnalyticsModule,
    InvoiceModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
