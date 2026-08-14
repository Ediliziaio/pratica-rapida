import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EneaLabSourcePractice } from "./types";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import { useDocumentAnalysis } from "./useDocumentAnalysis";

describe("freshness analisi documentale ENEA", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({});
    window.history.replaceState({}, "", "/admin/enea-lab");
  });

  it("rilegge le fatture anche quando il percorso storage non cambia", () => {
    const practice = {
      id: "practice-1",
      queueStatus: "ready",
      documentPaths: [{ kind: "invoice", path: "practice-1/fattura.pdf" }],
    } as unknown as EneaLabSourcePractice;

    useDocumentAnalysis(practice);

    expect(useQueryMock).toHaveBeenCalledOnce();
    const options = useQueryMock.mock.calls[0]?.[0] as {
      staleTime?: number;
      refetchInterval?: number | false;
      refetchOnMount?: boolean | "always";
      refetchOnWindowFocus?: boolean | "always";
    };
    expect(options.staleTime).toBe(0);
    expect(options.refetchInterval).toBe(30_000);
    expect(options.refetchOnMount).toBe("always");
    expect(options.refetchOnWindowFocus).toBe("always");
  });

  it("non espone l'analisi precedente mentre e in corso una rilettura", () => {
    const cachedAnalysis = {
      documents: [],
      items: [],
      blockers: [],
      warnings: [],
    };
    useQueryMock.mockReturnValue({ data: cachedAnalysis, isFetching: true });
    const practice = {
      id: "practice-1",
      queueStatus: "ready",
      documentPaths: [{ kind: "invoice", path: "practice-1/fattura.pdf" }],
    } as unknown as EneaLabSourcePractice;

    const result = useDocumentAnalysis(practice);

    expect(result.isFetching).toBe(true);
    expect(result.data).toBeUndefined();
  });
});
