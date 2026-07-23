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
    PostgrestVersion: "14.4"
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
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
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
      automation_rules: {
        Row: {
          category: string | null
          channel: Database["public"]["Enums"]["comm_channel"]
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          max_hour: number | null
          min_hour: number | null
          name: string
          order_index: number | null
          template_body: string | null
          template_id: string | null
          trigger_config: Json | null
          trigger_event: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          channel: Database["public"]["Enums"]["comm_channel"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          max_hour?: number | null
          min_hour?: number | null
          name: string
          order_index?: number | null
          template_body?: string | null
          template_id?: string | null
          trigger_config?: Json | null
          trigger_event: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          channel?: Database["public"]["Enums"]["comm_channel"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          max_hour?: number | null
          min_hour?: number | null
          name?: string
          order_index?: number | null
          template_body?: string | null
          template_id?: string | null
          trigger_config?: Json | null
          trigger_event?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          client_id: string | null
          created_at: string | null
          description: string | null
          end_datetime: string
          google_event_id: string | null
          id: string
          meet_link: string | null
          pratica_id: string | null
          start_datetime: string
          status: string | null
          title: string
        }
        Insert: {
          attendees?: Json | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime: string
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          pratica_id?: string | null
          start_datetime: string
          status?: string | null
          title: string
        }
        Update: {
          attendees?: Json | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime?: string
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          pratica_id?: string | null
          start_datetime?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      call_bookings: {
        Row: {
          cliente_email: string
          cliente_nome: string
          cliente_telefono: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          meeting_link: string | null
          notes: string | null
          practice_id: string | null
          reminder_sent: boolean | null
          slot_datetime: string
          status: string | null
        }
        Insert: {
          cliente_email: string
          cliente_nome: string
          cliente_telefono?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_link?: string | null
          notes?: string | null
          practice_id?: string | null
          reminder_sent?: boolean | null
          slot_datetime: string
          status?: string | null
        }
        Update: {
          cliente_email?: string
          cliente_nome?: string
          cliente_telefono?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_link?: string | null
          notes?: string | null
          practice_id?: string | null
          reminder_sent?: boolean | null
          slot_datetime?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_bookings_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_bookings_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices_public"
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
          note: string | null
          ordine: number
          pratica_id: string
          priorita: string | null
          scadenza: string | null
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
          note?: string | null
          ordine?: number
          pratica_id: string
          priorita?: string | null
          scadenza?: string | null
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
          note?: string | null
          ordine?: number
          pratica_id?: string
          priorita?: string | null
          scadenza?: string | null
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
            foreignKeyName: "checklist_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
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
      client_form_impianto_termico: {
        Row: {
          anno_installazione: number | null
          classe_energetica: string | null
          cognome_cliente: string | null
          created_at: string | null
          id: string
          indirizzo_intervento: string | null
          nome_cliente: string | null
          note: string | null
          potenza_kw: number | null
          pratica_id: string
          tipo_impianto_nuovo: string | null
          tipo_impianto_vecchio: string | null
          token_id: string
        }
        Insert: {
          anno_installazione?: number | null
          classe_energetica?: string | null
          cognome_cliente?: string | null
          created_at?: string | null
          id?: string
          indirizzo_intervento?: string | null
          nome_cliente?: string | null
          note?: string | null
          potenza_kw?: number | null
          pratica_id: string
          tipo_impianto_nuovo?: string | null
          tipo_impianto_vecchio?: string | null
          token_id: string
        }
        Update: {
          anno_installazione?: number | null
          classe_energetica?: string | null
          cognome_cliente?: string | null
          created_at?: string | null
          id?: string
          indirizzo_intervento?: string | null
          nome_cliente?: string | null
          note?: string | null
          potenza_kw?: number | null
          pratica_id?: string
          tipo_impianto_nuovo?: string | null
          tipo_impianto_vecchio?: string | null
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_form_impianto_termico_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_impianto_termico_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "client_form_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      client_form_infissi: {
        Row: {
          altezza_cm: number | null
          cognome_cliente: string | null
          created_at: string | null
          id: string
          indirizzo_intervento: string | null
          larghezza_cm: number | null
          materiale: string | null
          nome_cliente: string | null
          note: string | null
          numero_infissi: number | null
          pratica_id: string
          tipologia_infisso: string | null
          token_id: string
          trasmittanza_nuovo: number | null
          trasmittanza_vecchio: number | null
        }
        Insert: {
          altezza_cm?: number | null
          cognome_cliente?: string | null
          created_at?: string | null
          id?: string
          indirizzo_intervento?: string | null
          larghezza_cm?: number | null
          materiale?: string | null
          nome_cliente?: string | null
          note?: string | null
          numero_infissi?: number | null
          pratica_id: string
          tipologia_infisso?: string | null
          token_id: string
          trasmittanza_nuovo?: number | null
          trasmittanza_vecchio?: number | null
        }
        Update: {
          altezza_cm?: number | null
          cognome_cliente?: string | null
          created_at?: string | null
          id?: string
          indirizzo_intervento?: string | null
          larghezza_cm?: number | null
          materiale?: string | null
          nome_cliente?: string | null
          note?: string | null
          numero_infissi?: number | null
          pratica_id?: string
          tipologia_infisso?: string | null
          token_id?: string
          trasmittanza_nuovo?: number | null
          trasmittanza_vecchio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_form_infissi_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_infissi_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "client_form_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      client_form_schermature: {
        Row: {
          altezza_cm: number | null
          cap_appartamento: string | null
          cap_residenza: string | null
          catasto_foglio: string | null
          catasto_mappale: string | null
          catasto_subalterno: string | null
          civico_appartamento: string | null
          civico_residenza: string | null
          codice_fiscale: string | null
          cognome_cliente: string | null
          cointestatario_cf: string | null
          cointestatario_cognome: string | null
          cointestatario_nome: string | null
          colore: string | null
          comune_appartamento: string | null
          comune_nascita: string | null
          comune_residenza: string | null
          costo_totale_iva: number | null
          created_at: string | null
          data_nascita: string | null
          email: string | null
          id: string
          impianto_combustibile: string | null
          impianto_condizionamento: string | null
          impianto_tipo: string | null
          impianto_tipo_caldaia: string | null
          indirizzo_appartamento: string | null
          indirizzo_intervento: string | null
          indirizzo_residenza: string | null
          larghezza_cm: number | null
          motorizzato: boolean | null
          nome_cliente: string | null
          note: string | null
          numero_unita: number | null
          orientamento: string | null
          pratica_id: string
          produttore: string | null
          provincia_appartamento: string | null
          provincia_nascita: string | null
          provincia_residenza: string | null
          telefono: string | null
          tipo_conduzione: string | null
          tipologia_schermatura: string | null
          token_id: string
        }
        Insert: {
          altezza_cm?: number | null
          cap_appartamento?: string | null
          cap_residenza?: string | null
          catasto_foglio?: string | null
          catasto_mappale?: string | null
          catasto_subalterno?: string | null
          civico_appartamento?: string | null
          civico_residenza?: string | null
          codice_fiscale?: string | null
          cognome_cliente?: string | null
          cointestatario_cf?: string | null
          cointestatario_cognome?: string | null
          cointestatario_nome?: string | null
          colore?: string | null
          comune_appartamento?: string | null
          comune_nascita?: string | null
          comune_residenza?: string | null
          costo_totale_iva?: number | null
          created_at?: string | null
          data_nascita?: string | null
          email?: string | null
          id?: string
          impianto_combustibile?: string | null
          impianto_condizionamento?: string | null
          impianto_tipo?: string | null
          impianto_tipo_caldaia?: string | null
          indirizzo_appartamento?: string | null
          indirizzo_intervento?: string | null
          indirizzo_residenza?: string | null
          larghezza_cm?: number | null
          motorizzato?: boolean | null
          nome_cliente?: string | null
          note?: string | null
          numero_unita?: number | null
          orientamento?: string | null
          pratica_id: string
          produttore?: string | null
          provincia_appartamento?: string | null
          provincia_nascita?: string | null
          provincia_residenza?: string | null
          telefono?: string | null
          tipo_conduzione?: string | null
          tipologia_schermatura?: string | null
          token_id: string
        }
        Update: {
          altezza_cm?: number | null
          cap_appartamento?: string | null
          cap_residenza?: string | null
          catasto_foglio?: string | null
          catasto_mappale?: string | null
          catasto_subalterno?: string | null
          civico_appartamento?: string | null
          civico_residenza?: string | null
          codice_fiscale?: string | null
          cognome_cliente?: string | null
          cointestatario_cf?: string | null
          cointestatario_cognome?: string | null
          cointestatario_nome?: string | null
          colore?: string | null
          comune_appartamento?: string | null
          comune_nascita?: string | null
          comune_residenza?: string | null
          costo_totale_iva?: number | null
          created_at?: string | null
          data_nascita?: string | null
          email?: string | null
          id?: string
          impianto_combustibile?: string | null
          impianto_condizionamento?: string | null
          impianto_tipo?: string | null
          impianto_tipo_caldaia?: string | null
          indirizzo_appartamento?: string | null
          indirizzo_intervento?: string | null
          indirizzo_residenza?: string | null
          larghezza_cm?: number | null
          motorizzato?: boolean | null
          nome_cliente?: string | null
          note?: string | null
          numero_unita?: number | null
          orientamento?: string | null
          pratica_id?: string
          produttore?: string | null
          provincia_appartamento?: string | null
          provincia_nascita?: string | null
          provincia_residenza?: string | null
          telefono?: string | null
          tipo_conduzione?: string | null
          tipologia_schermatura?: string | null
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_form_schermature_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_schermature_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "client_form_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      client_form_tokens: {
        Row: {
          compiled_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          last_reminder_at: string | null
          pratica_id: string
          reminder_count: number | null
          sent_at: string | null
          stato: string
          tipo_modulo: string
          token: string
        }
        Insert: {
          compiled_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_reminder_at?: string | null
          pratica_id: string
          reminder_count?: number | null
          sent_at?: string | null
          stato?: string
          tipo_modulo: string
          token?: string
        }
        Update: {
          compiled_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_reminder_at?: string | null
          pratica_id?: string
          reminder_count?: number | null
          sent_at?: string | null
          stato?: string
          tipo_modulo?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_form_tokens_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      client_form_vepa: {
        Row: {
          altezza_cm: number | null
          cognome_cliente: string | null
          created_at: string | null
          id: string
          indirizzo_intervento: string | null
          larghezza_cm: number | null
          materiale: string | null
          nome_cliente: string | null
          note: string | null
          numero_infissi: number | null
          pratica_id: string
          token_id: string
          trasmittanza_nuovo: number | null
        }
        Insert: {
          altezza_cm?: number | null
          cognome_cliente?: string | null
          created_at?: string | null
          id?: string
          indirizzo_intervento?: string | null
          larghezza_cm?: number | null
          materiale?: string | null
          nome_cliente?: string | null
          note?: string | null
          numero_infissi?: number | null
          pratica_id: string
          token_id: string
          trasmittanza_nuovo?: number | null
        }
        Update: {
          altezza_cm?: number | null
          cognome_cliente?: string | null
          created_at?: string | null
          id?: string
          indirizzo_intervento?: string | null
          larghezza_cm?: number | null
          materiale?: string | null
          nome_cliente?: string | null
          note?: string | null
          numero_infissi?: number | null
          pratica_id?: string
          token_id?: string
          trasmittanza_nuovo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_form_vepa_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_vepa_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "client_form_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      client_promos: {
        Row: {
          activated_at: string | null
          assigned_by: string | null
          client_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          notes: string | null
          pratiche_free_remaining: number | null
          pratiche_used: number | null
          promo_type_id: string | null
          status: string | null
        }
        Insert: {
          activated_at?: string | null
          assigned_by?: string | null
          client_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          pratiche_free_remaining?: number | null
          pratiche_used?: number | null
          promo_type_id?: string | null
          status?: string | null
        }
        Update: {
          activated_at?: string | null
          assigned_by?: string | null
          client_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          pratiche_free_remaining?: number | null
          pratiche_used?: number | null
          promo_type_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_promos_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_promos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_promos_promo_type_id_fkey"
            columns: ["promo_type_id"]
            isOneToOne: false
            referencedRelation: "promo_types"
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
          {
            foreignKeyName: "clienti_finali_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_log: {
        Row: {
          body_preview: string | null
          channel: Database["public"]["Enums"]["comm_channel"]
          direction: Database["public"]["Enums"]["comm_direction"]
          error_message: string | null
          id: string
          metadata: Json | null
          n8n_execution_id: string | null
          notes: string | null
          outcome: string | null
          practice_id: string
          read_at: string | null
          recipient: string
          resend_email_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["comm_status"] | null
          subject: string | null
          wa_message_id: string | null
        }
        Insert: {
          body_preview?: string | null
          channel: Database["public"]["Enums"]["comm_channel"]
          direction?: Database["public"]["Enums"]["comm_direction"]
          error_message?: string | null
          id?: string
          metadata?: Json | null
          n8n_execution_id?: string | null
          notes?: string | null
          outcome?: string | null
          practice_id: string
          read_at?: string | null
          recipient: string
          resend_email_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["comm_status"] | null
          subject?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body_preview?: string | null
          channel?: Database["public"]["Enums"]["comm_channel"]
          direction?: Database["public"]["Enums"]["comm_direction"]
          error_message?: string | null
          id?: string
          metadata?: Json | null
          n8n_execution_id?: string | null
          notes?: string | null
          outcome?: string | null
          practice_id?: string
          read_at?: string | null
          recipient?: string
          resend_email_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["comm_status"] | null
          subject?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices_public"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          brand_type: string[] | null
          cap: string | null
          citta: string | null
          codice_fiscale: string | null
          created_at: string
          email: string | null
          id: string
          indirizzo: string | null
          intestazione: string | null
          is_active: boolean | null
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
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          brand_type?: string[] | null
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          intestazione?: string | null
          is_active?: boolean | null
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
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          brand_type?: string[] | null
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          email?: string | null
          id?: string
          indirizzo?: string | null
          intestazione?: string | null
          is_active?: boolean | null
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
      company_pricing: {
        Row: {
          brand: string
          company_id: string
          created_at: string
          id: string
          note: string
          prezzo: number
          updated_at: string
        }
        Insert: {
          brand: string
          company_id: string
          created_at?: string
          id?: string
          note?: string
          prezzo: number
          updated_at?: string
        }
        Update: {
          brand?: string
          company_id?: string
          created_at?: string
          id?: string
          note?: string
          prezzo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_pricing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_pricing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_promos: {
        Row: {
          activated_at: string | null
          assigned_by: string | null
          ciclo_posizione: number | null
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          note: string
          pratiche_gratuite_erogate: number | null
          pratiche_rimaste: number | null
          pratiche_usate: number | null
          promo_type_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          assigned_by?: string | null
          ciclo_posizione?: number | null
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string
          pratiche_gratuite_erogate?: number | null
          pratiche_rimaste?: number | null
          pratiche_usate?: number | null
          promo_type_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          assigned_by?: string | null
          ciclo_posizione?: number | null
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string
          pratiche_gratuite_erogate?: number | null
          pratiche_rimaste?: number | null
          pratiche_usate?: number | null
          promo_type_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_promos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_promos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_promos_promo_type_id_fkey"
            columns: ["promo_type_id"]
            isOneToOne: false
            referencedRelation: "promo_types"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["custom_field_entity"]
          field_id: string
          id: string
          updated_at: string | null
          value: string | null
          value_json: Json | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["custom_field_entity"]
          field_id: string
          id?: string
          updated_at?: string | null
          value?: string | null
          value_json?: Json | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["custom_field_entity"]
          field_id?: string
          id?: string
          updated_at?: string | null
          value?: string | null
          value_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string | null
          default_value: string | null
          description: string | null
          entity: Database["public"]["Enums"]["custom_field_entity"]
          field_key: string
          field_label: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          folder: string | null
          group_name: string | null
          id: string
          is_required: boolean | null
          is_system: boolean
          is_visible_admin: boolean | null
          is_visible_reseller: boolean | null
          options: Json | null
          order_index: number | null
          placeholder: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          entity?: Database["public"]["Enums"]["custom_field_entity"]
          field_key: string
          field_label: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          folder?: string | null
          group_name?: string | null
          id?: string
          is_required?: boolean | null
          is_system?: boolean
          is_visible_admin?: boolean | null
          is_visible_reseller?: boolean | null
          options?: Json | null
          order_index?: number | null
          placeholder?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          entity?: Database["public"]["Enums"]["custom_field_entity"]
          field_key?: string
          field_label?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          folder?: string | null
          group_name?: string | null
          id?: string
          is_required?: boolean | null
          is_system?: boolean
          is_visible_admin?: boolean | null
          is_visible_reseller?: boolean | null
          options?: Json | null
          order_index?: number | null
          placeholder?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      documenti: {
        Row: {
          caricato_da: string | null
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
          caricato_da?: string | null
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
          caricato_da?: string | null
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
            foreignKeyName: "documenti_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documenti_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "enea_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documenti_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "enea_practices_public"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          client_id: string | null
          id: string
          pratica_id: string | null
          resend_id: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template_id: string | null
          to_email: string
        }
        Insert: {
          client_id?: string | null
          id?: string
          pratica_id?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          to_email: string
        }
        Update: {
          client_id?: string | null
          id?: string
          pratica_id?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          created_at: string | null
          design_json: Json | null
          html_body: string
          id: string
          is_active: boolean | null
          name: string
          subject: string
          trigger_event: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          design_json?: Json | null
          html_body: string
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          trigger_event?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          design_json?: Json | null
          html_body?: string
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          trigger_event?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      enea_practices: {
        Row: {
          archived_at: string | null
          archivio_path: string | null
          assigned_at: string | null
          azienda_dichiarata: string | null
          brand: Database["public"]["Enums"]["practice_brand"]
          chiamate_assegnato_a: string | null
          cliente_cf: string | null
          cliente_cognome: string
          cliente_email: string | null
          cliente_indirizzo: string | null
          cliente_nome: string
          cliente_telefono: string | null
          conteggio_solleciti: number | null
          created_at: string | null
          current_stage_entered_at: string
          current_stage_id: string | null
          data_fine_lavori: string | null
          data_incasso: string | null
          data_invio_pratica: string | null
          dati_form: Json | null
          documenti_aggiuntivi_urls: string[] | null
          documenti_enea_urls: string[] | null
          documenti_mancanti: string[] | null
          fatture_urls: string[] | null
          form_compilato_at: string | null
          form_token: string | null
          fornitore: string | null
          guadagno_lordo: number | null
          guadagno_netto: number | null
          id: string
          invia_pratica_al_cliente: boolean
          note: string | null
          note_documenti_mancanti: string | null
          note_gestionale: string | null
          note_interne: string | null
          operatore_id: string | null
          pagamento_stato: Database["public"]["Enums"]["pagamento_stato"] | null
          pratica_enea_conclusa_urls: string[] | null
          prezzo: number | null
          prodotto_installato: string | null
          recensione_ricevuta_at: string | null
          recensione_richiesta_at: string | null
          recensione_stelle: number | null
          recensione_testo: string | null
          reseller_id: string
          tipo_fatturazione: string | null
          tipo_servizio: string | null
          tipo_soggetto: string | null
          ultimo_sollecito_fornitore: string | null
          ultimo_sollecito_privato: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archivio_path?: string | null
          assigned_at?: string | null
          azienda_dichiarata?: string | null
          brand?: Database["public"]["Enums"]["practice_brand"]
          chiamate_assegnato_a?: string | null
          cliente_cf?: string | null
          cliente_cognome: string
          cliente_email?: string | null
          cliente_indirizzo?: string | null
          cliente_nome: string
          cliente_telefono?: string | null
          conteggio_solleciti?: number | null
          created_at?: string | null
          current_stage_entered_at?: string
          current_stage_id?: string | null
          data_fine_lavori?: string | null
          data_incasso?: string | null
          data_invio_pratica?: string | null
          dati_form?: Json | null
          documenti_aggiuntivi_urls?: string[] | null
          documenti_enea_urls?: string[] | null
          documenti_mancanti?: string[] | null
          fatture_urls?: string[] | null
          form_compilato_at?: string | null
          form_token?: string | null
          fornitore?: string | null
          guadagno_lordo?: number | null
          guadagno_netto?: number | null
          id?: string
          invia_pratica_al_cliente?: boolean
          note?: string | null
          note_documenti_mancanti?: string | null
          note_gestionale?: string | null
          note_interne?: string | null
          operatore_id?: string | null
          pagamento_stato?:
            | Database["public"]["Enums"]["pagamento_stato"]
            | null
          pratica_enea_conclusa_urls?: string[] | null
          prezzo?: number | null
          prodotto_installato?: string | null
          recensione_ricevuta_at?: string | null
          recensione_richiesta_at?: string | null
          recensione_stelle?: number | null
          recensione_testo?: string | null
          reseller_id: string
          tipo_fatturazione?: string | null
          tipo_servizio?: string | null
          tipo_soggetto?: string | null
          ultimo_sollecito_fornitore?: string | null
          ultimo_sollecito_privato?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archivio_path?: string | null
          assigned_at?: string | null
          azienda_dichiarata?: string | null
          brand?: Database["public"]["Enums"]["practice_brand"]
          chiamate_assegnato_a?: string | null
          cliente_cf?: string | null
          cliente_cognome?: string
          cliente_email?: string | null
          cliente_indirizzo?: string | null
          cliente_nome?: string
          cliente_telefono?: string | null
          conteggio_solleciti?: number | null
          created_at?: string | null
          current_stage_entered_at?: string
          current_stage_id?: string | null
          data_fine_lavori?: string | null
          data_incasso?: string | null
          data_invio_pratica?: string | null
          dati_form?: Json | null
          documenti_aggiuntivi_urls?: string[] | null
          documenti_enea_urls?: string[] | null
          documenti_mancanti?: string[] | null
          fatture_urls?: string[] | null
          form_compilato_at?: string | null
          form_token?: string | null
          fornitore?: string | null
          guadagno_lordo?: number | null
          guadagno_netto?: number | null
          id?: string
          invia_pratica_al_cliente?: boolean
          note?: string | null
          note_documenti_mancanti?: string | null
          note_gestionale?: string | null
          note_interne?: string | null
          operatore_id?: string | null
          pagamento_stato?:
            | Database["public"]["Enums"]["pagamento_stato"]
            | null
          pratica_enea_conclusa_urls?: string[] | null
          prezzo?: number | null
          prodotto_installato?: string | null
          recensione_ricevuta_at?: string | null
          recensione_richiesta_at?: string | null
          recensione_stelle?: number | null
          recensione_testo?: string | null
          reseller_id?: string
          tipo_fatturazione?: string | null
          tipo_servizio?: string | null
          tipo_soggetto?: string | null
          ultimo_sollecito_fornitore?: string | null
          ultimo_sollecito_privato?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enea_practices_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enea_practices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enea_practices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      fatture_insolute: {
        Row: {
          filename: string
          id: string
          note: string | null
          reseller_id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          filename: string
          id?: string
          note?: string | null
          reseller_id: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          filename?: string
          id?: string
          note?: string | null
          reseller_id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fatture_insolute_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatture_insolute_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      form_modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          prodotto_match: string[] | null
          schema: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          prodotto_match?: string[] | null
          schema?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          prodotto_match?: string[] | null
          schema?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          citta: string | null
          cognome: string | null
          contacted_at: string | null
          contacted_by: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          note: string | null
          page_url: string | null
          source: string
          stage_id: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          citta?: string | null
          cognome?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          note?: string | null
          page_url?: string | null
          source?: string
          stage_id?: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          citta?: string | null
          cognome?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          note?: string | null
          page_url?: string | null
          source?: string
          stage_id?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          author_avatar_url: string | null
          author_name: string | null
          body_html: string | null
          body_md: string | null
          canonical_url: string | null
          category: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          json_ld_type: string | null
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          no_follow: boolean | null
          no_index: boolean | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          pinned: boolean | null
          published_at: string | null
          read_time_minutes: number | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          twitter_card: string | null
          updated_at: string
          view_count: number | null
        }
        Insert: {
          author_avatar_url?: string | null
          author_name?: string | null
          body_html?: string | null
          body_md?: string | null
          canonical_url?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          json_ld_type?: string | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          no_follow?: boolean | null
          no_index?: boolean | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          pinned?: boolean | null
          published_at?: string | null
          read_time_minutes?: number | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          twitter_card?: string | null
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          author_avatar_url?: string | null
          author_name?: string | null
          body_html?: string | null
          body_md?: string | null
          canonical_url?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          json_ld_type?: string | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          no_follow?: boolean | null
          no_index?: boolean | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          pinned?: boolean | null
          published_at?: string | null
          read_time_minutes?: number | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          twitter_card?: string | null
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
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
      pipeline_stages: {
        Row: {
          brand: string | null
          color: string | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          is_visible_reseller: boolean
          name: string
          name_reseller: string | null
          order_index: number
          reseller_id: string | null
          stage_type: Database["public"]["Enums"]["stage_type"]
          tooltip_text: string | null
        }
        Insert: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          is_visible_reseller?: boolean
          name: string
          name_reseller?: string | null
          order_index?: number
          reseller_id?: string | null
          stage_type: Database["public"]["Enums"]["stage_type"]
          tooltip_text?: string | null
        }
        Update: {
          brand?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          is_visible_reseller?: boolean
          name?: string
          name_reseller?: string | null
          order_index?: number
          reseller_id?: string | null
          stage_type?: Database["public"]["Enums"]["stage_type"]
          tooltip_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
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
            foreignKeyName: "practice_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
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
          completata_at: string | null
          created_at: string
          creato_da: string
          dati_pratica: Json | null
          descrizione: string | null
          id: string
          is_free: boolean | null
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
          completata_at?: string | null
          created_at?: string
          creato_da: string
          dati_pratica?: Json | null
          descrizione?: string | null
          id?: string
          is_free?: boolean | null
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
          completata_at?: string | null
          created_at?: string
          creato_da?: string
          dati_pratica?: Json | null
          descrizione?: string | null
          id?: string
          is_free?: boolean | null
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
            foreignKeyName: "pratiche_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
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
          address: string | null
          avatar_url: string | null
          city: string | null
          cognome: string
          company_name: string | null
          created_at: string
          email: string
          id: string
          last_login_at: string | null
          lifetime_value: number | null
          must_change_password: boolean
          nome: string
          notes: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          piva: string | null
          preferred_contact: string | null
          referral_source: string | null
          telefono: string | null
          total_pratiche_count: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          cognome?: string
          company_name?: string | null
          created_at?: string
          email?: string
          id: string
          last_login_at?: string | null
          lifetime_value?: number | null
          must_change_password?: boolean
          nome?: string
          notes?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          piva?: string | null
          preferred_contact?: string | null
          referral_source?: string | null
          telefono?: string | null
          total_pratiche_count?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          cognome?: string
          company_name?: string | null
          created_at?: string
          email?: string
          id?: string
          last_login_at?: string | null
          lifetime_value?: number | null
          must_change_password?: boolean
          nome?: string
          notes?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          piva?: string | null
          preferred_contact?: string | null
          referral_source?: string | null
          telefono?: string | null
          total_pratiche_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_types: {
        Row: {
          ciclo_pratiche: number | null
          created_at: string | null
          description: string | null
          free_per_ciclo: number | null
          id: string
          is_active: boolean | null
          max_pratiche: number | null
          name: string
          type: string
          validity_days: number | null
          value: number | null
        }
        Insert: {
          ciclo_pratiche?: number | null
          created_at?: string | null
          description?: string | null
          free_per_ciclo?: number | null
          id?: string
          is_active?: boolean | null
          max_pratiche?: number | null
          name: string
          type: string
          validity_days?: number | null
          value?: number | null
        }
        Update: {
          ciclo_pratiche?: number | null
          created_at?: string | null
          description?: string | null
          free_per_ciclo?: number | null
          id?: string
          is_active?: boolean | null
          max_pratiche?: number | null
          name?: string
          type?: string
          validity_days?: number | null
          value?: number | null
        }
        Relationships: []
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
          {
            foreignKeyName: "user_company_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
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
            foreignKeyName: "wallet_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "resellers"
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
      whatsapp_conversations: {
        Row: {
          assigned_to: string | null
          created_at: string
          display_name: string | null
          id: string
          is_archived: boolean
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_direction: string | null
          last_message_preview: string | null
          phone: string
          practice_id: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_archived?: boolean
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          phone: string
          practice_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_archived?: boolean
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          phone?: string
          practice_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices_public"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_logs: {
        Row: {
          body: string | null
          client_id: string | null
          direction: string | null
          id: string
          message_type: string | null
          phone: string
          pratica_id: string | null
          sent_at: string | null
          status: string | null
          template_name: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          direction?: string | null
          id?: string
          message_type?: string | null
          phone: string
          pratica_id?: string | null
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          client_id?: string | null
          direction?: string | null
          id?: string
          message_type?: string | null
          phone?: string
          pratica_id?: string | null
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_logs_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          error_message: string | null
          id: string
          media_mime_type: string | null
          media_url: string | null
          message_type: string
          practice_id: string | null
          read_at: string | null
          sent_at: string
          sent_by_user_id: string | null
          status: string
          template_components: Json | null
          template_name: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_message?: string | null
          id?: string
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          practice_id?: string | null
          read_at?: string | null
          sent_at?: string
          sent_by_user_id?: string | null
          status?: string
          template_components?: Json | null
          template_name?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          id?: string
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          practice_id?: string | null
          read_at?: string | null
          sent_at?: string
          sent_by_user_id?: string | null
          status?: string
          template_components?: Json | null
          template_name?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices_public"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_quick_replies: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
          usage_count: number
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
          usage_count?: number
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body_text: string
          buttons: Json | null
          category: string | null
          created_at: string
          description: string | null
          display_name: string | null
          footer_text: string | null
          header_text: string | null
          header_type: string | null
          id: string
          is_active: boolean
          language: string
          mapped_trigger_event: string | null
          meta_last_synced_at: string | null
          meta_template_id: string | null
          meta_template_name: string
          rejection_reason: string | null
          status: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          body_text?: string
          buttons?: Json | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          footer_text?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          is_active?: boolean
          language?: string
          mapped_trigger_event?: string | null
          meta_last_synced_at?: string | null
          meta_template_id?: string | null
          meta_template_name: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          body_text?: string
          buttons?: Json | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          footer_text?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          is_active?: boolean
          language?: string
          mapped_trigger_event?: string | null
          meta_last_synced_at?: string | null
          meta_template_id?: string | null
          meta_template_name?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      communication_log_public: {
        Row: {
          body_preview: string | null
          channel: Database["public"]["Enums"]["comm_channel"] | null
          direction: Database["public"]["Enums"]["comm_direction"] | null
          error_message: string | null
          id: string | null
          metadata: Json | null
          notes: string | null
          outcome: string | null
          practice_id: string | null
          read_at: string | null
          recipient: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["comm_status"] | null
          subject: string | null
        }
        Insert: {
          body_preview?: never
          channel?: Database["public"]["Enums"]["comm_channel"] | null
          direction?: Database["public"]["Enums"]["comm_direction"] | null
          error_message?: never
          id?: string | null
          metadata?: never
          notes?: never
          outcome?: string | null
          practice_id?: string | null
          read_at?: string | null
          recipient?: never
          sent_at?: string | null
          status?: Database["public"]["Enums"]["comm_status"] | null
          subject?: never
        }
        Update: {
          body_preview?: never
          channel?: Database["public"]["Enums"]["comm_channel"] | null
          direction?: Database["public"]["Enums"]["comm_direction"] | null
          error_message?: never
          id?: string | null
          metadata?: never
          notes?: never
          outcome?: string | null
          practice_id?: string | null
          read_at?: string | null
          recipient?: never
          sent_at?: string | null
          status?: Database["public"]["Enums"]["comm_status"] | null
          subject?: never
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "enea_practices_public"
            referencedColumns: ["id"]
          },
        ]
      }
      enea_practices_public: {
        Row: {
          archived_at: string | null
          archivio_path: string | null
          assigned_at: string | null
          azienda_dichiarata: string | null
          brand: Database["public"]["Enums"]["practice_brand"] | null
          chiamate_assegnato_a: string | null
          cliente_cf: string | null
          cliente_cognome: string | null
          cliente_email: string | null
          cliente_indirizzo: string | null
          cliente_nome: string | null
          cliente_telefono: string | null
          conteggio_solleciti: number | null
          created_at: string | null
          current_stage_entered_at: string | null
          current_stage_id: string | null
          data_incasso: string | null
          data_invio_pratica: string | null
          dati_form: Json | null
          documenti_aggiuntivi_urls: string[] | null
          documenti_enea_urls: string[] | null
          documenti_mancanti: string[] | null
          fatture_urls: string[] | null
          form_compilato_at: string | null
          form_token: string | null
          fornitore: string | null
          guadagno_lordo: number | null
          guadagno_netto: number | null
          id: string | null
          note: string | null
          note_documenti_mancanti: string | null
          note_gestionale: string | null
          note_interne: string | null
          operatore_id: string | null
          pagamento_stato: Database["public"]["Enums"]["pagamento_stato"] | null
          pratica_enea_conclusa_urls: string[] | null
          prezzo: number | null
          prodotto_installato: string | null
          recensione_ricevuta_at: string | null
          recensione_richiesta_at: string | null
          recensione_stelle: number | null
          recensione_testo: string | null
          reseller_id: string | null
          tipo_fatturazione: string | null
          tipo_servizio: string | null
          tipo_soggetto: string | null
          ultimo_sollecito_fornitore: string | null
          ultimo_sollecito_privato: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archivio_path?: string | null
          assigned_at?: string | null
          azienda_dichiarata?: never
          brand?: Database["public"]["Enums"]["practice_brand"] | null
          chiamate_assegnato_a?: never
          cliente_cf?: string | null
          cliente_cognome?: string | null
          cliente_email?: string | null
          cliente_indirizzo?: string | null
          cliente_nome?: string | null
          cliente_telefono?: string | null
          conteggio_solleciti?: number | null
          created_at?: string | null
          current_stage_entered_at?: string | null
          current_stage_id?: string | null
          data_incasso?: never
          data_invio_pratica?: string | null
          dati_form?: never
          documenti_aggiuntivi_urls?: string[] | null
          documenti_enea_urls?: string[] | null
          documenti_mancanti?: string[] | null
          fatture_urls?: string[] | null
          form_compilato_at?: string | null
          form_token?: never
          fornitore?: string | null
          guadagno_lordo?: never
          guadagno_netto?: never
          id?: string | null
          note?: string | null
          note_documenti_mancanti?: string | null
          note_gestionale?: never
          note_interne?: never
          operatore_id?: string | null
          pagamento_stato?: never
          pratica_enea_conclusa_urls?: string[] | null
          prezzo?: never
          prodotto_installato?: string | null
          recensione_ricevuta_at?: string | null
          recensione_richiesta_at?: string | null
          recensione_stelle?: number | null
          recensione_testo?: string | null
          reseller_id?: string | null
          tipo_fatturazione?: never
          tipo_servizio?: never
          tipo_soggetto?: string | null
          ultimo_sollecito_fornitore?: string | null
          ultimo_sollecito_privato?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archivio_path?: string | null
          assigned_at?: string | null
          azienda_dichiarata?: never
          brand?: Database["public"]["Enums"]["practice_brand"] | null
          chiamate_assegnato_a?: never
          cliente_cf?: string | null
          cliente_cognome?: string | null
          cliente_email?: string | null
          cliente_indirizzo?: string | null
          cliente_nome?: string | null
          cliente_telefono?: string | null
          conteggio_solleciti?: number | null
          created_at?: string | null
          current_stage_entered_at?: string | null
          current_stage_id?: string | null
          data_incasso?: never
          data_invio_pratica?: string | null
          dati_form?: never
          documenti_aggiuntivi_urls?: string[] | null
          documenti_enea_urls?: string[] | null
          documenti_mancanti?: string[] | null
          fatture_urls?: string[] | null
          form_compilato_at?: string | null
          form_token?: never
          fornitore?: string | null
          guadagno_lordo?: never
          guadagno_netto?: never
          id?: string | null
          note?: string | null
          note_documenti_mancanti?: string | null
          note_gestionale?: never
          note_interne?: never
          operatore_id?: string | null
          pagamento_stato?: never
          pratica_enea_conclusa_urls?: string[] | null
          prezzo?: never
          prodotto_installato?: string | null
          recensione_ricevuta_at?: string | null
          recensione_richiesta_at?: string | null
          recensione_stelle?: number | null
          recensione_testo?: string | null
          reseller_id?: string | null
          tipo_fatturazione?: never
          tipo_servizio?: never
          tipo_soggetto?: string | null
          ultimo_sollecito_fornitore?: string | null
          ultimo_sollecito_privato?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enea_practices_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enea_practices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enea_practices_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      resellers: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          brand_type: string[] | null
          company_name: string | null
          created_at: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          brand_type?: string[] | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          brand_type?: string[] | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_enea_file: {
        Args: { file_name: string; user_uuid: string }
        Returns: boolean
      }
      can_access_legacy_file: {
        Args: { file_name: string; user_uuid: string }
        Returns: boolean
      }
      clear_must_change_password: { Args: never; Returns: undefined }
      get_cron_health: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          return_message: string
          schedule: string
          start_time: string
          status: string
        }[]
      }
      get_practice_by_form_token: {
        Args: { p_token: string }
        Returns: {
          archived_at: string
          brand: string
          cliente_cf: string
          cliente_cognome: string
          cliente_email: string
          cliente_indirizzo: string
          cliente_nome: string
          cliente_telefono: string
          current_stage_id: string
          dati_form: Json
          form_compilato_at: string
          id: string
          note: string
          prodotto_installato: string
          reseller_id: string
          reseller_name: string
        }[]
      }
      get_reseller_company_id: { Args: { _user_id: string }; Returns: string }
      get_reseller_contact_email: {
        Args: { p_company_id: string }
        Returns: string
      }
      get_token_info: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          nome_cliente: string
          pratica_id: string
          stato: string
          tipo_modulo: string
          token_id: string
        }[]
      }
      get_user_company_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_news_view: { Args: { p_slug: string }; Returns: undefined }
      increment_quick_reply_usage: { Args: { _id: string }; Returns: undefined }
      is_internal: { Args: { _user_id: string }; Returns: boolean }
      is_reseller: { Args: { _user_id: string }; Returns: boolean }
      list_chat_assignees: {
        Args: never
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      save_form_draft_by_token: {
        Args: { p_dati_form: Json; p_token: string }
        Returns: string
      }
      submit_form_by_token: {
        Args: {
          p_cliente_cf: string
          p_cliente_cognome: string
          p_cliente_email: string
          p_cliente_indirizzo: string
          p_cliente_nome: string
          p_cliente_telefono: string
          p_dati_form?: Json
          p_note: string
          p_token: string
        }
        Returns: string
      }
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
        | "rivenditore"
      comm_channel: "whatsapp" | "email" | "phone" | "sms"
      comm_direction: "outbound" | "inbound"
      comm_status: "sent" | "delivered" | "read" | "failed" | "pending"
      custom_field_entity:
        | "enea_practice"
        | "reseller"
        | "cliente"
        | "contatto"
        | "azienda"
        | "pratica"
      custom_field_type:
        | "text"
        | "textarea"
        | "number"
        | "date"
        | "boolean"
        | "select"
        | "multi_select"
        | "email"
        | "phone"
        | "url"
      movimento_tipo: "credito" | "debito"
      pagamento_stato: "non_pagata" | "pagata" | "in_verifica" | "rimborsata"
      practice_brand: "enea" | "conto_termico"
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
      stage_type:
        | "inviata"
        | "attesa_compilazione"
        | "pronte_da_fare"
        | "documenti_mancanti"
        | "da_inviare"
        | "gestionale"
        | "recensione"
        | "archiviate"
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
        "rivenditore",
      ],
      comm_channel: ["whatsapp", "email", "phone", "sms"],
      comm_direction: ["outbound", "inbound"],
      comm_status: ["sent", "delivered", "read", "failed", "pending"],
      custom_field_entity: [
        "enea_practice",
        "reseller",
        "cliente",
        "contatto",
        "azienda",
        "pratica",
      ],
      custom_field_type: [
        "text",
        "textarea",
        "number",
        "date",
        "boolean",
        "select",
        "multi_select",
        "email",
        "phone",
        "url",
      ],
      movimento_tipo: ["credito", "debito"],
      pagamento_stato: ["non_pagata", "pagata", "in_verifica", "rimborsata"],
      practice_brand: ["enea", "conto_termico"],
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
      stage_type: [
        "inviata",
        "attesa_compilazione",
        "pronte_da_fare",
        "documenti_mancanti",
        "da_inviare",
        "gestionale",
        "recensione",
        "archiviate",
      ],
      stato_fattura: ["bozza", "emessa", "pagata"],
      ticket_priorita: ["bassa", "normale", "alta"],
      ticket_stato: ["aperto", "in_lavorazione", "risolto", "chiuso"],
      visibilita_documento: ["azienda_interno", "solo_interno"],
    },
  },
} as const

// ============================================================
// Aggiunte hand-written (tipi dominio non generati da Supabase)
// Preservate durante il rigen dei tipi il 2026-07-23.
// ============================================================
export type PracticeBrand = "enea" | "conto_termico"

export type StageType =
  | "inviata"
  | "attesa_compilazione"
  | "pronte_da_fare"
  | "documenti_mancanti"
  | "da_inviare"
  | "gestionale"
  | "recensione"
  | "archiviate"

export type CommChannel = "whatsapp" | "email" | "phone" | "sms"
export type CommDirection = "outbound" | "inbound"
export type CommStatus = "sent" | "delivered" | "read" | "failed" | "pending"

export type CustomFieldType =
  | "text" | "textarea" | "number" | "date" | "boolean"
  | "select" | "multi_select" | "email" | "phone" | "url"

export type CustomFieldEntity = "enea_practice" | "reseller" | "cliente" | "contatto" | "azienda" | "pratica"

export type TipoFatturazione = "rivenditore" | "cliente_finale"
export type TipoSoggetto = "persona_fisica" | "azienda_piva"
export type TipoProdotto = "schermature_solari" | "infissi" | "vepa" | "pompe_calore" | "insufflaggio_tetti"
export type TipoServizio = "servizio_completo" | "documenti_forniti"

export interface PipelineStage {
  id: string
  reseller_id: string | null
  name: string
  name_reseller: string | null        // nome mostrato al rivenditore
  tooltip_text: string | null         // tooltip "?" lato rivenditore
  is_visible_reseller: boolean        // se FALSE → invisibile al rivenditore
  stage_type: StageType
  order_index: number
  color: string
  brand: string
  is_visible: boolean
  created_at: string
}

export interface EneaPractice {
  id: string
  reseller_id: string
  current_stage_id: string | null
  brand: PracticeBrand
  cliente_nome: string
  cliente_cognome: string
  cliente_email: string | null
  cliente_telefono: string | null
  cliente_indirizzo: string | null
  cliente_cf: string | null
  prodotto_installato: string | null
  fornitore: string | null
  // Ragione sociale dichiarata nel form pubblico del sito. Valorizzata solo
  // sulle richieste dal sito; è il nome mostrato al cliente finale finché la
  // pratica sta sul segnaposto "Da abbinare".
  azienda_dichiarata: string | null
  note: string | null
  note_interne: string | null
  fatture_urls: string[]
  documenti_enea_urls: string[]
  documenti_aggiuntivi_urls: string[]
  documenti_mancanti: string[]
  note_documenti_mancanti: string | null
  guadagno_lordo: number | null
  guadagno_netto: number | null
  data_invio_pratica: string | null
  note_gestionale: string | null
  operatore_id: string | null
  assigned_at: string | null
  ultimo_sollecito_privato: string | null
  conteggio_solleciti: number
  ultimo_sollecito_fornitore: string | null
  form_compilato_at: string | null
  form_token: string
  recensione_richiesta_at: string | null
  recensione_ricevuta_at: string | null
  recensione_testo: string | null
  recensione_stelle: number | null
  tipo_servizio: TipoServizio | "pratica_only" | null  // pratica_only = legacy alias di documenti_forniti
  // Solo con documenti_forniti: se true la pratica conclusa viene inviata anche
  // al cliente finale (che altrimenti non viene mai contattato).
  invia_pratica_al_cliente: boolean
  tipo_fatturazione: TipoFatturazione | null
  tipo_soggetto: TipoSoggetto | null
  archivio_path: string | null
  pratica_enea_conclusa_urls: string[]   // file pratica conclusa caricati dal superadmin
  archived_at: string | null
  prezzo: number | null
  pagamento_stato: "non_pagata" | "pagata" | "in_verifica" | "rimborsata" | null
  data_incasso: string | null
  dati_form: Record<string, unknown> | null  // dati estesi compilati dal cliente nel form pubblico
  // Coda "Chiamate": chiamante assegnato ('samuele' | 'giuliano' | null). Solo interno.
  chiamate_assegnato_a: string | null
  created_at: string
  updated_at: string
}

export interface FatturaInsoluta {
  id: string
  reseller_id: string
  filename: string
  storage_path: string
  note: string | null
  uploaded_by: string | null
  uploaded_at: string
}

export interface CommunicationLog {
  id: string
  practice_id: string
  channel: CommChannel
  direction: CommDirection
  recipient: string
  subject: string | null
  body_preview: string | null
  status: CommStatus
  sent_at: string
  read_at: string | null
  n8n_execution_id: string | null
  wa_message_id: string | null
  resend_email_id: string | null
  error_message: string | null
  metadata: Record<string, unknown>
}

export interface AutomationRule {
  id: string
  name: string
  description: string | null
  trigger_event: string
  trigger_config: Record<string, unknown>
  channel: CommChannel
  template_id: string | null
  template_body: string | null
  is_enabled: boolean
  order_index: number
  category: string
  min_hour: number
  max_hour: number
  created_at: string
  updated_at: string
}

export interface CallBooking {
  id: string
  practice_id: string | null
  cliente_nome: string
  cliente_email: string
  cliente_telefono: string | null
  slot_datetime: string
  duration_minutes: number
  notes: string | null
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show"
  meeting_link: string | null
  reminder_sent: boolean
  created_at: string
}

export interface CustomField {
  id: string
  entity: CustomFieldEntity
  field_key: string
  field_label: string
  field_type: CustomFieldType
  placeholder: string | null
  default_value: string | null
  options: Array<{ value: string; label: string }>
  is_required: boolean
  is_visible_reseller: boolean
  is_visible_admin: boolean
  order_index: number
  group_name: string
  description: string | null
  folder: string | null
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface CustomFieldValue {
  id: string
  field_id: string
  entity_id: string
  entity_type: CustomFieldEntity
  value: string | null
  value_json: unknown | null
  created_at: string
  updated_at: string
}

export interface SupportTicketMessage {
  id: string
  ticket_id: string
  author_user_id: string
  author_role: "client" | "staff"
  body: string
  created_at: string
}
