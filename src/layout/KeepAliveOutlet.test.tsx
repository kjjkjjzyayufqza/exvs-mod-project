import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KeepAliveOutlet } from "./KeepAliveOutlet";

const mocks = vi.hoisted(() => {
  // Factory must not depend on top-level ESM imports (Vitest mock hoisting).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react") as typeof import("react");
  // Must be a real sidebar route: pathMatch resolves against the live SIDEBAR_ROUTE_URLS.
  const secondRoute = "/SingleFhm2d" as const;

  function StatefulHome() {
    const [n, setN] = React.useState(0);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("span", { "data-testid": "home-count" }, n),
      React.createElement(
        "button",
        { type: "button", onClick: () => setN((x: number) => x + 1) },
        "inc",
      ),
    );
  }

  function BoomPage(): React.ReactElement {
    throw new Error("unit-model boom");
  }

  return {
    secondRoute,
    boomRoute: "/UnitModelEdit" as const,
    RouterItems: [
      {
        title: "EXVS2 Workspace",
        url: "/",
        element: React.createElement(StatefulHome),
      },
      {
        title: "Single FHM2D",
        url: secondRoute,
        element: React.createElement("div", { "data-testid": "second-page" }, "second-page"),
      },
      {
        title: "Unit Model Editor",
        url: "/UnitModelEdit",
        element: React.createElement(BoomPage),
      },
    ],
  };
});

vi.mock("@/router/router", () => ({
  RouterItems: mocks.RouterItems,
}));

describe("KeepAliveOutlet", () => {
  it("keeps local state when navigating away and back", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: <KeepAliveOutlet />,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("home-count")).toHaveTextContent("0");
    await user.click(screen.getByRole("button", { name: "inc" }));
    expect(screen.getByTestId("home-count")).toHaveTextContent("1");

    await act(async () => {
      await router.navigate(mocks.secondRoute);
    });
    await waitFor(() => {
      expect(screen.getByTestId("second-page")).toBeInTheDocument();
    });

    await act(async () => {
      await router.navigate("/");
    });
    await waitFor(() => {
      expect(screen.getByTestId("home-count")).toHaveTextContent("1");
    });
  });

  it("keeps other KeepAlive pages mounted when one page throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: <KeepAliveOutlet />,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("home-count")).toHaveTextContent("0");

    await act(async () => {
      await router.navigate(mocks.boomRoute);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    await act(async () => {
      await router.navigate("/");
    });
    await waitFor(() => {
      expect(screen.getByTestId("home-count")).toHaveTextContent("0");
    });
    consoleError.mockRestore();
  });
});
