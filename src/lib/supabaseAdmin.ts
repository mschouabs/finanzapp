import { createClient } from '@supabase/supabase-js'

/* Cliente de servidor con permisos totales (service role). Nunca se
     importa desde código que corre en el browser: solo desde rutas API
     como /api/whatsapp/webhook, donde no hay sesión de usuario. */
export function createAdminClient() {
    return createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
        )
}
