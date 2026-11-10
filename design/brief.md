# Brief de diseño — Inscripción de asignaturas UNIMINUTO

Estado: **borrador para aprobación del operador** (Fase 4, paso 1). Vista previa visual:
`design/brief-preview.html`.

## 1. Concepto

**"El horario es el mapa."** La semana es la protagonista y la fuente de verdad: cada NRC es
una pieza que el estudiante se *prueba* sobre su semana antes de inscribirla. Los cupos son
sillas que se cuentan una a una (barra segmentada, el elemento firma del producto). Base azul
institucional y tranquila; el dorado se reserva para lo que corre contra el tiempo.

### Principios

1. **Probar antes de inscribir.** Tocar o pasar sobre un NRC siempre dibuja sus bloques en la
   semana. Nadie inscribe a ciegas.
2. **Números que se cuentan.** Cupos y horas en cifras tabulares, con texto explícito
   ("3 de 18 libres"). El color refuerza, nunca es la única señal.
3. **El dorado significa "ahora".** Reserva corriendo, últimos cupos, foco en oscuro. Nunca
   decoración.
4. **Una mano, un pulgar.** La acción principal vive en la zona inferior; objetivos táctiles
   ≥ 44 × 44 px (48 en botones primarios).
5. **Calma bajo presión.** El movimiento solo explica un cambio (se fue un cupo, apareció un
   bloque). Sin confeti, sin rebotes, sin cuenta regresiva roja gigante.

### La tensión con el manual (glassmorphism y degradado)

| Propuesta del manual | Decisión | Por qué |
| --- | --- | --- |
| Glassmorphism | **Un solo uso funcional**: la bandeja inferior de acción en móvil (sobre la semana) usa superficie al 86 % + `backdrop-filter: blur(16px) saturate(140%)`. En ningún otro lugar. Respaldo sólido si el navegador no soporta `backdrop-filter` o con `prefers-reduced-transparency`. | Ahí el vidrio *hace algo*: deja ver la semana detrás mientras decides. Vidrio en tarjetas es la estética genérica que el operador pidió evitar y degrada contraste sobre contenido variable. |
| Botón con degradado (oscuro) | **Rechazado.** Botón sólido `#1E6BFF` con un filo de luz interior de 1 px arriba (`inset 0 1px 0 rgb(255 255 255 / .18)`). | Medido: blanco sobre `#1E6BFF` = 4.56:1 (AA). Un degradado típico hacia `#4C8DFF` cae a 3.20:1 en su extremo claro: el texto del botón principal dejaría de cumplir AA. El filo de luz conserva la intención de "brillo" del manual sin el tic de IA. |

El resto del manual se respeta tal cual: colores, Montserrat + Open Sans, tono, reglas del logo.

## 2. Paleta

Colores de marca **solo** los del manual. Los semánticos (éxito, peligro, info, tintas y
bordes) son derivados propios. Ratios calculados con la fórmula de luminancia relativa
WCAG 2.x (script en el scratchpad, fuera del repo). AA texto normal ≥ 4.5; texto grande y
componentes de UI ≥ 3.

### Claro

| Token | HEX | Rol | Contraste medido |
| --- | --- | --- | --- |
| `--bg` | `#F3F5F8` | Fondo de app | — |
| `--surface` | `#FFFFFF` | Tarjetas, hojas, calendario | — |
| `--surface-2` | `#E8EDF3` | Hundidos, skeleton, franja nocturna del calendario | — |
| `--text` | `#14233A` | Texto principal | 15.77 sup. · 14.44 fondo — AA |
| `--text-2` | `#555555` (manual) | Texto secundario | 7.46 sup. · 6.83 fondo — AA |
| `--text-3` | `#626D7B` | Metadatos, ejes del calendario | 5.26 sup. · 4.82 fondo — AA |
| `--border` | `#C9D2DD` | Divisores (decorativo) | 1.53 — no aplica (no transmite estado) |
| `--border-strong` | `#8A96A6` | Bordes de inputs y controles | 3.00 — AA UI (justo) |
| `--primary` | `#003366` (manual) | Botón principal, bloque inscrito, sillas libres | 12.61 sobre blanco — AA |
| `--on-primary` | `#FFFFFF` | Texto sobre primario | 12.61 — AA |
| `--primary-soft` | `#E3EBF4` | Vista previa, selección | texto 13.11 · primario 10.48 — AA |
| `--accent` | `#F2A900` (manual) | Reserva, últimos cupos (solo como relleno) | **2.01 sobre blanco — NO** |
| `--on-accent` | `#14233A` | Texto sobre dorado | 7.85 — AA |
| `--accent-ink` | `#8A5A00` | Dorado legible como texto | 5.93 sup. · 5.28 sobre `--accent-soft` — AA |
| `--accent-soft` | `#FDF1D4` | Fondo de bloque reservado / aviso | texto 14.05 — AA |
| `--success` / soft | `#1C7A4A` / `#E3F3EA` | Confirmada | 5.34 sup. · 4.65 sobre soft — AA |
| `--warning` | `#9A5A00` | Pocos cupos | 5.47 sup. · 4.88 sobre `--accent-soft` — AA |
| `--danger` / soft | `#B3261E` / `#FBE9E7` | Último cupo, cruce, error | 6.54 sup. · 5.58 sobre soft — AA |
| `--info` | `#1F5FA8` | Avisos neutrales, enlaces | 6.44 sup. · 5.35 sobre `--primary-soft` — AA |
| `--focus` | `#003366` | Anillo de foco 2 px + 2 px de separación | 11.55 sobre fondo — AA UI |
| `--seat-free` / `--seat-taken` | `#003366` / `#C9D2DD` | Sillas de la barra de cupos | libre vs ocupada 8.25 — AA UI |

### Oscuro

| Token | HEX | Rol | Contraste medido |
| --- | --- | --- | --- |
| `--bg` | `#0A0F1D` (manual) | Fondo | — |
| `--surface` | `#121A2D` (manual) | Tarjetas, calendario | — |
| `--surface-2` | `#1A2440` | Hundidos, skeleton, franja nocturna | — |
| `--text` | `#E2E8F0` (manual) | Texto principal | 14.06 sup. · 15.50 fondo — AA |
| `--text-2` | `#94A3B8` (manual) | Secundario | 6.76 sup. · 7.45 fondo — AA |
| `--text-3` | `#7D8BA1` | Metadatos | 5.02 sup. — AA |
| `--border` | `#26324D` | Divisores (decorativo) | 1.36 — no aplica |
| `--border-strong` | `#5B6A8A` | Inputs y controles | 3.20 — AA UI |
| `--primary` | `#1E6BFF` (manual) | Botón principal (relleno) | **3.80 como texto sobre sup. — solo grande/UI** |
| `--on-primary` | `#FFFFFF` | Texto del botón | 4.56 — AA |
| `--primary-ink` | `#6EA8FF` | Primario como texto, enlaces, sillas libres | 7.19 sup. · 6.18 sobre soft — AA |
| `--primary-soft` | `#15264A` | Vista previa, bloque inscrito | texto 12.10 — AA |
| `--accent` | `#F5B014` (manual) | Reserva, foco | 9.17 sup. — AA |
| `--on-accent` | `#0A0F1D` | Texto sobre dorado | 10.10 — AA |
| `--accent-soft` | `#2A2414` | Fondo de reservado / aviso | dorado 8.16 · texto 12.52 — AA |
| `--success` / soft | `#3DBE7E` / `#0F2A1E` | Confirmada | 7.32 · 6.47 — AA |
| `--warning` | `#F5B014` | Pocos cupos | 9.17 — AA |
| `--danger` / soft | `#FF7A6E` / `#33191C` | Último cupo, cruce, error | 6.82 · 6.37 — AA |
| `--info` | `#6EA8FF` | Avisos, enlaces | 7.19 — AA |
| `--focus` | `#F5B014` | Anillo de foco | 10.10 fondo · 9.17 sup. — AA UI |
| `--seat-free` / `--seat-taken` | `#6EA8FF` / `#2E3B58` | Sillas | libre vs ocupada 4.63 — AA UI |

### Lo que no cumple AA y cómo se maneja

- **Dorado claro `#F2A900` sobre blanco (2.01).** Nunca como texto, icono suelto ni borde
  fino sobre blanco. Solo como relleno con texto `--on-accent` (7.85) o como barra lateral
  decorativa acompañada de texto que dice el estado. El dorado como texto usa `--accent-ink`.
- **Blanco sobre dorado (2.01).** Prohibido; sobre dorado va siempre `--on-accent`.
- **`#1E6BFF` como texto sobre superficie oscura (3.80).** Solo como relleno de botón con
  texto blanco (4.56) o en texto ≥ 18.66 px negrita. Para texto y enlaces: `--primary-ink`.
- **Foco dorado sobre botón azul en oscuro (2.41).** El anillo lleva 2 px de separación, de
  modo que su color contrasta contra el fondo (10.10), no contra el botón.
- **Bordes decorativos (`--border`).** No cumplen 3:1 a propósito: no transmiten estado. Todo
  control interactivo usa `--border-strong`.
- **Silla ocupada vs superficie (≈1.5).** La barra es apoyo; la información vive en el texto
  "3 de 18 libres" y en la diferencia libre/ocupada (≥ 4.63).

## 3. Tipografía

- **Montserrat** (600/700): títulos, nombre de materia, número grande de cupos.
- **Open Sans** variable (400/600, eje `wdth`): todo el texto. En el calendario se usa
  `font-stretch: 87.5%` para que "18:15 · A406LS27" quepa en columnas de 50 px sin cortar.
  `next/font/google` con `axes: ['wdth']`.
- **Cifras tabulares** (`font-variant-numeric: tabular-nums`) en horas, NRC, cupos, créditos y
  contadores de reserva: los números no "bailan" cuando cambian en vivo.
  Verificado en navegador: Open Sans ya trae dígitos de ancho fijo; Montserrat es
  proporcional por defecto ("1111" 63 px vs "0000" 109 px a 40 px) y con `tnum` queda en
  112/112. Ojo: el shorthand `font:` reinicia `font-variant-numeric`; declararlo después.
- Mayúsculas solo donde el dato ya lo es (días `MAR`, salones `A406LS27`). Sin etiquetas en
  versalitas espaciadas.

| Rol | Móvil (390) | Escritorio (≥ 1024) | Familia / peso |
| --- | --- | --- | --- |
| Título de página | 24/30 | 30/36 | Montserrat 700, `letter-spacing: -0.01em` |
| Sección | 19/24 | 22/28 | Montserrat 600 |
| Materia / tarjeta | 16/22 | 17/24 | Montserrat 600 |
| Cuerpo | 16/24 | 16/24 | Open Sans 400 (16 evita zoom en iOS) |
| Compacto | 14/20 | 14/20 | Open Sans 400/600 |
| Meta / eje | 12/16 | 13/18 | Open Sans 600, tabular |
| Bloque calendario | 11/14 | 12/16 | Open Sans 600, `wdth 87.5`, tabular |
| Cifra de cupos | 20/24 | 22/28 | Montserrat 700, tabular |

Líneas de texto corrido ≤ 70 caracteres.

## 4. Espaciado, radios, elevación y movimiento

**Espaciado** (base 4): `2 4 8 12 16 20 24 32 40 56`. Gutter móvil 16; separación entre
tarjetas 12; padding de tarjeta 16; secciones 32 (móvil) / 40 (escritorio).

**Radios por jerarquía** (no uno para todo): sillas 2 · chips y bloques de calendario 6 ·
inputs y botones 10 · tarjeta de NRC 14 · bandeja inferior 20 (solo esquinas superiores) ·
insignias redondas 999.

**Elevación.** Claro: la mayoría de superficies van con borde, sin sombra. `e1` (tarjeta
activa) `0 1px 2px rgb(0 51 102 / .08)`; `e2` (bandeja, popover, toast)
`0 10px 28px -6px rgb(0 51 102 / .22), 0 2px 4px rgb(0 51 102 / .08)`. Sombras teñidas de
azul, no gris neutro. Oscuro: sin sombras; la elevación sube un paso de superficie
(`--surface` → `--surface-2`) y suma un filo superior `inset 0 1px 0 rgb(255 255 255 / .05)`.

**Movimiento** (Motion):

| Token | Valor | Uso |
| --- | --- | --- |
| `--dur-press` | 100 ms | Presión de botón (`scale .98`) |
| `--dur-fast` | 160 ms | Vista previa del bloque, hover |
| `--dur-base` | 240 ms | Expandir materia, bandeja, toast |
| `--dur-count` | 420 ms | Silla que se ocupa + número que cambia |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | Entradas |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)` | Cambios de estado |
| Bandeja | spring `stiffness 420, damping 38` | Sin rebote visible |

Se anima: la silla que pasa de libre a ocupada (y su número), la aparición del bloque de
vista previa (opacidad + `scale .98 → 1`), el check de confirmación (trazo del icono), la
bandeja inferior, el cambio de tarjeta agotada → alternativa.
No se anima: la carga de página, la entrada de listas, los hovers de tarjetas, los iconos.
Skeleton con pulso lento de opacidad (1.4 s), sin brillo que barre.
`prefers-reduced-motion: reduce`: todo pasa a fundido ≤ 80 ms o instantáneo; los números
cambian sin rodar; el resaltado de "cambió" es un contorno estático de 2 s.

## 5. Componentes clave

**Barra de cupos en vivo (firma).** Una silla por cupo (cupos reales: 1–35, cabe siempre en
una fila; > 40 cambia a barra continua con marcas cada 5). Ocupadas a la izquierda en
`--seat-taken`, libres a la derecha en `--seat-free`. Encima, texto que cambia de forma, no
solo de color:

| Libres | Texto | Señal extra |
| --- | --- | --- |
| > 25 % | "12 de 18 libres" | ninguna |
| ≤ 25 % o ≤ 3 | "Quedan 3 de 18" | `--warning`, icono `Hourglass` |
| 1 | "Último cupo" | `--danger`, icono `TriangleAlert`, silla libre con contorno |
| 0 | "Agotado" | sillas rayadas, la tarjeta da paso a la alternativa |

Al bajar un cupo, la silla se apaga en 420 ms y el número cambia con un breve contorno.
`aria-live="polite"` anuncia solo los umbrales (quedan 3, último, agotado), nunca cada
cambio, para no saturar el lector de pantalla.

**Tarjeta de NRC.** Fila 1: NRC (tabular, 600) + modalidad y sede como texto plano. Fila 2:
horario legible ("Mar y Jue 18:15–19:44") + salón. Fila 3: docente. Fila 4: barra de cupos.
Acción a la derecha: botón "Inscribir" (escritorio) o la tarjeta completa seleccionable con
la acción en la bandeja (móvil). Estado seleccionado: borde 2 px `--primary` y fondo
`--primary-soft`; nada de sombras crecientes. Variantes de altura: virtual (sin bloques)
muestra "Virtual, sin horario fijo" y no ocupa la semana.

**Bloque del calendario.** Posición exacta por minuto; texto: materia abreviada, hora, salón.

| Estado | Tratamiento |
| --- | --- |
| Inscrito | Claro: relleno `--primary`, texto blanco. Oscuro: `--primary-soft` + barra izquierda 3 px `#1E6BFF`, texto `--text`. |
| Vista previa | Borde discontinuo 1.5 px `--primary` (`--primary-ink` en oscuro), fondo `--primary-soft`, etiqueta "Vista previa". |
| Reservado | Fondo `--accent-soft`, barra izquierda 3 px `--accent`, contador "4:32" tabular con icono `Clock`. |
| Conflicto | Fondo `--danger-soft` con rayado diagonal, borde 1.5 px `--danger`, texto "Cruza con 80852". |

**Lista de materias.** Filas (no tarjetas) agrupadas por semestre, con nombre, código,
créditos y "4 grupos". Expandir revela los NRC debajo (acordeón Radix). Materia inscrita:
check `--success` + NRC elegido; queda al final del grupo.

**Botón Inscribir.** 48 px de alto, ancho completo en la bandeja.
Reposo "Inscribir 80852" → presionado → "Inscribiendo…" (spinner pequeño, deshabilitado,
mismo ancho) → "Reservado" (dorado, contador) → "Inscrita" (verde, check). Si falla, vuelve
a reposo y el aviso explica qué pasó. Deshabilitado solo con motivo visible al lado.

**Aviso "se agotó → alternativa".** Reemplaza en su lugar a la tarjeta agotada (no es un
modal ni un toast que se va). Borde izquierdo `--accent`, fondo `--accent-soft`:
"Se agotó 80852. El 40930 tiene 6 cupos y no cruza con tu horario." + mini resumen del
40930 + botón "Inscribir 40930" y enlace "Ver otros grupos". La alternativa se pinta de
inmediato como vista previa en la semana.

**Estados.**
- *Carga*: skeleton con la forma real (filas de materia, 2 tarjetas, rejilla de semana).
- *Vacío*: frase + una acción. Sin ilustraciones.
- *Error*: qué pasó, qué no se perdió, qué hacer. Botón "Reintentar".
- *Sin conexión*: franja fija bajo el encabezado, `--surface-2` + icono `WifiOff`; los cupos
  se muestran atenuados con "Actualizado hace 40 s"; "Inscribir" se deshabilita con motivo.
- *Éxito*: toast inferior (encima de la bandeja) con check animado, 4 s, y el bloque pasa de
  reservado a inscrito en la semana.

## 6. Layout de inscripción

**Móvil (390 px).** La semana va arriba en forma compacta y fija; la lista se desplaza
debajo; la decisión vive en la bandeja inferior.

```
┌──────────────────────────────────────┐  390
│ UNIMINUTO        2027-1        [◐][≡] │  56  encabezado
├──────────────────────────────────────┤
│ Tu semana               9 créditos ▾  │
│     LUN  MAR  MIE  JUE  VIE  SAB      │
│ 07  ·    ·    ·    ·    ·   ▓▓▓       │  semana compacta, sticky
│ 12  ·    ·    ·    ·    ·    ·        │  07–22 en 176 px (11 px/h)
│ 18 ░░░░ ███  ░░░░ ███  ░░░░ ·         │  franja 18–22 sombreada
│ 22  ·   ┄┄┄   ·   ┄┄┄   ·    ·        │  ┄ = vista previa
├──────────────────────────────────────┤
│ 3.er semestre                         │
│ ▸ Sistemas Operativos  ISUMBG103  3cr │  fila de materia
│   ┌─ 80852  Presencial · Calle 80 ──┐ │
│   │ Mar y Jue 18:15–19:44  A406LS27 │ │  tarjeta NRC seleccionada
│   │ Quedan 3 de 18  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯│ │
│   └──────────────────────────────────┘ │
│   ┌─ 40930 ... 12 de 20 libres ─────┐ │
│ ▸ Bases de Datos       ISUMBG193  4cr │
├──────────────────────────────────────┤
│░ 80852 · Mar y Jue 18:15  [Inscribir]░│  bandeja (vidrio), 72 px
└──────────────────────────────────────┘
```

- La semana compacta (07:00–22:00) solo muestra barras; tocarla la expande a pantalla
  completa con texto en los bloques (pestaña "Semana" / "Materias").
- La franja 18:00–22:00 y la mañana del sábado tienen fondo `--surface-2`: ahí vive la
  mayoría de clases y el ojo va directo.
- Tocar un NRC = seleccionarlo + vista previa en la semana + bandeja con su acción.

**Escritorio (≥ 1024 px).** Dos columnas: lista a la izquierda (420 px, scroll propio) y
semana completa a la derecha (sticky, flexible, 64 px por hora en 07–22 con scroll inicial a
las 17:30). La bandeja desaparece: cada tarjeta lleva su botón. Hover sobre un NRC = vista
previa; clic fija la selección. Tablet (640–1023): igual que móvil con semana más alta.

**Analítica (coordinación, escritorio).** Misma paleta y tipografía; gráficos con
`--primary` para la serie principal y `--accent` solo para resaltar lo crítico (NRC que se
llenaron en < 5 min). Se detalla en la Fase 6.

## 7. Tono y microcopy

Cercano, directo, en segunda persona ("tu horario"). Frases cortas con verbo. Errores sin
disculpas ni culpas: qué pasó y qué hacer. La acción conserva su nombre en todo el flujo
(Inscribir → Inscribiendo… → Inscrita).

| Momento | Texto |
| --- | --- |
| Login | "Entrar con cuenta institucional" |
| Botón | "Inscribir 80852" |
| Reserva | "Te guardamos el cupo 5 minutos mientras confirmamos." |
| Confirmación (toast) | "Inscrita: Sistemas Operativos, NRC 80852." |
| Sin cupo | "Se agotó 80852. El 40930 tiene 6 cupos y no cruza con tu horario." |
| Cruce | "Se cruza con Bases de Datos (NRC 81204) el martes a las 18:15." |
| Ya inscrita | "Ya tienes Sistemas Operativos en tu horario." |
| Prerrequisito | "Primero necesitas aprobar Estructuras de Datos." |
| Rechazada | "El sistema académico no confirmó 80852. Liberamos el cupo; puedes intentarlo de nuevo." |
| Error | "No pudimos inscribirte. No se descontó ningún cupo. Reintentar" |
| Vacío (materias) | "No tienes materias pendientes para 2027-1. Revisa tu horario." |
| Vacío (grupos) | "Ningún grupo de esta materia encaja hoy con tu semana. La lista se actualiza sola." |
| Sin conexión | "Sin conexión. Los cupos pueden haber cambiado. Reconectando…" |

## 8. Referencias reales

1. **Google Calendar (Android, vista de 3 días y semana).** Tomo: bloques posicionados al
   minuto con el texto recortado en orden de importancia (título → hora → lugar), la
   línea de "ahora" y el gesto de tocar el encabezado para expandir la semana.
2. **Notion Calendar (antes Cron).** Tomo: el bloque "fantasma" que previsualiza un evento
   antes de crearlo (contorno, fondo tenue) y la regla hover = previsualizar, clic = fijar en
   escritorio.
3. **Transit (app de transporte en tiempo real).** Tomo: la honestidad del dato en vivo —
   indicador discreto de que el número es en tiempo real, "actualizado hace X s" cuando se
   pierde la señal, y números grandes tabulares que cambian sin saltos de layout.

## 9. Qué evitamos

- **Degradados morados o de cualquier color como decoración**: no son de la marca y bajan el
  contraste del texto (medido arriba).
- **Glassmorphism en tarjetas**: ruido visual y contraste impredecible; solo en la bandeja.
- **Tarjetas idénticas en grilla**: las materias son filas; las tarjetas existen solo para
  NRC, que sí son objetos comparables, y varían por estado.
- **Emojis e ilustraciones de relleno** en vacíos y éxitos: Lucide, un icono por mensaje.
- **Hero gigante**: el estudiante llega a inscribir; la primera pantalla tras el login ya es
  la semana y sus materias.
- **Etiquetas en mayúsculas espaciadas sobre cada sección, flechas "→" en botones,
  monoespaciada para datos**: tics de plantilla. Los datos van en Open Sans tabular.
- **Color como única señal** de cupos o estados: siempre texto e icono.
- **Cuenta regresiva alarmista**: la reserva de 5 min se muestra en pequeño y en dorado,
  no en rojo pulsante.
- **Modales para errores esperables** (sin cupo, cruce): el aviso aparece en el lugar del
  problema.
