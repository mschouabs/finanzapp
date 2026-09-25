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
  if (audio.size === 0) {
    return NextResponse.json({ error: 'El audio grabado está vacío' }, { status: 400 })
  }

  /* Whisper necesita que la extensión del archivo coincida con el
     formato real: Safari/iOS graban en audio/mp4, no en webm. Si se
     manda "audio.webm" con contenido mp4, Whisper lo rechaza. */
  const tipo = audio.type || 'audio/webm'
  const ext = tipo.includes('mp4') ? 'mp4' : tipo.includes('aac') ? 'aac' : tipo.includes('ogg') ? 'ogg' : 'webm'

  // Reenviar a Whisper
  const whisperForm = new FormData()
  whisperForm.append('file', audio, `audio.${ext}`)
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
