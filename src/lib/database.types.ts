export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      gastos_variables: {
        Row: {
          id: string
          user_id: string
          nombre: string
          monto: number
          categoria: string
          fecha: string
          es_gasto_hormiga: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nombre: string
          monto: number
          categoria: string
          fecha: string
          es_gasto_hormiga?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nombre?: string
          monto?: number
          categoria?: string
          fecha?: string
          es_gasto_hormiga?: boolean
          created_at?: string
        }
      }
      gastos_fijos: {
        Row: {
          id: string
          user_id: string
          nombre: string
          monto: number
          categoria: string
          debitado: boolean
          activo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nombre: string
          monto: number
          categoria?: string
          debitado?: boolean
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nombre?: string
          monto?: number
          categoria?: string
          debitado?: boolean
          activo?: boolean
          created_at?: string
        }
      }
      ingresos_fijos: {
        Row: {
          id: string
          user_id: string
          nombre: string
          monto: number
          monto_cobrado: number | null
          activo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nombre: string
          monto: number
          monto_cobrado?: number | null
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nombre?: string
          monto?: number
          monto_cobrado?: number | null
          activo?: boolean
          created_at?: string
        }
      }
      ingresos_freelance: {
        Row: {
          id: string
          user_id: string
          cliente: string
          descripcion: string
          monto_total: number
          monto_cobrado: number | null
          fecha: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cliente: string
          descripcion: string
          monto_total: number
          monto_cobrado?: number | null
          fecha: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cliente?: string
          descripcion?: string
          monto_total?: number
          monto_cobrado?: number | null
          fecha?: string
          created_at?: string
        }
      }
      inversiones: {
        Row: {
          id: string
          user_id: string
          nombre: string
          app: string | null
          tipo: string
          moneda: 'ARS' | 'USD'
          monto: number
          tasa_anual: number | null
          nivel_riesgo: 'conservador' | 'moderado' | 'alto'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nombre: string
          app?: string | null
          tipo: string
          moneda: 'ARS' | 'USD'
          monto: number
          tasa_anual?: number | null
          nivel_riesgo: 'conservador' | 'moderado' | 'alto'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nombre?: string
          app?: string | null
          tipo?: string
          moneda?: 'ARS' | 'USD'
          monto?: number
          tasa_anual?: number | null
          nivel_riesgo?: 'conservador' | 'moderado' | 'alto'
          created_at?: string
        }
      }
      secciones: {
        Row: {
          id: string
          user_id: string
          nombre: string
          emoji: string
          tipo: 'ingreso' | 'gasto' | 'neutra'
          plantilla: string | null
          campos: Json
          orden: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nombre: string
          emoji?: string
          tipo?: 'ingreso' | 'gasto' | 'neutra'
          plantilla?: string | null
          campos?: Json
          orden?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nombre?: string
          emoji?: string
          tipo?: 'ingreso' | 'gasto' | 'neutra'
          plantilla?: string | null
          campos?: Json
          orden?: number
          created_at?: string
        }
      }
      seccion_registros: {
        Row: {
          id: string
          seccion_id: string
          user_id: string
          datos: Json
          monto: number | null
          fecha: string | null
          created_at: string
        }
        Insert: {
          id?: string
          seccion_id: string
          user_id: string
          datos?: Json
          monto?: number | null
          fecha?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          seccion_id?: string
          user_id?: string
          datos?: Json
          monto?: number | null
          fecha?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Helpers de conveniencia
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// Tipos exportados directamente
export type GastoVariable   = Tables<'gastos_variables'>
export type GastoFijo       = Tables<'gastos_fijos'>
export type IngresoFijo     = Tables<'ingresos_fijos'>
export type IngresoFreelance = Tables<'ingresos_freelance'>
export type Inversion       = Tables<'inversiones'>
export type Seccion         = Tables<'secciones'>
export type SeccionRegistro = Tables<'seccion_registros'>
