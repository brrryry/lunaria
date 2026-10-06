export interface Category {
  id: string;
  userId?: string | null;
  name: string;
  group: string;
  color: string;
  icon?: string | null;
  isSystem: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateCategoryDto {
  name: string;
  group?: string;
  color?: string;
  icon?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  group?: string;
  color?: string;
  icon?: string;
}

export interface DeleteCategoryDto {
  reassignTo?: string;
}

export interface CategoryRule {
  id: string;
  userId: string;
  merchantName?: string | null;
  transactionName?: string | null;
  category: string;
  subCategory?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface UpdateTransactionCategoryDto {
  category: string;
  subCategory?: string;
  applyToAllMerchant?: boolean;
}

