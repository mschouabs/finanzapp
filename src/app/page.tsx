import { redirect } from 'next/navigation'
import { DEMO } from '@/lib/demo'

export default function Home() {
  // En modo demo entramos directo al dashboard. Ver src/lib/demo.ts
  redirect(DEMO ? '/dashboard' : '/login')
}
