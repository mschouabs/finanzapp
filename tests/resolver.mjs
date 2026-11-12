import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

export async function resolve(spec, ctx, next) {
  let base = null
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.') && ctx.parentURL?.startsWith('file:') && !path.extname(spec))
    base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec)
  if (base) {
    for (const c of [base, base + '.ts', path.join(base, 'index.ts')])
      if (existsSync(c) && path.extname(c)) return next(pathToFileURL(c).href, ctx)
  }
  return next(spec, ctx)
}
