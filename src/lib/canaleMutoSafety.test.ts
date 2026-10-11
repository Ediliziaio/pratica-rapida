/**
 * EneaSubito non manda niente al cliente. Mai.
 *
 * Nessuna richiesta di recensione, nessun WhatsApp, nessun sollecito, e
 * nemmeno la consegna della pratica finita: quella la manda il Titolare a
 * mano. L'unica cosa che il cliente riceve e' la conferma di pagamento e la
 * fattura, e partono da Stripe.
 *
 * E' una decisione sua, e qui sta scritta in modo che resti vera: se un
 * domani qualcuno tocca il guardiano dei contatti, questi test si rompono
 * prima che si rompa il silenzio.
 *
 * L'altra meta' dei test e' altrettanto importante: le pratiche di Pratica
 * Rapida — quelle senza canale — devono comportarsi **esattamente** come
 * prima. Il canale muto non deve zittire nessun altro.
 */
import { describe, expect, it } from "vitest";
import {
  isCanaleMuto,
  isServizioCompleto,
  puoContattareCliente,
  puoInviarePraticaAlCliente,
} from "../../supabase/functions/_shared/contatto-cliente";

describe("EneaSubito non scrive mai al cliente", () => {
  const pratica = { tipo_servizio: "servizio_completo", canale: "eneasubito" };

  it("è riconosciuto come canale muto", () => {
    expect(isCanaleMuto(pratica)).toBe(true);
  });

  it("non si contatta, nemmeno col servizio completo", () => {
    // Le pratiche di EneaSubito nascono proprio con "servizio_completo":
    // senza il canale passerebbero tutte le porte.
    expect(puoContattareCliente(pratica)).toBe(false);
    expect(isServizioCompleto(pratica)).toBe(false);
  });

  it("non riceve la pratica finita, nemmeno se qualcuno alza il permesso", () => {
    expect(
      puoInviarePraticaAlCliente({
        tipo_servizio: "documenti_forniti",
        invia_pratica_al_cliente: true,
        canale: "eneasubito",
      }),
    ).toBe(false);
  });
});

describe("Pratica Rapida resta identica a prima", () => {
  it("il servizio completo senza canale si contatta come sempre", () => {
    expect(puoContattareCliente({ tipo_servizio: "servizio_completo" })).toBe(true);
    expect(puoContattareCliente({ tipo_servizio: "servizio_completo", canale: null })).toBe(true);
  });

  it("i documenti forniti restano muti come sempre", () => {
    expect(puoContattareCliente({ tipo_servizio: "documenti_forniti" })).toBe(false);
    expect(puoContattareCliente({ tipo_servizio: "pratica_only" })).toBe(false);
  });

  it("l'eccezione dell'invio al cliente finale continua a funzionare", () => {
    expect(
      puoInviarePraticaAlCliente({
        tipo_servizio: "documenti_forniti",
        invia_pratica_al_cliente: true,
      }),
    ).toBe(true);
  });

  it("un canale che non e' muto non cambia niente", () => {
    expect(puoContattareCliente({ tipo_servizio: "servizio_completo", canale: "rivenditore" })).toBe(true);
  });
});
