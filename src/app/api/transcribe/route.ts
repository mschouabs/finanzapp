import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 })
  }

  const audio = formData.get('audio') as File | null
  if (!audio) {
    return NextResponse.json({ error: 'Falta el campo audio' }, { status: 400 })
  }

  // Reenviar a Whisper
  const whisperForm = new FormData()
  whisperForm.append('file', audio, 'audio.webm')
  whisperForm.append('model', 'whisper-1')
  whisperForm.append('language', 'es')

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: whisperForm,
  })

  if (!whisperRes.ok) {
    const err = await whisperRes.text()
    return NextResponse.json({ error: `Whisper error: ${err}` }, { status: 502 })
  }

  const { text } = await whisperRes.json() as { text: string }
  return NextResponse.json({ text })
}
