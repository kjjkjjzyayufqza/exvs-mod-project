import { vi } from "vitest";
import { fireEvent } from "@testing-library/react";

export function mouseEvent(target: Element | Window, type: string, init: MouseEventInit) {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  // Vitest's Window proxy is not accepted by jsdom's UIEvent constructor.
  Object.defineProperty(event, "view", { value: window });
  fireEvent(target, event);
}

/** DOM measurements only: the editor and React Flow run unmocked. */
export function installFlowGeometry() {
  Object.defineProperty(Document.prototype, "elementFromPoint", { configurable: true, value: () => null });
  vi.stubGlobal("ResizeObserver", class {
    private timers = new Set<ReturnType<typeof setTimeout>>();
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (target.isConnected) this.callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }, 0);
      this.timers.add(timer);
    }
    unobserve() {}
    disconnect() { this.timers.forEach(clearTimeout); this.timers.clear(); }
  });
  vi.stubGlobal("DOMMatrixReadOnly", class {
    m22: number;
    constructor(transform: string) { this.m22 = Number(transform?.match(/scale\(([\d.]+)\)/)?.[1] ?? 1); }
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) { return parseFloat(this.style.width) || (this.classList.contains("react-flow__node") ? 240 : 1000); });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) { return parseFloat(this.style.height) || (this.classList.contains("react-flow__node") ? 172 : 650); });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { x: 0, y: 0, left: 0, top: 0, right: this.offsetWidth, bottom: this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight, toJSON: () => ({}) };
  });
}
