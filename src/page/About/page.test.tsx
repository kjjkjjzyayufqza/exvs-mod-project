import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PRODUCT_NAME } from "@/lib/authorIdentity";
import AboutPage from "./page";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "0.1.0"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(async () => ({
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => true),
      save: vi.fn(async () => undefined),
    })),
  },
}));

describe("AboutPage", () => {
  it("shows the product brand mark next to the title", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: PRODUCT_NAME }),
    ).toBeInTheDocument();

    const marks = screen.getAllByRole("img", { name: PRODUCT_NAME });
    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => (mark.getAttribute("src") ?? "").includes("app-icon"))).toBe(
      true,
    );
  });

  it("exposes an auto-update check on the About page", async () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "Auto-update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("0.1.0")).toBeInTheDocument();
    });
  });
});
