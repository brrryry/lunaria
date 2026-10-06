import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { CreateCategoryDto, UpdateCategoryDto } from '@lunaria/types';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getCategories(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.getCategories(userId);
  }

  @Get('excluded')
  async getExcludedCategories(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.getExcludedCategories(userId);
  }

  @Post()
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.createCategory(userId, dto);
  }

  @Patch(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.updateCategory(userId, id, dto);
  }

  @Delete(':id')
  async deleteCategory(
    @Param('id') id: string,
    @Query('reassignTo') reassignTo?: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.deleteCategory(userId, id, reassignTo);
  }

  @Post('restore-defaults')
  async restoreDefaultCategories(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.restoreDefaultCategories(userId);
  }

  @Post(':id/restore')
  async restoreSingleCategory(
    @Param('id') id: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.restoreSingleCategory(userId, id);
  }

  @Get('rules/all')
  async getCategoryRules(
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.getCategoryRules(userId);
  }

  @Delete('rules/:ruleId')
  async deleteCategoryRule(
    @Param('ruleId') ruleId: string,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.authService.resolveUserId(queryUserId || headerUserId, authHeader);
    return this.categoriesService.deleteCategoryRule(userId, ruleId);
  }
}

