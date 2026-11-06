import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AgentController } from './agent.controller.js';
import { AiService } from './ai.service.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { BudgetModule } from '../budget/budget.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [TransactionsModule, BudgetModule, AuthModule, DatabaseModule],
  controllers: [AiController, AgentController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
