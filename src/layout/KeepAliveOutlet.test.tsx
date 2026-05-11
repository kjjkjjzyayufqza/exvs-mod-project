import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KeepAliveOutlet } from "./KeepAliveOutlet";

const mocks = vi.hoisted(() => {
  // Factory must not depend on top-level ESM imports (Vitest mock hoisting).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react") as typeof import("react");
  const secondRoute = "/TestEditor" as const;

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

  return {
    secondRoute,
    RouterItems: [
      {
        title: "Home",
        url: "/",
        element: React.createElement(StatefulHome),
      },
      {
        title: "Test editor",
        url: secondRoute,
        element: React.createElement("div", { "data-testid": "second-page" }, "second-page"),
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
});
