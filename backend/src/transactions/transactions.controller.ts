import { Controller, Get, Patch, Delete, Param, Body, Query, Headers } from '@nestjs/common';
import { TransactionsService } from './transactions.service.js';
import { AuthService } from '../auth/auth.service.js';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getTransactions(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.transactionsService.getTransactions(userId, {
      accountId,
      startDate,
      endDate,
      category,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('accounts')
  async getAccounts(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.transactionsService.getAccounts(userId);
  }

  @Patch('accounts/:id')
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: { isHidden?: boolean; creditLimit?: number | null },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.transactionsService.updateAccount(id, userId, dto);
  }

  @Delete('accounts/:id')
  async deleteAccount(
    @Param('id') id: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.transactionsService.deleteAccount(id, userId);
  }

  @Get('spending-summary')
  async getSpendingSummary(
    @Query('userId') queryUserId?: string,
    @Query('excludeTransfers') excludeTransfers?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    const shouldExclude = excludeTransfers !== 'false';
    return this.transactionsService.getSpendingSummary(userId, shouldExclude);
  }

  @Get('rules')
  async getCategoryRules(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.transactionsService.getCategoryRules(userId);
  }

  @Patch(':id/category')
  async updateCategory(
    @Param('id') id: string,
    @Body()
    dto: { category: string; subCategory?: string; applyToAllMerchant?: boolean },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.transactionsService.updateCategory(id, userId, dto);
  }
}
