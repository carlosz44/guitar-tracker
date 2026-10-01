import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetLaunchForTests } from "@/lib/launch";
import { practiceStore } from "@/lib/practice";

afterEach(() => {
  cleanup();
  resetLaunchForTests();
  practiceStore.clear();
  if (typeof localStorage !== "undefined") localStorage.clear();
  vi.unstubAllGlobals();
});

if (typeof window !== "undefined") {
  window.scrollTo = () => undefined;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
