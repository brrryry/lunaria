import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Headers,
} from '@nestjs/common';
import {
  NotificationsService,
  UpdatePreferencesDto,
} from './notifications.service.js';
import { PushService, PushSubscriptionDto } from './push.service.js';
import { AuthService } from '../auth/auth.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
    private readonly authService: AuthService,
  ) {}

  @Get('push/vapid-public-key')
  getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  @Post('push/subscribe')
  async subscribePush(
    @Body() dto: PushSubscriptionDto,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.pushService.registerSubscription(userId, dto);
  }

  @Post('push/unsubscribe')
  async unsubscribePush(
    @Body('token') token: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.pushService.unregisterSubscription(userId, token);
  }

  @Get()
  async getNotifications(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.notificationsService.getNotifications(userId);
  }

  @Get('preferences')
  async getPreferences(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.notificationsService.getPreferences(userId);
  }

  @Put('preferences')
  async updatePreferences(
    @Body() dto: UpdatePreferencesDto,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.notificationsService.updatePreferences(userId, dto);
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.notificationsService.markAsRead(userId, id);
  }

  @Post('mark-all-read')
  async markAllAsRead(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete(':id')
  async dismissNotification(
    @Param('id') id: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.notificationsService.dismissNotification(userId, id);
  }

  @Delete()
  async clearAllNotifications(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(
      queryUserId || headerUserId,
      authHeader,
    );
    return this.notificationsService.clearAllNotifications(userId);
  }
}

