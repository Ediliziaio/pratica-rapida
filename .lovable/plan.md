

# Barra in Basso: Nascondi allo Scroll, Ricompari al "Il Nostro Team"

## Comportamento desiderato
1. La barra in basso e' visibile all'inizio della pagina
2. Quando l'utente inizia a scorrere (dopo qualche pixel), la barra sparisce con una transizione
3. Quando l'utente arriva alla sezione "Il Nostro Team", la barra ricompare

## Soluzione tecnica

### 1. Aggiungere un `ref` alla sezione "Il Nostro Team" (riga 870)
Aggiungere un `useRef` per identificare la sezione e un `IntersectionObserver` per rilevare quando diventa visibile.

### 2. Aggiungere stato e logica di visibilita'
- `showBottomBar`: stato booleano, inizia `true`
- `useEffect` con listener su `scroll`: se `scrollY > 200`, nasconde la barra
- `IntersectionObserver` sulla sezione "Il Nostro Team": quando entra in viewport, mostra la barra

### 3. Applicare transizione alla barra (riga 1114)
Aggiungere classi di transizione e condizione di visibilita':

```text
<div className={`fixed bottom-0 left-0 right-0 z-50 bg-[#0a1628] border-t border-white/10 shadow-2xl transition-transform duration-500 ${showBottomBar ? 'translate-y-0' : 'translate-y-full'}`}>
```

### Riepilogo modifiche

| File | Modifica |
|------|----------|
| `src/pages/Home.tsx` | 1) Aggiungere `useState` per `showBottomBar` e `useRef` per la sezione team. 2) Aggiungere `useEffect` con scroll listener + IntersectionObserver. 3) Riga 870: aggiungere `ref` al div della sezione. 4) Riga 1114: aggiungere transizione condizionale `translate-y-0/translate-y-full`. |

