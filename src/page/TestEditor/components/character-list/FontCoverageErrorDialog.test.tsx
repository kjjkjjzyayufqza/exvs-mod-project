import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FontCoverageErrorDialog } from "./FontCoverageErrorDialog";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 32,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 4) }, (_, index) => ({
        index,
        key: index,
        start: index * 32,
      })),
    measureElement: vi.fn(),
  }),
}));

vi.mock("@/components/AppRndModalShell", () => ({
  AppRndModalShell: ({
    title,
    children,
    footer,
  }: {
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  ),
}));

describe("FontCoverageErrorDialog", () => {
  it("renders only the virtualized subset of missing codepoints", () => {
    render(
      <FontCoverageErrorDialog
        open
        errors={[
          {
            characterId: 10,
            fieldName: "name",
            fieldLabel: "Name",
            missing: Array.from({ length: 20 }, (_, index) => ({
              cp: 0x10000 + index,
              hex: `U+${(0x10000 + index).toString(16).toUpperCase()}`,
              char: String.fromCodePoint(0x10000 + index),
            })),
          },
        ]}
        onClose={() => {}}
        onForceSave={() => {}}
      />,
    );

    expect(screen.getByText("Character ID 10 · Name")).toBeInTheDocument();
    expect(screen.getByText(/U\+10000/)).toBeInTheDocument();
    expect(screen.queryByText(/U\+10010/)).not.toBeInTheDocument();
  });
});
