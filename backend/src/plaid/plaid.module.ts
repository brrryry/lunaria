import { Module } from '@nestjs/common';
import { PlaidService } from './plaid.service.js';
import { PlaidController } from './plaid.controller.js';
import { EncryptionService } from '../common/encryption.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { StocksModule } from '../stocks/stocks.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuthModule, StocksModule, NotificationsModule],
  controllers: [PlaidController],
  providers: [PlaidService, EncryptionService],
  exports: [PlaidService],
})
export class PlaidModule {}

