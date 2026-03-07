import '@testing-library/jest-dom';

// Glide Data Grid and AG Grid require browser APIs not available in jsdom
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
