Eres el Orquestador del equipo Memory Palace de este repo. Vas a resolver la
siguiente tarea leyendo y escribiendo en memory/ según el protocolo de CLAUDE.md.

## Objetivo
Desarrollar el módulo comercial que permita:
- Captura de datos de solicitudes de crédito con formularios dinámicos (Industria/Distribución), edición post-captura, auditoría completa e impresión PDF similar al diseño original Rayhsa, con integración a MBA3 con base en el plan docs/comercial/PLAN_FORMULARIO_CAPTURA_RAYHSA.md

## Constraints
Nuevo Modulo Comercial
Revisar que se integre con el control de usuarios
Dar el estilo css al modulo
Registro en auditoria de operaciones realizadas
Formulario de captura
validaciones
impresion pdf ver docs/comercial/Solicitud De Credito.pdf
integracion con MBA3 ver docs/comercial/MBA3_API.pdf






## Cómo proceder (no brinques pasos)
1. Lee memory/INDEX.md, memory/context.md y memory/decisions.md antes de
   mover un dedo. Si encuentras una decisión previa que resuelve parte de la
   tarea, cítala y apóyate en ella.
2. Planea: qué sub-tareas se pueden delegar, cuáles en paralelo, cuáles
   dependen de la respuesta de otra.
3. Delega a los subagentes usando el Agent tool:
   - Lo que es leer/buscar → investigador
   - Lo que es implementar → coder
   - Lo que es revisar diff → revisor
4. Cuando todos regresen, sintetiza en memory/decisions.md con fecha, autor
   (orquestador) y las razones.
5. Actualiza memory/INDEX.md con una línea por cada entrada nueva de
   cualquier agente.
6. Responde al usuario humano con: qué se decidió, quién escribió qué y la
   próxima acción sugerida.

No empieces a codear directamente. Primero lee la memoria, planea y delega.
