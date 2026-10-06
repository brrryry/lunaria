import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LunariaDb, categories, userCategoryExclusions, categoryRules, transactions } from '@lunaria/db';
import { eq, or, isNull, and, desc, inArray } from 'drizzle-orm';
import { DATABASE_TOKEN } from '../database/database.module.js';
import type { CreateCategoryDto, UpdateCategoryDto } from '@lunaria/types';

const SYSTEM_DEFAULTS = [
  { name: 'Housing & Rent', group: 'Living Expenses', color: '#6366f1', icon: 'home' },
  { name: 'Food & Dining', group: 'Food & Lifestyle', color: '#38bdf8', icon: 'coffee' },
  { name: 'Groceries', group: 'Living Expenses', color: '#10b981', icon: 'shopping-cart' },
  { name: 'Shopping & Tech', group: 'Discretionary', color: '#f43f5e', icon: 'laptop' },
  { name: 'Auto & Transport', group: 'Living Expenses', color: '#fbbf24', icon: 'car' },
  { name: 'Travel', group: 'Food & Lifestyle', color: '#a855f7', icon: 'plane' },
  { name: 'Utilities & Bills', group: 'Living Expenses', color: '#14b8a6', icon: 'zap' },
  { name: 'Entertainment', group: 'Discretionary', color: '#ec4899', icon: 'tv' },
  { name: 'Direct Deposit / Income', group: 'Income', color: '#22c55e', icon: 'arrow-down-circle' },
  { name: 'Savings & Investments', group: 'Financial', color: '#3b82f6', icon: 'trending-up' },
];

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: LunariaDb,
  ) {}

  async ensureDefaultCategories() {
    const existing = await this.db
      .select()
      .from(categories)
      .where(eq(categories.isSystem, true))
      .limit(1);

    if (existing.length === 0) {
      for (const cat of SYSTEM_DEFAULTS) {
        await this.db.insert(categories).values({
          name: cat.name,
          group: cat.group,
          color: cat.color,
          icon: cat.icon,
          isSystem: true,
        });
      }
    }
  }

  /**
   * Returns active categories for the given user (all defaults minus any excluded, plus user's custom categories)
   */
  async getCategories(userId: string) {
    await this.ensureDefaultCategories();

    // 1. Get user exclusions
    const exclusions = await this.db
      .select({ categoryId: userCategoryExclusions.categoryId })
      .from(userCategoryExclusions)
      .where(eq(userCategoryExclusions.userId, userId));

    const excludedIds = new Set(exclusions.map((e) => e.categoryId));

    // 2. Fetch all system defaults and user-created categories
    const allCategories = await this.db
      .select()
      .from(categories)
      .where(or(isNull(categories.userId), eq(categories.userId, userId)));

    // 3. Filter out excluded categories
    return allCategories.filter((c) => !excludedIds.has(c.id));
  }

  /**
   * Returns default categories that the user has excluded/hidden
   */
  async getExcludedCategories(userId: string) {
    const exclusions = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        group: categories.group,
        color: categories.color,
        icon: categories.icon,
        isSystem: categories.isSystem,
        createdAt: userCategoryExclusions.createdAt,
      })
      .from(userCategoryExclusions)
      .innerJoin(categories, eq(userCategoryExclusions.categoryId, categories.id))
      .where(eq(userCategoryExclusions.userId, userId));

    return exclusions;
  }

  async createCategory(userId: string, dto: CreateCategoryDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Category name is required');
    }

    const [created] = await this.db
      .insert(categories)
      .values({
        userId,
        name: dto.name.trim(),
        group: dto.group?.trim() || 'Custom Categories',
        color: dto.color || '#6366f1',
        icon: dto.icon || 'tag',
        isSystem: false,
      })
      .returning();

    return created;
  }

  /**
   * Deletes a custom category or excludes a system default category for the user,
   * with optional reassignment of existing transactions and memory rules.
   */
  async deleteCategory(userId: string, categoryId: string, reassignToCategoryName?: string) {
    const [target] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (!target) {
      throw new NotFoundException('Category not found');
    }

    const oldName = target.name;
    const targetCategoryName = reassignToCategoryName?.trim() || 'Uncategorized';

    if (target.isSystem) {
      // For system default categories: add to user exclusions so it's hidden for this user
      const [existingExclusion] = await this.db
        .select()
        .from(userCategoryExclusions)
        .where(
          and(
            eq(userCategoryExclusions.userId, userId),
            eq(userCategoryExclusions.categoryId, categoryId),
          ),
        )
        .limit(1);

      if (!existingExclusion) {
        await this.db.insert(userCategoryExclusions).values({
          userId,
          categoryId,
        });
      }
    } else {
      // For custom categories: verify ownership and delete
      if (target.userId !== userId) {
        throw new BadRequestException('Cannot delete category belonging to another user');
      }

      await this.db.delete(categories).where(eq(categories.id, categoryId));
    }

    // Reassign transactions for this user currently tagged with the old category
    let reassignedCount = 0;
    if (oldName) {
      const updateResult = await this.db
        .update(transactions)
        .set({
          category: targetCategoryName,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.category, oldName),
          ),
        )
        .returning({ id: transactions.id });

      reassignedCount = updateResult.length;

      // Also update learned merchant rules
      await this.db
        .update(categoryRules)
        .set({
          category: targetCategoryName,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(categoryRules.userId, userId),
            eq(categoryRules.category, oldName),
          ),
        );
    }

    return {
      success: true,
      deletedCategory: oldName,
      reassignedTo: targetCategoryName,
      reassignedCount,
      isSystem: target.isSystem,
    };
  }

  /**
   * Restores all excluded default categories for the user
   */
  async restoreDefaultCategories(userId: string) {
    await this.db
      .delete(userCategoryExclusions)
      .where(eq(userCategoryExclusions.userId, userId));

    return { success: true };
  }

  /**
   * Restores a single excluded category
   */
  async restoreSingleCategory(userId: string, categoryId: string) {
    await this.db
      .delete(userCategoryExclusions)
      .where(
        and(
          eq(userCategoryExclusions.userId, userId),
          eq(userCategoryExclusions.categoryId, categoryId),
        ),
      );

    return { success: true };
  }

  /**
   * Updates an existing category (or converts a system default into a user customized category)
   */
  async updateCategory(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    const [target] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (!target) {
      throw new NotFoundException('Category not found');
    }

    const oldName = target.name;
    const newName = dto.name?.trim() || target.name;

    if (target.isSystem) {
      // If user is editing a system default category:
      // Exclude the default category for this user, and create a custom user category with updated attributes
      await this.deleteCategory(userId, categoryId, newName);

      const [customCopy] = await this.db
        .insert(categories)
        .values({
          userId,
          name: newName,
          group: dto.group?.trim() || target.group,
          color: dto.color || target.color,
          icon: dto.icon || target.icon,
          isSystem: false,
        })
        .returning();

      return customCopy;
    }

    // If it's the user's custom category:
    if (target.userId !== userId) {
      throw new BadRequestException('Cannot edit category belonging to another user');
    }

    const [updated] = await this.db
      .update(categories)
      .set({
        name: newName,
        group: dto.group?.trim() || target.group,
        color: dto.color || target.color,
        icon: dto.icon || target.icon,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, categoryId))
      .returning();

    // If name changed, synchronize transactions and rules
    if (oldName !== newName) {
      await this.db
        .update(transactions)
        .set({ category: newName })
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.category, oldName),
          ),
        );

      await this.db
        .update(categoryRules)
        .set({
          category: newName,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(categoryRules.userId, userId),
            eq(categoryRules.category, oldName),
          ),
        );
    }

    return updated;
  }

  /**
   * Fetches active learned auto-categorization merchant memory rules
   */
  async getCategoryRules(userId: string) {
    return this.db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.userId, userId))
      .orderBy(desc(categoryRules.updatedAt));
  }

  /**
   * Deletes a learned auto-categorization rule
   */
  async deleteCategoryRule(userId: string, ruleId: string) {
    await this.db
      .delete(categoryRules)
      .where(and(eq(categoryRules.userId, userId), eq(categoryRules.id, ruleId)));

    return { success: true };
  }
}
