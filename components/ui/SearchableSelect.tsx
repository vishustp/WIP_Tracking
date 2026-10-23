'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  disabled?: boolean;
  keywords?: string[];
}

export interface SearchableSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  buttonClassName?: string;
  zIndex?: number;
  autoFocusSearch?: boolean;
  renderOption?: (option: SearchableOption, isSelected: boolean) => React.ReactNode;
}

export function SearchableSelect({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Type to search...',
  emptyText = 'No matches found',
  disabled = false,
  required = false,
  className = '',
  buttonClassName = '',
  zIndex = 50,
  autoFocusSearch = true,
  renderOption,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value) || null;
  }, [options, value]);

  // Filter options based on search query (multi-term matching)
  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    const terms = q.split(/\s+/).filter(Boolean);

    return options.filter((opt) => {
      const combined = [
        opt.label,
        opt.sublabel || '',
        opt.badge || '',
        opt.value,
        ...(opt.keywords || []),
      ]
        .join(' ')
        .toLowerCase();

      return terms.every((term) => combined.includes(term));
    });
  }, [options, search]);

  // Handle open / close
  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setHighlightedIndex(-1);
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && autoFocusSearch) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoFocusSearch]);

  // Close when clicking outside on desktop
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, closeDropdown]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev < filteredOptions.length - 1 ? prev + 1 : 0;
        scrollOptionIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : filteredOptions.length - 1;
        scrollOptionIntoView(next);
        return next;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        const chosen = filteredOptions[highlightedIndex];
        if (!chosen.disabled) {
          onChange(chosen.value);
          closeDropdown();
        }
      }
    }
  };

  const scrollOptionIntoView = (index: number) => {
    if (!optionsListRef.current) return;
    const items = optionsListRef.current.querySelectorAll('[data-option-index]');
    const targetItem = items[index] as HTMLElement | undefined;
    if (targetItem) {
      targetItem.scrollIntoView({ block: 'nearest' });
    }
  };

  const handleSelectOption = (opt: SearchableOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    closeDropdown();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)} onKeyDown={handleKeyDown}>
      {/* Hidden native input for HTML form validation */}
      {required && (
        <input
          type="text"
          id={id}
          name={name}
          value={value}
          required={required}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'flex min-h-[44px] w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-2xs transition-colors',
          'hover:border-slate-400 focus:border-[#0078d4] focus:outline-none focus:ring-2 focus:ring-[#0078d4]/20',
          'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400',
          isOpen && 'border-[#0078d4] ring-2 ring-[#0078d4]/20',
          buttonClassName
        )}
      >
        <div className="flex-1 min-w-0 pr-2">
          {selectedOption ? (
            <div className="flex flex-col">
              <span className="font-semibold text-slate-900 truncate">
                {selectedOption.label}
              </span>
              {selectedOption.sublabel && (
                <span className="text-[11px] text-slate-500 truncate font-normal">
                  {selectedOption.sublabel}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  handleClear(e as any);
                }
              }}
              title="Clear selection"
              className="rounded p-1 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              isOpen && 'rotate-180 text-[#0078d4]'
            )}
          />
        </div>
      </button>

      {/* Dropdown Menu (Mobile Modal / Desktop Popover) */}
      {isOpen && (
        <>
          {/* Mobile Backdrop (< 640px) */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-2xs sm:hidden"
            onClick={closeDropdown}
          />

          {/* Popover Container */}
          <div
            style={{ zIndex }}
            className={cn(
              // Mobile Bottom Sheet / Modal View (< 640px)
              'fixed inset-x-2 bottom-2 max-h-[85vh] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden sm:hidden',
              // Desktop Floating Dropdown (>= 640px)
              'sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:mt-1.5 sm:max-h-80 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:shadow-lg'
            )}
          >
            {/* Mobile Header / Drag Indicator */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 sm:hidden bg-slate-50">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                {placeholder}
              </span>
              <button
                type="button"
                onClick={closeDropdown}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input Header */}
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlightedIndex(-1);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0078d4] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0078d4]/20"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Counter / Helper line */}
              <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-slate-400 font-mono">
                <span>
                  Showing {filteredOptions.length} of {options.length} options
                </span>
                {search && (
                  <span className="text-blue-600 font-semibold">Filtered by &quot;{search}&quot;</span>
                )}
              </div>
            </div>

            {/* Options List */}
            <div
              ref={optionsListRef}
              role="listbox"
              className="flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100 p-1"
            >
              {filteredOptions.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-slate-400">
                  <p className="font-semibold text-slate-600">{emptyText}</p>
                  {search && (
                    <p className="mt-1 text-[11px]">No options match &quot;{search}&quot;</p>
                  )}
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={opt.value}
                      data-option-index={idx}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectOption(opt)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={cn(
                        'flex min-h-[46px] items-center justify-between px-3 py-2.5 text-xs sm:text-sm rounded-lg cursor-pointer transition-colors select-none',
                        isSelected && 'bg-blue-50/80 text-blue-900 font-bold',
                        !isSelected && isHighlighted && 'bg-slate-100/80 text-slate-900',
                        !isSelected && !isHighlighted && 'text-slate-800 hover:bg-slate-50',
                        opt.disabled && 'cursor-not-allowed opacity-40'
                      )}
                    >
                      {renderOption ? (
                        renderOption(opt, isSelected)
                      ) : (
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{opt.label}</span>
                            {opt.badge && (
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600 border border-slate-200">
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          {opt.sublabel && (
                            <div className="text-[11px] text-slate-500 font-normal truncate mt-0.5">
                              {opt.sublabel}
                            </div>
                          )}
                        </div>
                      )}

                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-[#0078d4] stroke-[2.5]" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Mobile Footer Done Button */}
            <div className="border-t border-slate-100 p-2 sm:hidden bg-slate-50">
              <button
                type="button"
                onClick={closeDropdown}
                className="w-full rounded-lg bg-slate-800 py-2.5 text-xs font-bold text-white shadow-sm active:scale-[0.98] transition cursor-pointer"
              >
                Close List
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
