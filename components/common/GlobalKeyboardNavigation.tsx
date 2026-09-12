'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * GlobalKeyboardNavigation
 * 
 * Implements enterprise shop-floor keyboard flow:
 * 1. Enter key moves focus to the NEXT field (like Tab).
 * 2. Shift + Enter moves focus to the PREVIOUS field (like Shift + Tab).
 * 3. Ctrl + Enter (or Cmd + Enter) commits / saves the active form or triggers the primary save button.
 * 4. Active on all routes except /login.
 */
export function GlobalKeyboardNavigation() {
  const pathname = usePathname();

  useEffect(() => {
    // Disabled on login page
    if (pathname === '/login') return;

    const isVisible = (el: HTMLElement): boolean => {
      if (el.hasAttribute('hidden') || el.style.display === 'none' || el.style.visibility === 'hidden') {
        return false;
      }
      // Check browser layout metrics when rendered in real DOM
      if (el.offsetWidth || el.offsetHeight || el.getClientRects().length || el.offsetParent !== null) {
        return true;
      }
      // Fallback for jsdom / test environments where layout engine is not instantiated
      return !el.hasAttribute('hidden') && el.style.display !== 'none';
    };

    const getFocusableElements = (container: HTMLElement | Document): HTMLElement[] => {
      const selector = [
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'button:not([disabled])',
        '[tabindex]:not([tabindex="-1"]):not([disabled])',
      ].join(', ');

      const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));
      return elements.filter((el) => isVisible(el) && el.tabIndex !== -1);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // ----------------------------------------------------
      // ACTION: Ctrl + Enter / Cmd + Enter => Commit / Save
      // ----------------------------------------------------
      if (isCtrlOrCmd && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();

        // 1. Check if an active modal / dialog is open
        const activeModal = document.querySelector<HTMLElement>('[role="dialog"], .modal-container');
        if (activeModal) {
          const modalSubmit =
            activeModal.querySelector<HTMLButtonElement>('button[type="submit"]:not([disabled])') ||
            activeModal.querySelector<HTMLButtonElement>('button[data-primary-save="true"]:not([disabled])');

          if (modalSubmit) {
            modalSubmit.click();
            return;
          }

          // Search modal buttons with save/update keywords
          const modalButtons = Array.from(activeModal.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
          const saveBtn = modalButtons.find((btn) => {
            const text = (btn.textContent || '').toLowerCase().trim();
            return (
              text.includes('save') ||
              text.includes('update') ||
              text.includes('record') ||
              text.includes('apply') ||
              text.includes('confirm')
            );
          });

          if (saveBtn) {
            saveBtn.click();
            return;
          }
        }

        // 2. If inside a form, submit the form
        const parentForm = activeEl.closest<HTMLFormElement>('form');
        if (parentForm) {
          const formSubmit = parentForm.querySelector<HTMLButtonElement>('button[type="submit"]:not([disabled])');
          if (formSubmit) {
            formSubmit.click();
            return;
          }
          if (typeof parentForm.requestSubmit === 'function') {
            parentForm.requestSubmit();
            return;
          }
        }

        // 3. Search page-level primary save button
        const pageSaveBtn =
          document.querySelector<HTMLButtonElement>('button[data-primary-save="true"]:not([disabled])') ||
          Array.from(document.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).find((btn) => {
            const text = (btn.textContent || '').toLowerCase().trim();
            return (
              (text.includes('save') || text.includes('record') || text.includes('update')) &&
              !text.includes('cancel') &&
              !text.includes('close')
            );
          });

        if (pageSaveBtn) {
          pageSaveBtn.click();
        }
        return;
      }

      // ----------------------------------------------------
      // ACTION: Enter / Shift + Enter => Advance Focus (like Tab)
      // ----------------------------------------------------
      if (e.key === 'Enter' && !isCtrlOrCmd && !e.altKey) {
        const tagName = activeEl.tagName.toLowerCase();
        const inputType = (activeEl as HTMLInputElement).type?.toLowerCase();

        // Allow natural Enter on multiline textarea (unless Shift+Enter is pressed to go back)
        if (tagName === 'textarea' && !e.shiftKey) {
          return;
        }

        // If user is focused directly on a standard button or link, let Enter click it
        if (tagName === 'button' || (tagName === 'input' && (inputType === 'button' || inputType === 'submit'))) {
          return;
        }

        // Target editable inputs and selects
        if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
          e.preventDefault();

          // Determine container context (modal vs current form/table vs whole main page)
          const modalContainer = activeEl.closest<HTMLElement>('[role="dialog"]');
          const tableContainer = activeEl.closest<HTMLElement>('table');
          const formContainer = activeEl.closest<HTMLElement>('form');
          const scopeContainer =
            modalContainer ||
            formContainer ||
            tableContainer ||
            document.querySelector<HTMLElement>('main') ||
            document.body;

          const focusable = getFocusableElements(scopeContainer);
          const currentIndex = focusable.indexOf(activeEl);

          if (currentIndex === -1 || focusable.length <= 1) return;

          let targetIndex: number;
          if (e.shiftKey) {
            // Move backwards
            targetIndex = currentIndex - 1 < 0 ? focusable.length - 1 : currentIndex - 1;
          } else {
            // Move forwards
            targetIndex = currentIndex + 1 >= focusable.length ? 0 : currentIndex + 1;
          }

          const target = focusable[targetIndex];
          if (target) {
            target.focus();
            if (
              target instanceof HTMLInputElement &&
              target.type !== 'checkbox' &&
              target.type !== 'radio' &&
              target.type !== 'date'
            ) {
              try {
                target.select();
              } catch {
                // ignore
              }
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [pathname]);

  return null;
}

export default GlobalKeyboardNavigation;
