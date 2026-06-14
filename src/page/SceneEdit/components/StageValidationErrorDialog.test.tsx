import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StageValidationErrorDialog } from "./StageValidationErrorDialog";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 32,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 3) }, (_, index) => ({
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

describe("StageValidationErrorDialog", () => {
  it("mounts only virtualized validation rows", () => {
    const errors = Array.from({ length: 50 }, (_, index) => ({
      phase: "texture",
      message: `Missing texture ${index}`,
      path: `C:/stage/object-a/material-${index}.numatb`,
    }));

    render(
      <StageValidationErrorDialog
        open
        errors={errors}
        knownFolderNames={["object-a"]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("object-a")).toBeInTheDocument();
    expect(screen.getByText("Missing texture 0")).toBeInTheDocument();
    expect(screen.getByText("Missing texture 1")).toBeInTheDocument();
    expect(screen.queryByText("Missing texture 20")).not.toBeInTheDocument();
  });
});
