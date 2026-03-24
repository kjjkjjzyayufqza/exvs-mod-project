import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { KeepAliveOutlet } from "./KeepAliveOutlet";

const { secondRoute } = vi.hoisted(() => ({ secondRoute: "/TestEditor" as const }));

vi.mock("@/router/router", () => {
  function StatefulHome() {
    const [n, setN] = React.useState(0);
    return (
      <>
        <span data-testid="home-count">{n}</span>
        <button type="button" onClick={() => setN((x) => x + 1)}>
          inc
        </button>
      </>
    );
  }

  return {
    RouterItems: [
      { title: "Home", url: "/", element: <StatefulHome /> },
      {
        title: "Test editor",
        url: secondRoute,
        element: <div data-testid="second-page">second-page</div>,
      },
    ],
  };
});

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
      await router.navigate(secondRoute);
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
