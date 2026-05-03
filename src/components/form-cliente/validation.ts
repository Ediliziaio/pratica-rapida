// Validazione per step del form pubblico cliente.
// Ogni funzione ritorna un dizionario { fieldKey: messaggioErrore }.
// Lo step "Avanti" è disabilitato finché Object.keys(errors).length > 0.

import {
  CF_RE,
  EMAIL_RE,
  FormClienteData,
  isValidPhone,
  ProdottoTipo,
  StepId,
} from "@/types/form-cliente";

export type ErrorMap = Record<string, string>;

export function validateRichiedente(d: FormClienteData): ErrorMap {
  const e: ErrorMap = {};
  const r = d.richiedente;
  if (!r.nome.trim()) e["richiedente.nome"] = "Nome obbligatorio";
  if (!r.cognome.trim()) e["richiedente.cognome"] = "Cognome obbligatorio";
  if (!r.comune_nascita.trim()) e["richiedente.comune_nascita"] = "Comune di nascita obbligatorio";
  if (!r.provincia_nascita.trim()) e["richiedente.provincia_nascita"] = "Provincia obbligatoria";
  if (!r.data_nascita) e["richiedente.data_nascita"] = "Data di nascita obbligatoria";
  if (!r.cf.trim()) {
    e["richiedente.cf"] = "Codice fiscale obbligatorio";
  } else if (!CF_RE.test(r.cf)) {
    e["richiedente.cf"] = "Codice fiscale non valido (16 caratteri formato italiano)";
  }
  if (!r.email.trim()) {
    e["richiedente.email"] = "Email obbligatoria";
  } else if (!EMAIL_RE.test(r.email)) {
    e["richiedente.email"] = "Email non valida";
  }
  if (!r.telefono.trim()) {
    e["richiedente.telefono"] = "Telefono obbligatorio";
  } else if (!isValidPhone(r.telefono)) {
    e["richiedente.telefono"] = "Numero di telefono non valido";
  }
  if (r.abitazione_principale === null) {
    e["richiedente.abitazione_principale"] = "Indica se è l'abitazione principale";
  }
  return e;
}

export function validateIndirizzo(d: FormClienteData): ErrorMap {
  const e: ErrorMap = {};
  const r = d.residenza;
  if (!r.comune.trim()) e["residenza.comune"] = "Comune obbligatorio";
  if (!r.provincia.trim()) e["residenza.provincia"] = "Provincia obbligatoria";
  if (!r.indirizzo.trim()) e["residenza.indirizzo"] = "Indirizzo obbligatorio";
  if (!r.civico.trim()) e["residenza.civico"] = "Numero civico obbligatorio";
  if (!r.cap.trim()) e["residenza.cap"] = "CAP obbligatorio";
  if (r.stesso_indirizzo_lavori === null) {
    e["residenza.stesso_indirizzo_lavori"] = "Indica se è lo stesso indirizzo dei lavori";
  }
  if (r.stesso_indirizzo_lavori === false) {
    const a = d.appartamento_lavori;
    if (!a.comune.trim()) e["appartamento_lavori.comune"] = "Comune obbligatorio";
    if (!a.provincia.trim()) e["appartamento_lavori.provincia"] = "Provincia obbligatoria";
    if (!a.indirizzo.trim()) e["appartamento_lavori.indirizzo"] = "Indirizzo obbligatorio";
    if (!a.numero.trim()) e["appartamento_lavori.numero"] = "Numero civico obbligatorio";
    if (!a.cap.trim()) e["appartamento_lavori.cap"] = "CAP obbligatorio";
  }
  return e;
}

export function validateCointestazione(d: FormClienteData): ErrorMap {
  const e: ErrorMap = {};
  const c = d.cointestazione;
  if (c.presente === null) {
    e["cointestazione.presente"] = "Indica se la pratica è cointestata";
    return e;
  }
  if (c.presente) {
    if (!c.nome.trim()) e["cointestazione.nome"] = "Nome cointestatario obbligatorio";
    if (!c.cognome.trim()) e["cointestazione.cognome"] = "Cognome cointestatario obbligatorio";
    if (!c.cf.trim()) {
      e["cointestazione.cf"] = "CF cointestatario obbligatorio";
    } else if (!CF_RE.test(c.cf)) {
      e["cointestazione.cf"] = "Codice fiscale non valido";
    }
  }
  return e;
}

export function validateCatastali(d: FormClienteData): ErrorMap {
  const e: ErrorMap = {};
  const c = d.catastali;
  if (!c.recupero_richiesto) {
    if (!c.foglio.trim()) e["catastali.foglio"] = "Foglio obbligatorio";
    if (!c.mappale.trim()) e["catastali.mappale"] = "Mappale o particella obbligatorio";
    // Subalterno opzionale per legge: alcuni edifici non lo hanno
  } else {
    if (!c.proprietario_nome.trim()) e["catastali.proprietario_nome"] = "Nome proprietario obbligatorio";
    if (!c.proprietario_cognome.trim()) e["catastali.proprietario_cognome"] = "Cognome proprietario obbligatorio";
    if (!c.proprietario_cf.trim()) {
      e["catastali.proprietario_cf"] = "CF proprietario obbligatorio";
    } else if (!CF_RE.test(c.proprietario_cf)) {
      e["catastali.proprietario_cf"] = "Codice fiscale non valido";
    }
  }
  return e;
}

export function validateEdificio(d: FormClienteData): ErrorMap {
  const e: ErrorMap = {};
  const ed = d.edificio;
  if (!ed.anno_costruzione.trim()) {
    e["edificio.anno_costruzione"] = "Anno di costruzione obbligatorio";
  } else {
    const n = Number(ed.anno_costruzione);
    if (!Number.isFinite(n) || n < 1800 || n > 2100) {
      e["edificio.anno_costruzione"] = "Anno non valido";
    }
  }
  if (!ed.superficie_mq.trim()) {
    e["edificio.superficie_mq"] = "Superficie obbligatoria";
  } else if (Number(ed.superficie_mq) <= 0) {
    e["edificio.superficie_mq"] = "Superficie non valida";
  }
  if (!ed.numero_appartamenti.trim()) {
    e["edificio.numero_appartamenti"] = "Numero appartamenti obbligatorio";
  } else if (Number(ed.numero_appartamenti) <= 0) {
    e["edificio.numero_appartamenti"] = "Numero non valido";
  }
  if (!ed.titolo_richiedente) e["edificio.titolo_richiedente"] = "Titolo obbligatorio";
  if (!ed.tipologia) e["edificio.tipologia"] = "Tipologia obbligatoria";
  return e;
}

export function validateImpianto(d: FormClienteData): ErrorMap {
  const e: ErrorMap = {};
  const i = d.impianto;
  if (!i.tipo) e["impianto.tipo"] = "Tipo impianto obbligatorio";
  if (!i.terminali) e["impianto.terminali"] = "Terminali obbligatori";
  if (!i.combustibile) e["impianto.combustibile"] = "Combustibile obbligatorio";
  if (!i.tipo_caldaia) e["impianto.tipo_caldaia"] = "Tipo caldaia obbligatorio";
  if (i.aria_condizionata === null) e["impianto.aria_condizionata"] = "Indica se è presente l'aria condizionata";
  return e;
}

export function validateProdotto(d: FormClienteData, tipo: ProdottoTipo): ErrorMap {
  const e: ErrorMap = {};
  const p = d.prodotto;
  if (tipo === "infissi" && p.tipo === "infissi") {
    if (!p.vecchi_materiale) e["prodotto.vecchi_materiale"] = "Materiale infissi vecchi obbligatorio";
    if (!p.vecchi_vetro) e["prodotto.vecchi_vetro"] = "Tipo vetro vecchio obbligatorio";
    if (!p.nuovi_materiale) e["prodotto.nuovi_materiale"] = "Materiale nuovi infissi obbligatorio";
    if (!p.nuovi_vetro) e["prodotto.nuovi_vetro"] = "Tipo vetro nuovo obbligatorio";
    if (p.zanzariere_tapparelle === null) {
      e["prodotto.zanzariere_tapparelle"] = "Indica se sono state montate zanzariere/tapparelle/persiane";
    }
  }
  if (tipo === "schermature" && p.tipo === "schermature") {
    if (!p.items.length) {
      e["prodotto.items"] = "Aggiungi almeno una schermatura";
    }
    p.items.forEach((it, idx) => {
      if (!it.tipo) e[`prodotto.items.${idx}.tipo`] = "Tipo prodotto obbligatorio";
      if (!it.direzione) e[`prodotto.items.${idx}.direzione`] = "Direzione obbligatoria";
    });
  }
  if (tipo === "impianto_termico" && p.tipo === "impianto_termico") {
    if (!d.impianto.libretto_url) {
      e["prodotto.libretto"] = "Carica il libretto dell'impianto";
    }
  }
  return e;
}

export function validateStep(
  step: StepId,
  data: FormClienteData,
  prodottoTipo: ProdottoTipo,
): ErrorMap {
  switch (step) {
    case "richiedente":
      return validateRichiedente(data);
    case "indirizzo":
      return validateIndirizzo(data);
    case "cointestazione":
      return validateCointestazione(data);
    case "catastali":
      return validateCatastali(data);
    case "edificio":
      return validateEdificio(data);
    case "impianto":
      return validateImpianto(data);
    case "prodotto":
      return validateProdotto(data, prodottoTipo);
    case "recap":
      // Tutti gli step precedenti devono passare prima del submit
      return {
        ...validateRichiedente(data),
        ...validateIndirizzo(data),
        ...validateCointestazione(data),
        ...validateCatastali(data),
        ...validateEdificio(data),
        ...validateImpianto(data),
        ...validateProdotto(data, prodottoTipo),
      };
    default:
      return {};
  }
}
