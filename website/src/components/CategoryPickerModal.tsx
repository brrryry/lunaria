'use client';

import React, { useState } from 'react';
import {
  X,
  Tag,
  Plus,
  Check,
  Sparkles,
  Loader2,
  Sliders,
} from 'lucide-react';
import type { Category } from '@lunaria/types';

interface CategoryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any;
  categories: Category[];
  onSelectCategory: (
    categoryName: string,
    applyToAllMerchant: boolean,
  ) => Promise<void>;
  onCreateCategory: (name: string, group: string, color: string) => Promise<Category | null>;
}

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#38bdf8', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
];

export const CategoryPickerModal: React.FC<CategoryPickerModalProps> = ({
  isOpen,
  onClose,
  transaction,
  categories = [],
  onSelectCategory,
  onCreateCategory,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [applyToAllMerchant, setApplyToAllMerchant] = useState(true);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryGroup, setNewCategoryGroup] = useState('Custom Categories');
  const [newCategoryColor, setNewCategoryColor] = useState(PRESET_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !transaction) return null;

  const merchantName = transaction.merchantName || transaction.name || 'this merchant';

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSelect = async (categoryName: string) => {
    try {
      setIsSubmitting(true);
      await onSelectCategory(categoryName, applyToAllMerchant);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      setIsSubmitting(true);
      const created = await onCreateCategory(
        newCategoryName.trim(),
        newCategoryGroup.trim(),
        newCategoryColor,
      );
      if (created) {
        await onSelectCategory(created.name, applyToAllMerchant);
        setIsCreatingNew(false);
        setNewCategoryName('');
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-white dark:bg-[#10141f] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit Category</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px] sm:max-w-[240px]">
                {transaction.name || transaction.merchantName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Apply to all merchant toggle */}
          <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/90 transition-colors">
            <input
              type="checkbox"
              checked={applyToAllMerchant}
              onChange={(e) => setApplyToAllMerchant(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Rule: Apply to all transactions from this merchant
              </span>
              <span className="text-slate-500 text-[11px]">
                Categorize past and future transactions for "{merchantName}"
              </span>
            </div>
          </label>

          {!isCreatingNew ? (
            <>
              {/* Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search existing categories..."
                  className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Categories list */}
              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                {filteredCategories.map((c) => {
                  const isCurrent = transaction.category === c.name;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleSelect(c.name)}
                      disabled={isSubmitting}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-white font-semibold'
                          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: c.color || '#6366f1' }}
                        />
                        <span>{c.name}</span>
                        {!c.isSystem && (
                          <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.2 rounded border border-purple-500/20 font-medium">
                            Custom
                          </span>
                        )}
                      </div>
                      {isCurrent && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Category Button */}
              <button
                onClick={() => {
                  setIsCreatingNew(true);
                  if (searchTerm) setNewCategoryName(searchTerm);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Custom Category</span>
              </button>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/60 text-center">
                <span className="text-[11px] text-slate-500">
                  Want to delete defaults or manage rules? Head to{' '}
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">Settings → Categories</span>
                </span>
              </div>
            </>
          ) : (
            /* Create New Category Form */
            <form onSubmit={handleCreate} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category Name</label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Mechanical Keyboards, Pet Supplies"
                  className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category Group</label>
                <select
                  value={newCategoryGroup}
                  onChange={(e) => setNewCategoryGroup(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="Living Expenses">Living Expenses</option>
                  <option value="Food & Lifestyle">Food & Lifestyle</option>
                  <option value="Discretionary">Discretionary</option>
                  <option value="Financial">Financial</option>
                  <option value="Custom Categories">Custom Categories</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Color Badge</label>
                <div className="flex items-center gap-2 pt-1">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCategoryColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                        newCategoryColor === color ? 'scale-125 ring-2 ring-slate-900 dark:ring-white' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newCategoryName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Create & Assign</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
