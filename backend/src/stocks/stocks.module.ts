import { Module } from '@nestjs/common';
import { StocksService } from './stocks.service.js';
import { StocksController } from './stocks.controller.js';

@Module({
  controllers: [StocksController],
  providers: [StocksService],
  exports: [StocksService],
})
export class StocksModule {}
