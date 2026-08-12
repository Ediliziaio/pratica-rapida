import { Component, type ErrorInfo, type ReactNode } from "react";

export function RootLoadingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6" aria-busy="true">
      <p role="status" className="text-sm text-slate-600">Caricamento applicazione…</p>
    </main>
  );
}

type Props = { children: ReactNode; reloadPage?: () => void };
type State = { error: Error | null };

export class RootBootstrapBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[bootstrap] caricamento applicazione fallito", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold text-slate-950">Applicazione non disponibile</h1>
          <p className="text-sm text-slate-600">
            Il caricamento non è riuscito. Riprova senza perdere l’indirizzo corrente.
          </p>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => (this.props.reloadPage ?? (() => window.location.reload()))()}
          >
            Ricarica pagina
          </button>
        </div>
      </main>
    );
  }
}
