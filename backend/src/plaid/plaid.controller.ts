import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { PlaidService } from './plaid.service.js';
import { AuthService } from '../auth/auth.service.js';

@Controller('plaid')
export class PlaidController {
  constructor(
    private readonly plaidService: PlaidService,
    private readonly authService: AuthService,
  ) {}

  @Post('create-link-token')
  async createLinkToken(
    @Body('userId') bodyUserId?: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      bodyUserId || queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.createLinkToken(userId);
  }

  @Post('create-update-link-token/:itemId')
  async createUpdateLinkToken(
    @Param('itemId') itemId: string,
    @Body('userId') bodyUserId?: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      bodyUserId || queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.createUpdateLinkToken(userId, itemId);
  }

  @Post('update-mode-success/:itemId')
  async updateModeSuccess(
    @Param('itemId') itemId: string,
    @Body('userId') bodyUserId?: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      bodyUserId || queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.resolveUpdateModeSuccess(userId, itemId);
  }

  @Post('exchange-public-token')
  async exchangePublicToken(
    @Body('userId') bodyUserId?: string,
    @Body('publicToken') publicToken?: string,
    @Body('metadata')
    metadata?: {
      institutionId?: string;
      institutionName?: string;
      accounts?: Array<{
        id?: string;
        name?: string;
        mask?: string;
        type?: string;
        subtype?: string;
      }>;
    },
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      bodyUserId || queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.exchangePublicToken(
      userId,
      publicToken || '',
      metadata || {},
    );
  }

  @Get('items')
  async getItems(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.getItems(userId);
  }

  @Delete('items/:id')
  async removeItem(
    @Param('id') id: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.removeItem(id, userId);
  }

  @Post('sync')
  async syncAll(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.syncAllItems(userId);
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: any,
    @Headers('plaid-verification') verificationHeader?: string,
    @Body() body?: any,
  ) {
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(body || {});
    await this.plaidService.verifyWebhookSignature(verificationHeader, rawBody);
    return this.plaidService.handleWebhook(body);
  }

  @Get('recurring')
  async getRecurring(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.plaidService.getRecurringTransactions(userId);
  }

  @Post('recurring/dismiss')
  async dismissRecurring(
    @Body('streamId') streamId: string,
    @Body('merchantName') merchantName?: string,
    @Body('userId') bodyUserId?: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      bodyUserId || queryUserId || headerUserId,
      authHeader,
    );
    if (!streamId) {
      throw new BadRequestException('streamId is required');
    }
    return this.plaidService.dismissRecurringStream(userId, streamId, merchantName);
  }

  @Post('recurring/restore')
  async restoreRecurring(
    @Body('streamId') streamId: string,
    @Body('userId') bodyUserId?: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      bodyUserId || queryUserId || headerUserId,
      authHeader,
    );
    if (!streamId) {
      throw new BadRequestException('streamId is required');
    }
    return this.plaidService.restoreRecurringStream(userId, streamId);
  }
}

