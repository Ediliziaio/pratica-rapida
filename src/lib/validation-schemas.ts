import { z } from "zod";

export const clienteSchema = z.object({
  nome: z.string().trim().min(1, "Il nome è obbligatorio").max(100, "Massimo 100 caratteri"),
  cognome: z.string().trim().min(1, "Il cognome è obbligatorio").max(100, "Massimo 100 caratteri"),
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
  telefono: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || /^[\d\s\+\-().]{6,20}$/.test(val),
      { message: "Numero di telefono non valido" }
    )
    .optional()
    .or(z.literal("")),
  indirizzo: z.string().trim().max(255, "Massimo 255 caratteri").optional().or(z.literal("")),
});

export type ClienteFormData = z.infer<typeof clienteSchema>;
