import path from 'node:path';

// Must run before any test file's own imports resolve — in particular before
// `./server` is ever imported, so its `if (!process.env.DATABASE_URL)` default
// (prisma/dev.db) never fires. Redirects the whole suite to the disposable
// prisma/test.db created by globalSetup.ts, never the real database.
process.env.DATABASE_URL = `file:${path.resolve(process.cwd(), 'prisma', 'test.db')}`;

import '@testing-library/jest-dom';

// Glide Data Grid and AG Grid require browser APIs not available in jsdom
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// sonner's <Toaster /> (mounted once in App.tsx for the roadmap's undo toasts)
// reads prefers-color-scheme via matchMedia on mount; jsdom has no implementation.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
