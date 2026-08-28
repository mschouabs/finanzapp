import { createBrowserClient } from '@supabase/ssr'
import { DEMO, clienteDemo } from './demo'

/* En modo demo devolvemos un cliente en memoria: la app funciona igual
   pero no lee ni escribe nada en Supabase. Ver src/lib/demo.ts */
export function createClient() {
  if (DEMO) {
    return clienteDemo() as unknown as ReturnType<typeof createBrowserClient>
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
