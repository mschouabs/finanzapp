# FinanzApp: auditoría y propuesta de evolución

Fase 0 (auditoría) y Fase 1 (propuesta), con el piloto de la Fase 2 ya construido en `/dashboard/nuevo-resumen`. Setiembre 2026.

---

## Resumen ejecutivo

FinanzApp ya resuelve mucho: registrás por lenguaje natural, las tarjetas entienden ciclos de cierre y vencimiento, hay patrimonio, metas, viajes e importación. El techo actual no es visual, es **estructural**, y se nota en tres cosas:

1. **No hay una fuente de verdad.** Cada pantalla trae sus datos y arma sus propios totales. La misma métrica da distinto según dónde la mires, y hay 7 números que directamente están mal (detalle abajo).
2. **La plata no deja rastro.** Los saldos de billetera son un número que se pisa. Transferencias, pagos de tarjeta, ajustes y compras de inversión no quedan registrados como movimientos. Por eso las relaciones entre módulos se rompen: editar un gasto no corrige la billetera, comprar una inversión no descuenta el disponible, un viaje no aparece en Movimientos.
3. **La app muestra, pero no interpreta.** Los datos para responder "¿qué está pasando con mi plata?" existen, pero el Resumen los presenta como tarjetas sueltas. Luca aparece como chat y como avisos puntuales, no como una capa que lee todo el sistema.

La propuesta ataca las tres en ese orden de importancia. El piloto del Resumen ya usa un **núcleo financiero central** (`src/lib/finanzas/nucleo.ts`): es la primera pieza de la fuente de verdad, no solo un rediseño.

---

## FASE 0: auditoría

### 1. Arquitectura técnica

| Qué | Estado |
|---|---|
| Stack | Next.js 16 (App Router) + React 19 + Supabase + Tailwind 3 + recharts + Capacitor |
| Renderizado | Todo `'use client'`, cada página hace sus propias consultas en `useEffect`. El layout del servidor solo valida la sesión |
| Capa de datos | No existe: no hay caché, contexto ni SWR/React Query |
| Tipado de la base | `database.types.ts` existe pero **nadie lo importa** y está desactualizado (faltan `tarjetas_cuentas`, `metas`, `patrimonio_mensual`) |
| App nativa | Capacitor abre la web de producción dentro de un WebView (`server.url`): no funciona sin conexión y corre riesgo de rechazo en las tiendas |
| Sesión | No hay `middleware.ts`, así que una sesión vencida no se refresca sola |

**Problema:** abrir el Resumen dispara **~26 pedidos**. `tarjetas_cuentas` se pide 3 veces, `gastos_variables` 3 (una sin límite, con toda la historia), la cotización 3, y además hay una **escritura en cada visita** (la foto de patrimonio).
**Por qué pasa:** Header, Sidebar, LucaWidget y la página piden cada uno lo suyo, y hay esperas en cadena: primero la cotización, después el resto.
**Propuesta:** un snapshot financiero cargado una vez, en paralelo y con límite temporal, compartido por toda la app.
**Cómo:** `cargarSnapshot()` (ya existe en el piloto: 14 consultas en paralelo, sin cadenas, con 13 meses de historia) y después un proveedor global con caché e invalidación después de cada escritura.
**Beneficio:** el Resumen carga notablemente más rápido y todas las pantallas muestran los mismos números.

Otros hallazgos:
- **recharts se importa de forma estática en 10 pantallas**, sin carga diferida. El piloto usa gráficos SVG propios, más livianos y con animación controlada.
- `demo.ts` (datos falsos + cliente falso) viaja en el bundle de producción aunque esté apagado.
- Hay páginas de 900+ líneas (Movimientos 960, Resumen 934, Billeteras 900) con helpers duplicados: `fmt` definido 7 veces, `tooltipStyle` 4, `Kpi` 3, la clave de mes 5, el rango del mes 4.
- **Bug:** el botón "Nuevo" del bottom nav guarda y llama `router.refresh()`, que no recarga datos traídos del lado del cliente, así que la pantalla abierta queda desactualizada.
- Después de guardar algo, varias pantallas vuelven a mostrar el skeleton completo en vez de actualizarse en el lugar.
- Código muerto: `TopNav.tsx`, `BOTTOM_TABS` en el Sidebar, `capacitor.config.ts.bak`.

### 2. Arquitectura financiera

**Problema:** no hay libro de movimientos (ledger). La plata vive repartida en unas 12 tablas y los saldos son un número que se va pisando (`inversiones.monto`, ajustado con la RPC `ajustar_saldo`, que tampoco está versionada en el repo).
**Por qué importa:** sin rastro no hay forma de conciliar. Si un saldo "no da", no se puede saber por qué.

Lo que hoy **no deja registro**:
- Transferencias entre billeteras (se hacen, pero no queda nada).
- Pagos de resumen: se marcan las cuotas como pagadas y se descuenta el saldo, pero no existe un movimiento "pago de tarjeta".
- Ajustes manuales de saldo, salvo cuando elegís "fue un ingreso", que termina guardado como ingreso freelance.
- Compras de inversión, que ni siquiera descuentan el disponible.

**Riesgos de atomicidad:** varias operaciones hacen 2 o más escrituras separadas. Si la segunda falla, queda plata a medio mover: gasto y después débito, pago de resumen (primero descuenta y después marca), deshacer pago, transferencia, ingreso y después crédito, importación en tandas.

**Propuesta (crítica):** una tabla `movimientos` como fuente de verdad, más RPCs atómicas en Postgres. Se detalla en la Fase 1.

### 3. Arquitectura de información

- La navegación agrupada (Dinero, Planificación, Ingresos, Inversión, Análisis) mejoró, pero **dos grupos tienen un solo ítem** (Ingresos → Trabajos, Inversión → Portfolio) y las rutas no coinciden con los nombres (`gastos-variables` es "Movimientos", `ingresos-gastos` es "Trabajos").
- **Movimientos y Historial se pisan:** los dos listan movimientos con filtros. Historial es el que más fuentes incluye; Movimientos es el único que permite editar a fondo.
- **Trabajos y "Ingresos" son lo mismo** visto desde dos lugares.
- **En mobile no hay búsqueda ni notificaciones** (el Header es solo de desktop).
- El Ctrl+K busca **solo nombres de página**, aunque el placeholder promete movimientos y cuentas.
- Configuración es mayormente decorativa: las preferencias se guardan en localStorage y nadie las lee, y "Exportar" exporta esas mismas preferencias.

### 4. UX

- **Tres formas de cargar un gasto** con reglas distintas: el modal, el widget de Luca y el chat de Luca (más WhatsApp). Por ejemplo, el widget, el chat y WhatsApp ignoran el aviso de saldo negativo, y WhatsApp no guarda la moneda.
- **Un error de débito se informa como "no se pudo guardar"**, aunque el gasto sí se guardó. El usuario reintenta y **duplica el gasto**.
- **Borrar sin deshacer:** gasto, gasto de viaje, ingresos y gasto fijo se borran sin confirmación ni posibilidad de deshacer. Donde sí hay confirmación es con el `window.confirm` nativo, en 8 lugares.
- No existe un sistema de feedback: no hay toasts, cada pantalla muestra mensajes a su manera.
- **Editar el monto de un gasto no corrige la billetera** (en Movimientos y en Historial).
- **"Cobrado este mes" nunca se reinicia:** si una vez cobraste menos, se sigue mostrando ese monto todos los meses.

### 5. UI

- Hay tokens de color, pero **150 estilos inline y 120 colores hex fijos** en los componentes. Los colores de los gráficos del Resumen están fijos y **no siguen el tema rosa**.
- Conviven `fa-amount` (42 usos) y la escala nueva `fa-num-*` (27).
- `text-[10px]` ×55 y `text-[11px]` ×58: demasiado texto chico.
- Radios mezclados (`rounded-lg` 134, `-md` 60, `-xl` 63).
- La fuente Inter se declara pero **nunca se carga**, así que en cada sistema se ve una fuente distinta.
- **Exceso de cajas:** casi todo es una card con borde, y la jerarquía se pierde porque todo pesa lo mismo.

### 6. Responsive

- El layout mobile es un desktop apilado: no prioriza nada.
- Botones de editar y borrar **visibles solo con hover** (Trabajos, Portfolio), inaccesibles en celular.
- **Blancos táctiles de 24–30 px** en Tarjetas, Metas, Billeteras, Viajes y en los modales.
- `maximumScale: 1` **bloquea el zoom con dos dedos** (incumple WCAG 1.4.4).
- La barra inferior mide 62 px pero el espacio reservado es de 60 px.

### 7. Performance

Todo lo del punto 1, más:
- Agregaciones hechas en el cliente sobre toda la historia (`select('*')` sin límite), que se van a volver lentas a medida que crezcan los datos.
- Sin `useMemo` en el Resumen.
- La cotización del dólar se pide 3 veces por visita.

### 8. Accesibilidad

- `Modal` no tiene foco inicial, no atrapa el foco y no lo devuelve al cerrar. `AgregarMovimientoModal` no tiene `role="dialog"` ni cierra con Escape.
- Filas clickeables sin teclado (en Importar) y reordenamiento solo con mouse.
- Estados que dependen solo del color (puntos de notificación, "online").
- Ya resuelto en la ronda anterior: foco visible global.

### 9. Lógica: números que dan distinto según la pantalla

| Métrica | Diferencia |
|---|---|
| Patrimonio | Resumen muestra el **neto** (resta la deuda de tarjetas); Billeteras muestra el **bruto**, y su comparación con el mes anterior y su gráfico también son brutos |
| Ingresos del mes | Resumen suma las secciones propias; Trabajos y Metas no. Trabajos además calcula "este mes" en UTC |
| Gastos del mes | Resumen incluye viajes y secciones; Movimientos no incluye ninguno de los dos; Metas no incluye secciones |
| Gastos fijos | Resumen y Metas cuentan los que tienen `activo ≠ false`; Movimientos solo los que tienen `activo = true` |
| Rendimiento mensual | Tres versiones distintas (Portfolio, Billeteras, Metas) |
| Aviso de vencimiento | 7 días en Resumen y Header, 10 en Tarjetas |
| Dólar de respaldo | `1560` copiado en 9 lugares |

**Números que están mal:**
1. **Cuotas con un mes vacío.** La 1ª cuota se guarda con la fecha de compra y la 2ª con el vencimiento de su resumen. Ejemplo: una compra del 5/9 con Naranja cuenta en septiembre, octubre queda en cero y el resto cae de noviembre en adelante.
2. **Movimientos en 3 meses o "Año"** suma los gastos fijos de **un solo mes**.
3. **"Cobrado" no se reinicia** (explicado en UX), y Historial lo aplica también a todos los meses pasados.
4. **Freelance cuenta en el mes del proyecto, no en el mes en que cobraste.**
5. **"Hoy" se calcula en UTC en 8 pantallas:** a las 21 hs de Argentina ya es "mañana".
6. **Tarjetas suma pesos y dólares sin convertir** en "quedan…" (corregido en la ronda anterior solo para el insight).
7. **Dos metas vinculadas a la misma billetera cuentan la misma plata dos veces**, incluyendo inversiones y BTC.

### 10. Relaciones entre módulos

| Acción | Qué debería afectar | Qué pasa hoy |
|---|---|---|
| Gasto con débito | Movimiento, billetera, Resumen, Luca | ✓ desde el modal y desde Luca · ✗ desde Importar (no descuenta) |
| $50.000 en 3 cuotas | Movimiento, tarjeta, cuotas futuras, Resumen | ✓ en su mayoría · ✗ el mes vacío descripto arriba |
| Editar monto de un gasto | Billetera | ✗ no la corrige |
| Borrar una cuota ya pagada | Devolver el pago | ✗ no devuelve nada |
| Ingreso | Billetera, Trabajos | ✓ solo desde el modal · ✗ desde el chat, WhatsApp y Trabajos |
| Comprar una inversión | Bajar el disponible | ✗ se duplica el patrimonio |
| Gasto de viaje | Movimientos, billetera | ✗ no aparece en Movimientos ni tiene medio de pago |
| Aportar a una meta | Mover plata a la meta | ✗ es solo un contador. Además, las metas vinculadas a una billetera bajan cada vez que gastás de esa billetera |
| Importar consumos de tarjeta | Resumen de la tarjeta, deuda | ✗ no aparecen · ✗ la importación de freelance falla siempre (usa columnas que no existen) |
| Borrar tarjeta o billetera | Registros relacionados | ✗ quedan registros huérfanos: deuda invisible, reintegros que se pierden |

### 11. Luca

Hoy Luca aparece en tres roles: registra gastos (widget y chat), da avisos en algunas pantallas (con datos reales, bien) y funciona como avatar. **Falta que sea una capa:** algo que mire todo el sistema, priorice qué decir según el momento y deje de hablar cuando no hay nada importante. Los estados visuales eran 5 y ya son 9 (se sumaron escuchando, insight, guardando y éxito).

### 12. Interacciones

Solo hay hover-lift y fade-in de entrada. Faltan: feedback al guardar, números que cambian con transición, deshacer, estados de carga dentro de los botones, gráficos que conecten con el resto de la pantalla, atajos de teclado y hojas inferiores (bottom sheets) en mobile.

---

## FASE 1: propuesta

### Priorización

**CRÍTICAS** (arquitectura y lógica)

| # | Problema | Propuesta | Beneficio | Dónde | Complejidad |
|---|---|---|---|---|---|
| C1 | Sin fuente de verdad | **Núcleo financiero** (`lib/finanzas`) con snapshot único y funciones puras por métrica. Todas las pantallas lo consumen | Mismos números en todas partes; se testea una vez | Toda la app | Media (el piloto ya lo tiene) |
| C2 | La plata no deja rastro | **Ledger:** tabla `movimientos` (tipo, monto, moneda, cuenta_origen, cuenta_destino, fecha, categoría, ref_tabla/ref_id, grupo_id). Los saldos se calculan o se reconcilian contra ella | Transferencias, pagos, ajustes e inversiones visibles; auditoría; deshacer | Base + escrituras | Alta (migración gradual: primero se escribe en las dos, después se lee del ledger) |
| C3 | Escrituras no atómicas | **RPCs en Postgres:** `registrar_gasto`, `pagar_resumen`, `transferir`, `registrar_ingreso`, `invertir`, `deshacer(grupo_id)` | Sin plata "a medio mover" | Supabase | Media |
| C4 | Números incorrectos | Corregir los 7 errores (mes vacío en cuotas, UTC, cobrado, fijos en rangos, USD, metas duplicadas, importación de freelance) | Confianza | Núcleo + escrituras | Baja/media |
| C5 | Luca/WhatsApp informan "error" cuando sí guardaron | Distinguir "guardado con aviso" de "no guardado" | Sin duplicados | Luca, WhatsApp | Baja |

**ALTO IMPACTO**

| # | Propuesta | Beneficio | Complejidad |
|---|---|---|---|
| A1 | **"Libre para usar"** = disponible − comprometido en 30 días (ya en el piloto) | Responde la pregunta diaria real | Hecho en el piloto |
| A2 | **Sistema de insights de Luca** (motor + reglas + prioridad según el momento del mes) | Interpretar, no solo mostrar | Hecho en el piloto (9 reglas) |
| A3 | **Registrar global** (+ gasto, ingreso, transferencia, inversión, pago) con atajo N, igual en todas las pantallas | Menos pasos | Baja (en el piloto) |
| A4 | **Toasts + deshacer** en todas las acciones | Seguridad y feedback | Baja (en el piloto) |
| A5 | **Ctrl+K real:** buscar movimientos, cuentas, tarjetas y metas, y ejecutar comandos ("registrar gasto", "gastos de comida") | Velocidad | Media |
| A6 | **Calendario de compromisos** (resúmenes, fijos, cuotas y, a futuro, suscripciones detectadas) | Anticipar | Media |
| A7 | **Gastos fijos con estado mensual** (pagado este mes / pendiente, que se reinicia solo) | Compromisos confiables | Baja |
| A8 | **Unificar Movimientos + Historial:** una sola lista con filtros potentes y edición | Menos duplicación | Media |
| A9 | **Mobile con composición propia** (en el piloto) y búsqueda y notificaciones también en mobile | Uso con una mano | Media |

**MEJORAS**

Design system consolidado (tokens para todos los colores, fuente cargada, escala de tamaños sin `text-[10px]`), gráficos SVG propios en todas las pantallas (sacar recharts), modales accesibles, blancos táctiles de 44 px, habilitar el zoom, tipar la base con `supabase gen types`, `middleware.ts` para la sesión, borrar código muerto, presupuestos por categoría.

**EXPERIMENTALES**

Detección automática de suscripciones y gastos recurrentes, proyección de fin de mes ("a este ritmo cerrás con…"), escenarios ("si pago la tarjeta completa…"), runway ("cuántos meses cubrís con tu disponible"), reglas automáticas ("todo lo de Uber es transporte"), Luca proactivo por notificación push.

### Nuevas funcionalidades (las que valen la pena)

| Funcionalidad | Problema que resuelve | Cómo funcionaría | Dónde aparece | Datos | Complejidad |
|---|---|---|---|---|---|
| **Presupuesto mensual por categoría** | "¿Me estoy pasando?" no tiene referencia | Monto por categoría, con barra de avance contra el ritmo del mes; Luca avisa al 80% | Resumen (en qué se fue), Movimientos | Categorías + tabla nueva `presupuestos` | Media |
| **Suscripciones detectadas** | Pagos chicos recurrentes invisibles | Mismo comercio y monto parecido en 3 meses → propone marcarlo como suscripción | Compromisos, Luca | gastos_variables | Media |
| **Calendario financiero** | Vencimientos dispersos | Vista mensual con cobros y pagos | Pestaña en Compromisos | Tarjetas, fijos, ingresos | Media |
| **Proyección de fin de mes** | Saber a mitad de mes cómo vas a cerrar | Ritmo actual + fijos pendientes + ingresos esperados | Resumen (mes) | Núcleo | Baja |
| **Runway** | "¿Cuánto aguanto?" | Disponible ÷ gasto mensual promedio | Resumen (patrimonio) | Núcleo | Baja |
| **Conciliación de saldo** | Saldos que no coinciden con el banco | "Tu saldo real es X": crea un ajuste en el ledger y explica la diferencia | Billeteras | Ledger | Media (requiere C2) |

### Nueva arquitectura de información

```
Resumen
Dinero ─── Movimientos (+Historial unificado) · Billeteras · Tarjetas · Compromisos*
Planificación ─── Metas · Viajes · Presupuestos*
Ingresos e inversión ─── Trabajos · Portfolio
Herramientas ─── Importar · Luca
(* nuevas)
```
Unir Ingresos + Inversión evita dos grupos de un solo ítem. Ctrl+K y el botón "Registrar" quedan como capas globales.

### Design system

- **Color con función:** verde = positivo y acción, rojo/rosa = gasto y alerta, azul = información y disponible, violeta = inversión, amarillo = compromiso y advertencia. Todo por token (se agregan `warning` y `violet` a Tailwind), sin hex en los componentes.
- **Superficies:** página `#080D13`, panel (`fa-panel`: radio de 16, borde sutil, sin sombra), paneles internos un escalón más claros. Menos cards: bandas, listas y hairlines.
- **Tipografía:** un solo número hero por vista (40–56 px); después 32 / 21 / 15 / 13, con `tabular-nums` en todas las cifras. Etiquetas de 11 px en mayúsculas solo para rótulos.
- **Movimiento** (ya en `globals.css`): `--dur-fast` 140 ms (hover, toque, toggles), `--dur-std` 240 ms (expandir, cambiar de vista, tabs), `--dur-emph` 380 ms (entrada de paneles, números, gráficos). Dos curvas: `--ease-out` y `--ease-in-out`. Todo se apaga con `prefers-reduced-motion`.
- **Estados** en cada componente: default, hover, focus-visible, active (escala 0,97), loading (dentro del botón), success (toast), warning, error, disabled.
- **Componentes base** (en el piloto): `NumeroAnimado`, `Revelar`, `Toasts`, `Pestanas`, `Encabezado`, `GraficoMensual`, `fa-colapsable` (expandir sin medir alturas).

### Desktop vs mobile

- **Desktop = centro de control:** grilla de 12 columnas, patrimonio y "libre" arriba, hover que conecta información (segmento ↔ leyenda, compromiso ↔ barra, mes del gráfico ↔ bloque del mes, categoría ↔ actividad), atajos (N, Ctrl+K).
- **Mobile = una mano:** libre para usar → el mes → Luca → actividad → compromisos. El análisis se abre a demanda y la captura de Luca va en una hoja inferior. El patrimonio se despliega con un toque.

---

## FASE 2: el piloto (qué validar)

Ruta: **`/dashboard/nuevo-resumen`**. También se llega desde el aviso "Preview" en el Resumen actual, que **no se modificó**.

| Demuestra | Dónde |
|---|---|
| Número animado y tinte al cambiar | Patrimonio, libre, entró/salió/quedó después de registrar algo |
| Interacción con el patrimonio | Hover en un segmento ↔ su bloque; click → dónde está esa plata (por billetera) |
| Compromisos conectados | Hover en un segmento de "Comprometido" ↔ fila de la lista; "Pagar" abre el pago real |
| Cambio de período | Flechas del mes, o click en una columna del gráfico: el mes y las categorías cambian juntos |
| Gráficos animados | Columnas que crecen y líneas que se dibujan una sola vez; crosshair, tooltip y "ver como tabla" |
| Categoría → actividad | Click en una categoría filtra la actividad reciente |
| Luca como capa | Insight priorizado según el momento del mes, "¿por qué?" que se expande, ocultar por hoy, estados del avatar |
| Registro visual | "Gasté 18.500 en comida con MP" → Luca interpreta → confirmás → toast con **Deshacer** → la actividad resalta la fila nueva → se actualizan gastos, balance y disponible |
| Registrar global | Botón "Registrar" o tecla **N**: gasto, ingreso, transferencia, inversión, pago de tarjeta |
| Loading, error y vacío | Skeleton con la forma real (Luca "pensando"), error con reintento, pantalla vacía guiada |

**Cambios fuera del piloto (compatibles con lo existente):**
- `guardarGastoVariable` ahora devuelve lo que guardó, para poder deshacerlo.
- `LucaAvatar` tiene 4 estados nuevos.
- `globals.css` suma el sistema de movimiento.
- Tailwind suma los colores `warning` y `violet`.
- El Resumen actual tiene el aviso para ir al piloto.

**Criterios del núcleo que conviene confirmar** (afectan números):
- Cada cuota cuenta en un mes consecutivo desde la compra, lo que elimina el mes vacío.
- "Hoy" y "este mes" se calculan en hora local.
- Los sueldos de meses pasados usan el monto nominal.
- Los gastos fijos cuentan desde el mes en que se cargaron.
