import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EneaLab from "./EneaLab";
import { ENEA_LAB_MOCK_PRACTICES } from "@/features/enea-lab/mockPractices";

vi.mock("@/features/enea-lab/useReadOnlyQueue", () => ({
  useReadOnlyEneaQueue: () => ({
    data: ENEA_LAB_MOCK_PRACTICES,
    error: null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

describe("EneaLab", () => {
  it("mostra la coda ombra e prepara una scheda senza chiamate esterne", () => {
    render(<EneaLab />);

    expect(screen.getByRole("heading", { name: "ENEA Lab" })).toBeInTheDocument();
    expect(screen.getAllByText("Cliente Demo Uno")).toHaveLength(2);
    expect(screen.getByText("Cliente Demo Due")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prepara scheda" }));

    expect(screen.getByText("Scheda di prova preparata")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scheda pronta" })).toBeDisabled();
  });
});
