import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTHOR_HANDLE, PRODUCT_NAME } from "@/lib/authorIdentity";
import AboutPage from "./page";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

describe("AboutPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the product brand mark next to the title", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: PRODUCT_NAME }),
    ).toBeInTheDocument();

    const marks = screen.getAllByRole("img", { name: PRODUCT_NAME });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("src") ?? "").toContain("app-icon");
  });

  it("loads the author icon from GitHub on each visit", async () => {
    const avatarUrl = "https://avatars.githubusercontent.com/u/1?v=4";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.github.com/users/")) {
        return {
          ok: true,
          json: async () => ({ avatar_url: avatarUrl }),
        } as Response;
      }
      return { ok: false } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AboutPage />);

    const avatar = await waitFor(() => screen.getByRole("img", { name: AUTHOR_HANDLE }));
    expect(avatar.getAttribute("src") ?? "").toContain("avatars.githubusercontent.com");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/users/kjjkjjzyayufqza",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("shows GitHub and Buy Me a Coffee links", () => {
    render(<AboutPage />);

    expect(screen.getByRole("button", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy Me a Coffee" })).toBeInTheDocument();
    expect(screen.getByText("https://buymeacoffee.com/kjjkjj")).toBeInTheDocument();
  });

  it("does not expose an auto-update Release control", () => {
    render(<AboutPage />);

    expect(screen.queryByRole("heading", { name: "Auto-update" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("GitHub token")).not.toBeInTheDocument();
  });
});
