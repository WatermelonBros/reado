// The top-level error boundary: renders children normally, but catches a render
// exception and shows a recoverable fallback instead of unmounting the tree.
// `../i18n`'s non-React `t` is stubbed to echo the key (react-i18next is already
// mocked globally, but the boundary reads the imperative translator).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../i18n", () => ({ t: (k: string) => k }));

import { ErrorBoundary } from "../ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>hello child</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("hello child")).toBeInTheDocument();
    expect(screen.queryByText("error.title")).not.toBeInTheDocument();
  });

  it("catches a render error and shows the fallback without propagating", () => {
    // React logs caught render errors to console.error; silence it.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    ).not.toThrow();

    expect(screen.getByText("error.title")).toBeInTheDocument();
    expect(screen.getByText("error.body")).toBeInTheDocument();
    // The thrown error message is surfaced for reporting.
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    // Recovery affordances are present.
    expect(screen.getByRole("button", { name: "error.retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "error.reload" })).toBeInTheDocument();

    spy.mockRestore();
  });
});
