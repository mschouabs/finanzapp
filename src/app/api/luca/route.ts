import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: 'Sos Luca, un asistente que SOLO extrae datos de transacciones. NO des recomendaciones ni comentarios.\n' +
            'Del texto: "' + text + '"\n' +
            'Extraé en JSON con estos campos exactos:\n' +
            '{\n' +
            '  "tipo": "gasto_variable" | "gasto_fijo" | "ingreso_fijo" | "ingreso_freelance",\n' +
            '  "monto": number (positivo),\n' +
            '  "descripcion": string (max 40 chars),\n' +
            '  "categoria": string,\n' +
            '  "tarjeta": string | null\n' +
            '}\n' +
            'Respondé SOLO el JSON, sin markdown.',
        }],
      }),
    });

    if (!res.ok) {
      console.error('Anthropic error:', res.status);
      return NextResponse.json({ error: 'Error de IA' }, { status: 500 });
    }

    const aiData = await res.json();
    const raw = aiData.content?.[0]?.text?.trim() ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'No se pudo parsear' }, { status: 500 });

    return NextResponse.json(JSON.parse(match[0]));
  } catch (e) {
    console.error('Luca error:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
