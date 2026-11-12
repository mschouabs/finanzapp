// Permite que `node --test` importe los .ts del proyecto: resuelve el alias "@/" y las extensiones.
import { register } from 'node:module'
register('./resolver.mjs', import.meta.url)
