# Equipo de agentes — Memory Palace

Todo agente que trabaje en este repo (principal o sub) lee y escribe en
`memory/` siguiendo este protocolo.

## Qué NO es esta carpeta
`memory/` es el cuaderno compartido del equipo: vive en el repo y se sube a
git. No es la memoria automática de Claude Code, que vive fuera del repo, es
de una sola máquina y no se carga dentro de los subagentes. Cuando el
protocolo dice "memoria", habla de esta carpeta.

## Proyecto
{{NOMBRE_PROYECTO}} — {{MISION}}

Stack: {{STACK}}

## Archivos (Core 4 — arranca con estos)
- memory/INDEX.md       → mapa del cuaderno (TOC + últimas entradas)
- memory/context.md     → misión, alcance, stakeholders
- memory/decisions.md   → decisiones tomadas (fecha, autor, por qué)
- memory/research.md    → hallazgos de investigación

## Archivos (Extended — activa cuando escales)
- memory/code-notes.md  → patrones y trampas de quien produce
- memory/reviews.md     → hallazgos de revisión + fixes aplicados
- memory/tests.md       → resultados de prueba (PASS/FAIL/BLOQUEADO) del tester
- memory/roadmap.md     → tablero de avance por fases (lo mantiene el orquestador)
- memory/blockers.md    → unknowns, bloqueos activos
- memory/glossary.md    → terminología del proyecto

## Protocolo (6 reglas — obligatorias)
1. Antes de trabajar: lee INDEX.md + /docs/*.md (si existen) + los archivos
   relevantes a tu rol. "Lee" significa abrirlos con la herramienta de
   lectura. Nadie te los inyecta solo por estar mencionados aquí.
2. Al terminar: añade entrada con formato `### [AAAA-MM-DD] [agente] — título`.
3. Nunca borres lo que otro escribió. Marca obsoleto con `~~texto~~`.
4. Si contradices una decisión, NO la sobrescribas: escribe en decisions.md
   con prefijo "CONFLICTO:" y avisa al orquestador.
5. Mantén INDEX.md actualizado: una línea por entrada nueva.
6. Cada agente escribe en UN solo archivo de memoria. Si necesitas otro,
   pide al orquestador que lo haga por ti.

## Dónde se piensa a fondo
La palabra `ultrathink` sube el razonamiento de un turno. En este equipo se
usa en tres momentos y no en más: planear el reparto, resolver un
"CONFLICTO:", y sintetizar los retornos en una decisión. Y va en el prompt
del agente que va a pensar — cada subagente arranca sin ver el mensaje que le
escribiste al orquestador.

## Roles disponibles (.claude/agents/)
- investigador → lee todo, escribe en research.md
- coder       → lee research + decisions, escribe código y code-notes.md
- revisor     → lee código + code-notes, escribe en reviews.md
- tester      → lee docs + decisions + code-notes, prueba contra el estándar
                del proyecto, escribe en tests.md (y escala fixes a decisions.md
                con prefijo "PARA RESOLVER:")
- orquestador → lee todo, escribe decisions.md + INDEX.md + roadmap.md, delega a los demás

## Excepciones de escritura a decisions.md (además de la regla 4)
La regla 6 (un agente = un archivo) tiene dos excepciones ya sancionadas hacia
decisions.md, ambas para escalar, nunca para decidir:
- Cualquier agente, ante una contradicción con una decisión: entrada `CONFLICTO:`.
- El tester, ante un FAIL que necesita un cambio de código o una decisión:
  entrada corta `PARA RESOLVER: [tester]` (el detalle completo vive en tests.md).
El orquestador es quien resuelve y cierra estas entradas.

La disciplina del cuaderno es más importante que la herramienta. Si añades un
6.º agente, dale un archivo de escritura único y agrégalo aquí.
