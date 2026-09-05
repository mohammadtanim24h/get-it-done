'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export interface DropdownMenuProps {
  /** Accessible label for the toggle button, e.g. "Actions for Roadmap". */
  buttonLabel: string;
  items: DropdownMenuItem[];
}

export function DropdownMenu({ buttonLabel, items }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        toggleRef.current?.focus();
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Roving focus with arrow keys per the WAI-ARIA menu pattern (Tab still
  // moves through items in DOM order and out of the menu, which closes it).
  function handleMenuKeyDown(event: React.KeyboardEvent) {
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    if (menuItems.length === 0) return;
    const index = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1 + menuItems.length) % menuItems.length;
        break;
      case 'ArrowUp':
        next = index === -1 ? menuItems.length - 1 : (index - 1 + menuItems.length) % menuItems.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = menuItems.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    menuItems[next].focus();
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        ref={toggleRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={buttonLabel}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={buttonLabel}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-indigo-600',
                item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
