/* ── Grabación de voz para Luca ─────────────────────────────────────
   Un solo lugar para elegir un formato de audio que el navegador
   soporte de verdad (Safari/iOS no graba "audio/webm") y para
   traducir los errores de getUserMedia a un mensaje entendible.       */

/** Primer tipo MIME que el navegador puede grabar con MediaRecorder. */
export function tipoAudioSoportado(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  const candidatos = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ]
  return candidatos.find(t => MediaRecorder.isTypeSupported(t))
}

/** Extensión de archivo acorde al tipo MIME grabado (Whisper la usa para saber el formato). */
export function extensionDeAudio(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('aac')) return 'aac'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

/** ¿Este navegador/contexto puede siquiera pedir el micrófono? */
export function microfonoDisponible(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/** Traduce el error de getUserMedia/MediaRecorder a un mensaje para el usuario. */
export function mensajeErrorMicrofono(e: unknown): string {
  if (!microfonoDisponible()) {
    return 'Este navegador no permite grabar audio acá (probá desde Chrome o Safari, con https).'
  }
  const nombre = e instanceof DOMException ? e.name : ''
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No diste permiso para usar el micrófono. Activalo en los permisos del sitio y volvé a intentar.'
  }
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
    return 'No se encontró ningún micrófono en este dispositivo.'
  }
  if (nombre === 'NotReadableError') {
    return 'El micrófono está siendo usado por otra app. Cerrala e intentá de nuevo.'
  }
  return 'No se pudo grabar audio en este dispositivo. Probá escribir el mensaje.'
}
