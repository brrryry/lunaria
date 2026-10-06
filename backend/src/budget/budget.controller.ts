import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  Headers,
} from '@nestjs/common';
import { BudgetService } from './budget.service.js';
import { AuthService } from '../auth/auth.service.js';
import { UpdateBudgetDto } from '@lunaria/types';

@Controller('budget')
export class BudgetController {
  constructor(
    private readonly budgetService: BudgetService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getBudget(
    @Query('month') month?: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.budgetService.getMonthlyBudget(userId, month);
  }

  @Put()
  async updateBudget(
    @Body() dto: UpdateBudgetDto,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.budgetService.upsertBudget(userId, dto);
  }

  @Post('copy-previous')
  async copyPreviousMonth(
    @Body() body: { month: string },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.budgetService.copyPreviousMonth(userId, body.month);
  }
}
