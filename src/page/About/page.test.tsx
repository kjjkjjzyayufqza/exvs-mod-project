import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PRODUCT_NAME } from "@/lib/authorIdentity";
import AboutPage from "./page";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
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
});
