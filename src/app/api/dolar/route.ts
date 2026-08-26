import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares', { next: { revalidate: 3600 } })
    const data = await res.json()
    const oficial = data.find((d: { casa: string }) => d.casa === 'oficial')
    const blue = data.find((d: { casa: string }) => d.casa === 'blue')
    return NextResponse.json({ oficial: oficial?.venta ?? null, blue: blue?.venta ?? null })
  } catch {
    return NextResponse.json({ oficial: null, blue: null })
  }
}
