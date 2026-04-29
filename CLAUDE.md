# Equipo de agentes — Memory Palace

Todo agente que trabaje en este repo (principal, sub o teammate) lee y escribe
en `memory/` siguiendo este protocolo.

## Archivos (Core 4 — arranca con estos)
- memory/INDEX.md       → mapa del cuaderno (TOC + últimas entradas)
- memory/context.md     → misión, alcance, stakeholders
- memory/decisions.md   → ADRs (fecha, autor, por qué)
- memory/research.md    → hallazgos de investigación

## Archivos (Extended — activa cuando escales)
- memory/code-notes.md  → patrones, trampas, gotchas del coder
- memory/reviews.md     → hallazgos de revisión + fixes aplicados
- memory/blockers.md    → unknowns, bloqueos activos
- memory/glossary.md    → terminología del proyecto

## Protocolo (6 reglas — obligatorias)
1. Antes de trabajar: lee INDEX.md + los archivos relevantes a tu rol.
2. Al terminar: añade entrada con formato `### [YYYY-MM-DD] [agente] — título`.
3. Nunca borres lo que otro escribió. Marca obsoleto con `~~texto~~`.
4. Si contradices una decisión, NO la sobrescribas: escribe en decisions.md
   con prefijo "CONFLICTO:" y pinea al orquestador.
5. Mantén INDEX.md actualizado: una línea por entrada nueva.
6. Si no tienes permiso de escritura sobre un archivo, pide al orquestador
   que lo haga por ti.

## Roles disponibles (.claude/agents/)
- investigador → lee todo, escribe en research.md
- coder       → lee research + decisions, escribe código y code-notes.md
- revisor     → lee código + code-notes, escribe en reviews.md
- orquestador → lee todo, escribe decisions.md + INDEX.md, delega a los demás

La disciplina del cuaderno es más importante que la herramienta. Si añades un
5.° agente, dale un archivo de escritura único y agrégalo aquí.


Las reglas del proyecto están organizadas en `.claude/rules/`:

- [core.md](.claude/rules/core.md) — Stack, estructura de módulos, flujo de trabajo
- [testing.md](.claude/rules/testing.md) — Framework y convenciones de testing

La informacion del proyecto esta en `PLAN.md`
