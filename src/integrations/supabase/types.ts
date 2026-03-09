export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          azione: string
          company_id: string | null
          created_at: string
          dettagli: Json | null
          id: string
          pratica_id: string | null
          user_id: string | null
        }
        Insert: {
          azione: string
          company_id?: string | null
          created_at?: string
          dettagli?: Json | null
          id?: string
          pratica_id?: string | null
          user_id?: string | null
        }
        Update: {
          azione?: string
          company_id?: string | null
          created_at?: string
          dettagli?: Json | null
          id?: string
          pratica_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          assegnatario_id: string | null
          company_id: string
          completato: boolean
          completato_at: string | null
          completato_da: string | null
          created_at: string
          id: string
          ordine: number
          pratica_id: string
          titolo: string
        }
        Insert: {
          assegnatario_id?: string | null
          company_id: string
          completato?: boolean
          completato_at?: string | null
          completato_da?: string | null
          created_at?: string
          id?: string
          ordine?: number
          pratica_id: string
          titolo: string
        }
        Update: {
          assegnatario_id?: string | null
          company_id?: string
          completato?: boolean
          completato_at?: string | null
          completato_da?: string | null
          created_at?: string
          id?: string
          ordine?: number
          pratica_id?: string
          titolo?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      clienti_finali: {
        Row: {
          cap: string | null
          citta: string | null
          codice_cliente_interno: string | null
          codice_destinatario_sdi: string | null
          codice_fiscale: string | null
          cognome: string
          company_id: string
          consenso_privacy: boolean
          consenso_privacy_at: string | null
          created_at: string
          email: string | null
          escludi_documento_cortesia: boolean | null
          escludi_solleciti: boolean | null
          id: string
          indirizzo: string | null
          invio_documento_cortesia: boolean | null
          nome: string
          note: string | null
          note_indirizzo: string | null
          paese: string | null
          pec: string | null
          piva: string | null
          provenienza: string | null
          provincia: string | null
          ragione_sociale: string | null
          referente: string | null
          tags: string[] | null
          telefono: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cap?: string | null
          citta?: string | null
          codice_cliente_interno?: string | null
          codice_destinatario_sdi?: string | null
          codice_fiscale?: string | null
          cognome?: string
          company_id: string
          consenso_privacy?: boolean
          consenso_privacy_at?: string | null
          created_at?: string
          email?: string | null
          escludi_documento_cortesia?: boolean | null
          escludi_solleciti?: boolean | null
          id?: string
          indirizzo?: string | null
          invio_documento_cortesia?: boolean | null
          nome?: string
          note?: string | null
          note_indirizzo?: string | null
          paese?: string | null
          pec?: string | null
          piva?: string | null
          provenienza?: string | null
          provincia?: string | null
          ragione_sociale?: string | null
          referente?: string | null
          tags?: string[] | null
          telefono?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          cap?: string | null
          citta?: string | null
          codice_cliente_interno?: string | null
          codice_destinatario_sdi?: string | null
          codice_fiscale?: string | null
          cognome?: string
          company_id?: string
          consenso_privacy?: boolean
          consenso_privacy_at?: string | null
          created_at?: string
          email?: string | null
          escludi_documento_cortesia?: boolean | null
          escludi_solleciti?: boolean | null
          id?: string
          indirizzo?: string | null
          invio_documento_cortesia?: boolean | null
          nome?: string
          note?: string | null
          note_indirizzo?: string | null
          paese?: string | null
          pec?: string | null
          piva?: string | null
          provenienza?: string | null
          provincia?: string | null
          ragione_sociale?: string | null
          referente?: string | null
          tags?: string[] | null
          telefono?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clienti_finali_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cap: string | null
          citta: string | null
          codice_fiscale: string | null
          created_at: string
          email: string | null
          id: string
          indirizzo: string | null
          intestazione: string | null
          lingua: string
          logo_url: string | null
          piva: string | null
          provincia: string | null
          ragione_sociale: string
          settore: string | null
          telefono: string | null
          updated_at: string
          wallet_balance: number
        }
        Insert: {
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          intestazione?: string | null
          lingua?: string
          logo_url?: string | null
          piva?: string | null
          provincia?: string | null
          ragione_sociale: string
          settore?: string | null
          telefono?: string | null
          updated_at?: string
          wallet_balance?: number
        }
        Update: {
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          intestazione?: string | null
          lingua?: string
          logo_url?: string | null
          piva?: string | null
          provincia?: string | null
          ragione_sociale?: string
          settore?: string | null
          telefono?: string | null
          updated_at?: string
          wallet_balance?: number
        }
        Relationships: []
      }
      documenti: {
        Row: {
          caricato_da: string
          company_id: string
          created_at: string
          id: string
          mime_type: string | null
          nome_file: string
          pratica_id: string | null
          size_bytes: number | null
          storage_path: string
          tipo: string | null
          versione: number
          visibilita: Database["public"]["Enums"]["visibilita_documento"]
        }
        Insert: {
          caricato_da: string
          company_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_file: string
          pratica_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          tipo?: string | null
          versione?: number
          visibilita?: Database["public"]["Enums"]["visibilita_documento"]
        }
        Update: {
          caricato_da?: string
          company_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_file?: string
          pratica_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          tipo?: string | null
          versione?: number
          visibilita?: Database["public"]["Enums"]["visibilita_documento"]
        }
        Relationships: [
          {
            foreignKeyName: "documenti_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documenti_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      fattura_righe: {
        Row: {
          aliquota_iva: number
          codice: string
          company_id: string
          created_at: string
          descrizione: string
          fattura_id: string
          id: string
          importo_totale: number
          nome_prodotto: string
          ordine: number
          prezzo_netto: number
          quantita: number
          sconto_pct: number
          unita_misura: string
        }
        Insert: {
          aliquota_iva?: number
          codice?: string
          company_id: string
          created_at?: string
          descrizione?: string
          fattura_id: string
          id?: string
          importo_totale?: number
          nome_prodotto?: string
          ordine?: number
          prezzo_netto?: number
          quantita?: number
          sconto_pct?: number
          unita_misura?: string
        }
        Update: {
          aliquota_iva?: number
          codice?: string
          company_id?: string
          created_at?: string
          descrizione?: string
          fattura_id?: string
          id?: string
          importo_totale?: number
          nome_prodotto?: string
          ordine?: number
          prezzo_netto?: number
          quantita?: number
          sconto_pct?: number
          unita_misura?: string
        }
        Relationships: [
          {
            foreignKeyName: "fattura_righe_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fattura_righe_fattura_id_fkey"
            columns: ["fattura_id"]
            isOneToOne: false
            referencedRelation: "fatture"
            referencedColumns: ["id"]
          },
        ]
      }
      fatture: {
        Row: {
          aliquota_iva: number
          altra_ritenuta: boolean | null
          cassa_professionisti: boolean | null
          centro_ricavo: string | null
          cliente_finale_id: string | null
          codice_destinatario: string | null
          company_id: string
          created_at: string
          data_emissione: string
          documento_trasporto: boolean | null
          emesso_in_seguito_a: string | null
          esigibilita_iva: string | null
          fatt_accompagnatoria: boolean | null
          iban: string | null
          id: string
          imponibile: number
          indirizzo_pec: string | null
          iva: number
          lingua: string
          marca_bollo: boolean | null
          metodo_pagamento: string
          nome_beneficiario: string | null
          nome_istituto_credito: string | null
          note: string | null
          numerazione: string | null
          numero: string
          oggetto: string
          oggetto_interno: string | null
          pdf_url: string | null
          pubblica_amministrazione: boolean | null
          ritenuta_acconto: boolean | null
          rivalsa: boolean | null
          rivalsa_base_pct: number | null
          rivalsa_pct: number | null
          scadenza_pagamento: string | null
          sconto_maggiorazione_totale: boolean | null
          stato: Database["public"]["Enums"]["stato_fattura"]
          totale: number
          updated_at: string
          valuta: string
          xml_url: string | null
        }
        Insert: {
          aliquota_iva?: number
          altra_ritenuta?: boolean | null
          cassa_professionisti?: boolean | null
          centro_ricavo?: string | null
          cliente_finale_id?: string | null
          codice_destinatario?: string | null
          company_id: string
          created_at?: string
          data_emissione?: string
          documento_trasporto?: boolean | null
          emesso_in_seguito_a?: string | null
          esigibilita_iva?: string | null
          fatt_accompagnatoria?: boolean | null
          iban?: string | null
          id?: string
          imponibile?: number
          indirizzo_pec?: string | null
          iva?: number
          lingua?: string
          marca_bollo?: boolean | null
          metodo_pagamento?: string
          nome_beneficiario?: string | null
          nome_istituto_credito?: string | null
          note?: string | null
          numerazione?: string | null
          numero?: string
          oggetto?: string
          oggetto_interno?: string | null
          pdf_url?: string | null
          pubblica_amministrazione?: boolean | null
          ritenuta_acconto?: boolean | null
          rivalsa?: boolean | null
          rivalsa_base_pct?: number | null
          rivalsa_pct?: number | null
          scadenza_pagamento?: string | null
          sconto_maggiorazione_totale?: boolean | null
          stato?: Database["public"]["Enums"]["stato_fattura"]
          totale?: number
          updated_at?: string
          valuta?: string
          xml_url?: string | null
        }
        Update: {
          aliquota_iva?: number
          altra_ritenuta?: boolean | null
          cassa_professionisti?: boolean | null
          centro_ricavo?: string | null
          cliente_finale_id?: string | null
          codice_destinatario?: string | null
          company_id?: string
          created_at?: string
          data_emissione?: string
          documento_trasporto?: boolean | null
          emesso_in_seguito_a?: string | null
          esigibilita_iva?: string | null
          fatt_accompagnatoria?: boolean | null
          iban?: string | null
          id?: string
          imponibile?: number
          indirizzo_pec?: string | null
          iva?: number
          lingua?: string
          marca_bollo?: boolean | null
          metodo_pagamento?: string
          nome_beneficiario?: string | null
          nome_istituto_credito?: string | null
          note?: string | null
          numerazione?: string | null
          numero?: string
          oggetto?: string
          oggetto_interno?: string | null
          pdf_url?: string | null
          pubblica_amministrazione?: boolean | null
          ritenuta_acconto?: boolean | null
          rivalsa?: boolean | null
          rivalsa_base_pct?: number | null
          rivalsa_pct?: number | null
          scadenza_pagamento?: string | null
          sconto_maggiorazione_totale?: boolean | null
          stato?: Database["public"]["Enums"]["stato_fattura"]
          totale?: number
          updated_at?: string
          valuta?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fatture_cliente_finale_id_fkey"
            columns: ["cliente_finale_id"]
            isOneToOne: false
            referencedRelation: "clienti_finali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatture_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      note_credito: {
        Row: {
          causale: string | null
          company_id: string
          created_at: string
          data_emissione: string
          fattura_id: string | null
          id: string
          importo: number
          numero: string
          pdf_url: string | null
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          causale?: string | null
          company_id: string
          created_at?: string
          data_emissione?: string
          fattura_id?: string | null
          id?: string
          importo?: number
          numero?: string
          pdf_url?: string | null
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          causale?: string | null
          company_id?: string
          created_at?: string
          data_emissione?: string
          fattura_id?: string | null
          id?: string
          importo?: number
          numero?: string
          pdf_url?: string | null
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_credito_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_credito_fattura_id_fkey"
            columns: ["fattura_id"]
            isOneToOne: false
            referencedRelation: "fatture"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          letto: boolean
          link: string | null
          messaggio: string
          pratica_id: string | null
          tipo: string
          titolo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          letto?: boolean
          link?: string | null
          messaggio?: string
          pratica_id?: string | null
          tipo?: string
          titolo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          letto?: boolean
          link?: string | null
          messaggio?: string
          pratica_id?: string | null
          tipo?: string
          titolo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      practice_messages: {
        Row: {
          company_id: string
          created_at: string
          id: string
          messaggio: string
          pratica_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          messaggio?: string
          pratica_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          messaggio?: string
          pratica_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_messages_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      pratiche: {
        Row: {
          assegnatario_id: string | null
          categoria: Database["public"]["Enums"]["service_category"]
          cliente_finale_id: string | null
          company_id: string
          created_at: string
          creato_da: string
          dati_pratica: Json | null
          descrizione: string | null
          id: string
          note_consegna: string | null
          output_urls: Json | null
          pagamento_stato: Database["public"]["Enums"]["pagamento_stato"]
          prezzo: number
          priorita: Database["public"]["Enums"]["priorita"]
          scadenza: string | null
          service_id: string | null
          stato: Database["public"]["Enums"]["pratica_stato"]
          titolo: string
          updated_at: string
          valuta: string
        }
        Insert: {
          assegnatario_id?: string | null
          categoria: Database["public"]["Enums"]["service_category"]
          cliente_finale_id?: string | null
          company_id: string
          created_at?: string
          creato_da: string
          dati_pratica?: Json | null
          descrizione?: string | null
          id?: string
          note_consegna?: string | null
          output_urls?: Json | null
          pagamento_stato?: Database["public"]["Enums"]["pagamento_stato"]
          prezzo?: number
          priorita?: Database["public"]["Enums"]["priorita"]
          scadenza?: string | null
          service_id?: string | null
          stato?: Database["public"]["Enums"]["pratica_stato"]
          titolo?: string
          updated_at?: string
          valuta?: string
        }
        Update: {
          assegnatario_id?: string | null
          categoria?: Database["public"]["Enums"]["service_category"]
          cliente_finale_id?: string | null
          company_id?: string
          created_at?: string
          creato_da?: string
          dati_pratica?: Json | null
          descrizione?: string | null
          id?: string
          note_consegna?: string | null
          output_urls?: Json | null
          pagamento_stato?: Database["public"]["Enums"]["pagamento_stato"]
          prezzo?: number
          priorita?: Database["public"]["Enums"]["priorita"]
          scadenza?: string | null
          service_id?: string | null
          stato?: Database["public"]["Enums"]["pratica_stato"]
          titolo?: string
          updated_at?: string
          valuta?: string
        }
        Relationships: [
          {
            foreignKeyName: "pratiche_cliente_finale_id_fkey"
            columns: ["cliente_finale_id"]
            isOneToOne: false
            referencedRelation: "clienti_finali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pratiche_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pratiche_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cognome: string
          created_at: string
          email: string
          id: string
          nome: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cognome?: string
          created_at?: string
          email?: string
          id: string
          nome?: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cognome?: string
          created_at?: string
          email?: string
          id?: string
          nome?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proforma: {
        Row: {
          cliente_finale_id: string | null
          company_id: string
          created_at: string
          data_emissione: string
          id: string
          importo: number
          note: string | null
          numero: string
          oggetto: string
          pdf_url: string | null
          scadenza: string | null
          updated_at: string
        }
        Insert: {
          cliente_finale_id?: string | null
          company_id: string
          created_at?: string
          data_emissione?: string
          id?: string
          importo?: number
          note?: string | null
          numero?: string
          oggetto?: string
          pdf_url?: string | null
          scadenza?: string | null
          updated_at?: string
        }
        Update: {
          cliente_finale_id?: string | null
          company_id?: string
          created_at?: string
          data_emissione?: string
          id?: string
          importo?: number
          note?: string | null
          numero?: string
          oggetto?: string
          pdf_url?: string | null
          scadenza?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_cliente_finale_id_fkey"
            columns: ["cliente_finale_id"]
            isOneToOne: false
            referencedRelation: "clienti_finali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          attivo: boolean
          categoria: Database["public"]["Enums"]["service_category"]
          checklist_template: Json | null
          created_at: string
          descrizione: string | null
          documenti_richiesti: Json | null
          id: string
          nome: string
          prezzo_base: number
          tempo_stimato_ore: number | null
          updated_at: string
          varianti: Json | null
        }
        Insert: {
          attivo?: boolean
          categoria: Database["public"]["Enums"]["service_category"]
          checklist_template?: Json | null
          created_at?: string
          descrizione?: string | null
          documenti_richiesti?: Json | null
          id?: string
          nome: string
          prezzo_base?: number
          tempo_stimato_ore?: number | null
          updated_at?: string
          varianti?: Json | null
        }
        Update: {
          attivo?: boolean
          categoria?: Database["public"]["Enums"]["service_category"]
          checklist_template?: Json | null
          created_at?: string
          descrizione?: string | null
          documenti_richiesti?: Json | null
          id?: string
          nome?: string
          prezzo_base?: number
          tempo_stimato_ore?: number | null
          updated_at?: string
          varianti?: Json | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          company_id: string
          created_at: string
          descrizione: string
          id: string
          oggetto: string
          priorita: Database["public"]["Enums"]["ticket_priorita"]
          risposta: string | null
          stato: Database["public"]["Enums"]["ticket_stato"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          descrizione?: string
          id?: string
          oggetto: string
          priorita?: Database["public"]["Enums"]["ticket_priorita"]
          risposta?: string | null
          stato?: Database["public"]["Enums"]["ticket_stato"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          descrizione?: string
          id?: string
          oggetto?: string
          priorita?: Database["public"]["Enums"]["ticket_priorita"]
          risposta?: string | null
          stato?: Database["public"]["Enums"]["ticket_stato"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_company_assignments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_movements: {
        Row: {
          causale: string
          company_id: string
          created_at: string
          eseguito_da: string | null
          id: string
          importo: number
          pratica_id: string | null
          tipo: Database["public"]["Enums"]["movimento_tipo"]
        }
        Insert: {
          causale?: string
          company_id: string
          created_at?: string
          eseguito_da?: string | null
          id?: string
          importo: number
          pratica_id?: string | null
          tipo: Database["public"]["Enums"]["movimento_tipo"]
        }
        Update: {
          causale?: string
          company_id?: string
          created_at?: string
          eseguito_da?: string | null
          id?: string
          importo?: number
          pratica_id?: string | null
          tipo?: Database["public"]["Enums"]["movimento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "wallet_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_movements_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_internal: { Args: { _user_id: string }; Returns: boolean }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      wallet_deduct: {
        Args: {
          _company_id: string
          _importo: number
          _pratica_id: string
          _user_id: string
        }
        Returns: boolean
      }
      wallet_refund: {
        Args: {
          _causale: string
          _company_id: string
          _importo: number
          _pratica_id: string
          _user_id: string
        }
        Returns: undefined
      }
      wallet_topup: {
        Args: {
          _causale: string
          _company_id: string
          _importo: number
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin_interno"
        | "operatore"
        | "azienda_admin"
        | "azienda_user"
        | "partner"
      movimento_tipo: "credito" | "debito"
      pagamento_stato: "non_pagata" | "pagata" | "in_verifica" | "rimborsata"
      pratica_stato:
        | "bozza"
        | "inviata"
        | "in_lavorazione"
        | "in_attesa_documenti"
        | "completata"
        | "annullata"
      priorita: "bassa" | "normale" | "alta" | "urgente"
      service_category:
        | "fatturazione"
        | "enea_bonus"
        | "finanziamenti"
        | "pratiche_edilizie"
        | "altro"
      stato_fattura: "bozza" | "emessa" | "pagata"
      ticket_priorita: "bassa" | "normale" | "alta"
      ticket_stato: "aperto" | "in_lavorazione" | "risolto" | "chiuso"
      visibilita_documento: "azienda_interno" | "solo_interno"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin_interno",
        "operatore",
        "azienda_admin",
        "azienda_user",
        "partner",
      ],
      movimento_tipo: ["credito", "debito"],
      pagamento_stato: ["non_pagata", "pagata", "in_verifica", "rimborsata"],
      pratica_stato: [
        "bozza",
        "inviata",
        "in_lavorazione",
        "in_attesa_documenti",
        "completata",
        "annullata",
      ],
      priorita: ["bassa", "normale", "alta", "urgente"],
      service_category: [
        "fatturazione",
        "enea_bonus",
        "finanziamenti",
        "pratiche_edilizie",
        "altro",
      ],
      stato_fattura: ["bozza", "emessa", "pagata"],
      ticket_priorita: ["bassa", "normale", "alta"],
      ticket_stato: ["aperto", "in_lavorazione", "risolto", "chiuso"],
      visibilita_documento: ["azienda_interno", "solo_interno"],
    },
  },
} as const
