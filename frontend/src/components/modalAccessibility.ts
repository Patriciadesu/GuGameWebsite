import { useLayoutEffect, useRef, type RefObject } from 'react';

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

const modalStack: HTMLElement[] = [];

interface ModalAccessibilityOptions {
  active: boolean;
  dialogRef: RefObject<HTMLElement>;
  onClose: () => void;
  onEscape?: () => boolean;
  restoreFocusRef?: RefObject<HTMLElement | SVGElement>;
  setDialogSemantics?: boolean;
}

export function useModalAccessibility({
  active,
  dialogRef,
  onClose,
  onEscape,
  restoreFocusRef,
  setDialogSemantics = false
}: ModalAccessibilityOptions) {
  const closeRef = useRef(onClose);
  const escapeRef = useRef(onEscape);
  closeRef.current = onClose;
  escapeRef.current = onEscape;

  useLayoutEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const opener = restoreFocusRef?.current || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (setDialogSemantics) {
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.tabIndex = -1;
      const heading = dialog.querySelector<HTMLElement>('h1, h2, h3');
      if (heading) {
        heading.id ||= `admin-modal-title-${Math.random().toString(36).slice(2)}`;
        dialog.setAttribute('aria-labelledby', heading.id);
      } else {
        dialog.setAttribute('aria-label', 'Admin dialog');
      }
    }

    const inerted: Array<{ element: HTMLElement; wasInert: boolean }> = [];
    let branch: HTMLElement | null = dialog;
    while (branch?.parentElement) {
      const parent: HTMLElement = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        inerted.push({ element: sibling, wasInert: sibling.inert });
        sibling.inert = true;
      }
      branch = parent;
      if (parent === document.body) break;
    }

    modalStack.push(dialog);
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter(element => !element.closest('[inert]'));
    const focusFrame = window.requestAnimationFrame(() => {
      (dialog.querySelector<HTMLElement>('[data-modal-initial-focus]') || focusable()[0] || dialog).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!escapeRef.current?.()) closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = modalStack.lastIndexOf(dialog);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      inerted.reverse().forEach(({ element, wasInert }) => { element.inert = wasInert; });
      window.requestAnimationFrame(() => {
        if (opener?.isConnected && !opener.closest('[inert]')) opener.focus();
      });
    };
  }, [active, dialogRef, restoreFocusRef, setDialogSemantics]);
}
