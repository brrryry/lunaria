import { Controller, Get, Param, Query, Headers } from '@nestjs/common';
import { StocksService } from './stocks.service.js';
import { AuthService } from '../auth/auth.service.js';

@Controller('stocks')
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
    private readonly authService: AuthService,
  ) {}

  @Get('portfolio')
  async getPortfolio(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
    @Query('timeframe') timeframe?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.stocksService.getPortfolioHistory(userId, timeframe);
  }

  @Get('net-worth')
  async getNetWorth(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
    @Query('timeframe') timeframe?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.stocksService.getNetWorthHistory(userId, timeframe);
  }

  @Get('holdings')
  async getHoldings(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.stocksService.getHoldings(userId);
  }

  @Get('ticker/:symbol')
  async getTicker(
    @Param('symbol') symbol: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.stocksService.getTickerHistory(symbol);
  }

  @Get('activity')
  async getActivity(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.stocksService.getInvestmentTransactions(
      userId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
