import { lazy, Suspense } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RootBootstrapBoundary, RootLoadingFallback } from "./RootBootstrapState";

describe("stato bootstrap applicazione", () => {
  it("mostra uno stato accessibile mentre il root chunk è in attesa", () => {
    const PendingRoot = lazy(() => new Promise<never>(() => undefined));

    render(
      <RootBootstrapBoundary>
        <Suspense fallback={<RootLoadingFallback />}><PendingRoot /></Suspense>
      </RootBootstrapBoundary>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Caricamento applicazione…");
  });

  it("mostra una diagnosi e permette il reload se il root chunk fallisce", async () => {
    const reload = vi.fn();
    const FailedRoot = lazy(() => Promise.reject(new Error("chunk non disponibile")));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <RootBootstrapBoundary reloadPage={reload}>
        <Suspense fallback={<RootLoadingFallback />}><FailedRoot /></Suspense>
      </RootBootstrapBoundary>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Applicazione non disponibile");
    fireEvent.click(screen.getByRole("button", { name: "Ricarica pagina" }));
    expect(reload).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
