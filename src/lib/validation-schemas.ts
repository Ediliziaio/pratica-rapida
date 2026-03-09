import { z } from "zod";

export const clienteSchema = z.object({
  ragione_sociale: z.string().trim().max(255, "Massimo 255 caratteri").optional().or(z.literal("")),
  tipo: z.enum(["azienda", "persona"]),
  nome: z.string().trim().max(100, "Massimo 100 caratteri").optional().or(z.literal("")),
  cognome: z.string().trim().max(100, "Massimo 100 caratteri").optional().or(z.literal("")),
  codice_fiscale: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (val) => val === "" || /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(val),
      { message: "Codice fiscale non valido (16 caratteri alfanumerici)" }
    )
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || z.string().email().safeParse(val).success,
      { message: "Indirizzo email non valido" }
    )
    .optional()
    .or(z.literal("")),
  pec: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || z.string().email().safeParse(val).success,
      { message: "Indirizzo PEC non valido" }
    )
    .optional()
    .or(z.literal("")),
  telefono: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || /^[\d\s\+\-().]{6,20}$/.test(val),
      { message: "Numero di telefono non valido" }
    )
    .optional()
    .or(z.literal("")),
  piva: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || /^(IT)?\d{11}$/.test(val.replace(/\s/g, "")),
      { message: "Partita IVA non valida (11 cifre, opzionalmente con prefisso IT)" }
    )
    .optional()
    .or(z.literal("")),
  indirizzo: z.string().trim().max(255, "Massimo 255 caratteri").optional().or(z.literal("")),
  citta: z.string().trim().max(100, "Massimo 100 caratteri").optional().or(z.literal("")),
  cap: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || /^\d{5}$/.test(val),
      { message: "CAP non valido (5 cifre)" }
    )
    .optional()
    .or(z.literal("")),
  provincia: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (val) => val === "" || /^[A-Z]{2}$/.test(val),
      { message: "Provincia non valida (2 lettere)" }
    )
    .optional()
    .or(z.literal("")),
  paese: z.string().trim().max(100).optional().or(z.literal("")),
  codice_destinatario_sdi: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || /^[A-Z0-9]{7}$/.test(val.toUpperCase()),
      { message: "Codice SDI non valido (7 caratteri alfanumerici)" }
    )
    .optional()
    .or(z.literal("")),
  referente: z.string().trim().max(200, "Massimo 200 caratteri").optional().or(z.literal("")),
  codice_cliente_interno: z.string().trim().max(50, "Massimo 50 caratteri").optional().or(z.literal("")),
  note_indirizzo: z.string().trim().max(256, "Massimo 256 caratteri").optional().or(z.literal("")),
  note: z.string().trim().max(1024, "Massimo 1024 caratteri").optional().or(z.literal("")),
  invio_documento_cortesia: z.boolean().optional(),
  escludi_documento_cortesia: z.boolean().optional(),
  escludi_solleciti: z.boolean().optional(),
}).refine(
  (data) => {
    // Azienda must have ragione_sociale, persona must have nome
    if (data.tipo === "azienda") return !!data.ragione_sociale?.trim();
    return !!data.nome?.trim();
  },
  { message: "Denominazione obbligatoria per aziende, Nome obbligatorio per persone", path: ["ragione_sociale"] }
);

export type ClienteFormData = z.infer<typeof clienteSchema>;

export const ticketSchema = z.object({
  oggetto: z.string().trim().min(1, "Oggetto obbligatorio").max(200, "Massimo 200 caratteri"),
  descrizione: z.string().trim().min(1, "Descrizione obbligatoria").max(2000, "Massimo 2000 caratteri"),
  priorita: z.enum(["bassa", "normale", "alta"]),
});

export type TicketFormData = z.infer<typeof ticketSchema>;

export const serviceSchema = z.object({
  nome: z.string().trim().min(1, "Nome obbligatorio").max(200, "Massimo 200 caratteri"),
  descrizione: z.string().trim().max(2000, "Massimo 2000 caratteri").optional().or(z.literal("")),
  categoria: z.enum(["fatturazione", "enea_bonus", "finanziamenti", "pratiche_edilizie", "altro"]),
  prezzo_base: z.number().min(0, "Il prezzo non può essere negativo"),
  tempo_stimato_ore: z.number().int().min(0, "Le ore non possono essere negative").optional(),
  attivo: z.boolean(),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;
