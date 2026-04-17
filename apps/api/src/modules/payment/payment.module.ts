import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { XenditService } from './xendit.service';
import { CryptoPaymentService } from './crypto-payment.service';
import { DokuService } from './doku.service';
import { WebhookEventService } from './webhook-event.service';
import { NotificationModule } from '@modules/notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    XenditService,
    CryptoPaymentService,
    DokuService,
    WebhookEventService,
  ],
  exports: [
    PaymentService,
    XenditService,
    CryptoPaymentService,
    DokuService,
    WebhookEventService,
  ],
})
export class PaymentModule {}
