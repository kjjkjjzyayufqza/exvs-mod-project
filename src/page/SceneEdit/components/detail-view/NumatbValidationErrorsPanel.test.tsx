import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumatbValidationErrorsPanel } from "./NumatbValidationErrorsPanel";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 3) }, (_, index) => ({
        index,
        key: index,
        size: 28,
        start: index * 28,
      })),
  }),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

describe("NumatbValidationErrorsPanel", () => {
  it("mounts only virtualized error rows", () => {
    const errors = Array.from({ length: 40 }, (_, index) => ({
      profile: "maya" as const,
      materialLabel: `material-${index}`,
      paramId: `Texture${index}`,
      isTextures2: false,
      numatbName: "model.numatb",
      message: `Empty texture path ${index}`,
    }));

    render(<NumatbValidationErrorsPanel errors={errors} />);

    expect(screen.getByText("Empty texture path 0")).toBeInTheDocument();
    expect(screen.getByText("Empty texture path 2")).toBeInTheDocument();
    expect(screen.queryByText("Empty texture path 20")).not.toBeInTheDocument();
  });
});
