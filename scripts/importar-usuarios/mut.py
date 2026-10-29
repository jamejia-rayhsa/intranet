#!/usr/bin/env python3
"""Mutación manual de las reglas de 'Importar usuarios': cada mutante rompe UNA regla y las pruebas jest deben fallar.
Uso: python3 scripts/importar-usuarios/mut.py [texto del mutante ...]   (desde la raíz del repo; restaura cada archivo al terminar)."""
import subprocess, sys, pathlib
R = pathlib.Path(__file__).resolve().parents[2]
U = "modules/portal/backend/utils/importarUsuarios.js"
M = "modules/portal/backend/models/usuarioImportacion.model.js"
C = "modules/portal/backend/controllers/usuarioImportacion.controller.js"
RT = "modules/portal/backend/routes/usuario.routes.js"
UC = "modules/portal/backend/controllers/usuario.controller.js"
FU = "modules/portal/frontend/utils/importarUsuarios.js"
IA = "modules/portal/frontend/components/ImportadorArchivo.jsx"
SV = "modules/portal/backend/services/supabaseAdmin.service.js"
AC = "modules/portal/backend/controllers/auth.controller.js"
HF = "modules/portal/backend/utils/huellaVistaPrevia.js"
IF = "modules/portal/frontend/utils/importarFilas.js"
PRUEBAS = ["modules/portal", "modules/rh/tests/importarFechas.util.test.js"]
MUT = [
 ("dominio: acepta cualquier dominio que termine igual", U, 'partes[1] !== DOMINIO_PERMITIDO', '!partes[1].endsWith(DOMINIO_PERMITIDO)'),
 ("dominio: no valida el dominio", U, 'if (partes[1] !== DOMINIO_PERMITIDO) return', 'if (false) return'),
 ("nómina ambigua elige al primero", U, 'if (candidatos.length > 1) return', 'if (candidatos.length > 99) return'),
 ("empleado no activo se acepta", U, 'if (String(empleado.estatus || "activo") !== "activo") return', 'if (false) return'),
 ("empleado con cuenta se pisa", U, 'if (empleado.usuario_id !== null && empleado.usuario_id !== undefined) return', 'if (false) return'),
 ("CURP inválida se degrada a vacía", U, 'if (perdioPrecision.has("curp") || !CURP_RE.test(curp)) return { error: "CURP inválida: no se puede identificar al empleado" };', ''),
 ("sin identificador se acepta", U, 'if (!curp && !nomina) return', 'if (false) return'),
 ("repetidos del archivo no se detectan", U, 'if (vistos[tipo].has(valor)) {', 'if (false) {'),
 ("CURP y nómina contradictorias se aceptan", U, 'if (!candidatos.some((e) => e.id === empleado.id)) return', 'if (false) return'),
 ("tope de 200 filas sube a 2000", U, 'const MAX_FILAS_IMPORTAR_USUARIOS = 200;', 'const MAX_FILAS_IMPORTAR_USUARIOS = 2000;'),
 ("correo existente con auth deja de omitirse", M, 'if (previo.conAuth) return { ...base, estado: "omitir"', 'if (!previo.conAuth) return { ...base, estado: "omitir"'),
 ("la cuenta queda inactiva", M, 'SET auth_uid = $2, activo = true', 'SET auth_uid = $2, activo = false'),
 ("el rol sale de un id fijo", M, '[usuarioId, rolId]', '[usuarioId, 1]'),
 ("no se borra la reserva tras un rechazo 4xx de GoTrue", M, 'await borrarFilaLocal(usuarioId);\n        } catch (e2) {', '\n        } catch (e2) {'),
 ("todo error de GoTrue se trata como definitivo (se borra)", M, 'if (e && e.definitivo === true) {', 'if (true) {'),
 ("no se borra la cuenta de GoTrue si falla el vínculo", M, 'await servicio.eliminarUsuario(authUid);', ''),
 ("se envía contraseña a GoTrue", M, 'servicio.crearUsuario({ correo: p.fila.correo,', 'servicio.crearUsuario({ password: "x", correo: p.fila.correo,'),
 ("sin tope de una importación simultánea", M, 'if (enEjecucion >= 1) throw', 'if (enEjecucion >= 99) throw'),
 ("sin corte tras GoTrue caído", M, 'const MAX_INCIERTOS_SEGUIDOS = 3;', 'const MAX_INCIERTOS_SEGUIDOS = 99;'),
 ("el vínculo no pasa por empleadoCuenta (no se vincula)", M, 'const vinculo = await EmpleadoCuenta.vincularEnTransaccion(cliente,', 'const vinculo = { detalle: [{ resultado: "vinculada" }] } || await EmpleadoCuenta.vincularEnTransaccion(cliente,'),
 ("no se toma el candado 4701", M, 'await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_IMPORTAR_USUARIOS, CLAVE_IMPORTAR_USUARIOS]);', ''),
 ("la vista previa no pide el rol", M, 'async vistaPrevia(preparadas, usuarioActorId = null) {\n    await obtenerRolImportado(grupo);', 'async vistaPrevia(preparadas, usuarioActorId = null) {'),
 ("5xx/408/429 se tratan como definitivos", SV, 'if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) e.definitivo = true;', 'if (true) e.definitivo = true;'),
 ("2xx sin id de GoTrue se acepta", SV, 'if (!datos || typeof datos.id !== "string" || !datos.id) {', 'if (false) {'),
 ("la huella de vista previa no se exige", C, 'f.fila && !huellaValida(', 'f.fila && false && !huellaValida('),
 ("la huella no caduca", HF, 'vence < ahora ||', 'false ||'),
 ("se adopta una cuenta sin la marca de importación", M, 'origen !== ORIGEN_IMPORTACION ||', 'false ||'),
 ("se adopta una cuenta que ya usa otra fila local", M, 'if (dueno.rows.length > 0) return', 'if (false) return'),
 ("el vínculo no se comprueba antes del COMMIT", M, 'if (!vinculo.detalle.length || vinculo.detalle[0].resultado !== "vinculada") throw', 'if (false) throw'),
 ("un error de COMMIT no se marca incierto", M, 'e.enCommit = true;', ''),
 ("cambiar-password acepta cuentas ms365", AC, 'if (usuario.auth_tipo !== "local") {', 'if (false) {'),
 ("el CSV no neutraliza fórmulas tras espacios", IF, "/^[ \\t\\r\\n]*[=+\\-@]/.test(s)", "/^[=+\\-@]/.test(s)"),
 ("la adopción lee user_metadata (editable por el usuario)", M, 'hallado.app_metadata && hallado.app_metadata.origen', 'hallado.user_metadata && hallado.user_metadata.origen'),
 ("los flujos de usuarios dejan de compensar un 5xx", "modules/portal/backend/services/delegacionPermisos.js", 'errorExterno.definitivo === true || errorExterno.conRespuestaHttp === true', 'errorExterno.definitivo === true'),
 ("la huella usa el secreto crudo", HF, '.update(ETIQUETA).digest();', '.update("").digest();'),
 ("el alias con + ya no se avisa", M, 'U.tieneAlias(p.fila.correo) ? [AVISO_ALIAS] : []', '[]'),
 ("se aplica sin confirmar", C, 'if (cuerpo.confirmar !== true) {', 'if (false) {'),
 ("la auditoría incluye correos", C, 'usuarios_creados: r.filas', 'correos: r.filas.map((f) => f.nombre), usuarios_creados: r.filas'),
 ("cualquier rol puede importar", RT, 'if (!esSuperAdmin(req.user)) {', 'if (false) {'),
 ("PUT acepta contraseña en ms365", UC, 'if (actual.auth_tipo !== "local") {', 'if (false) {'),
 ("el botón lo ve cualquiera", FU, "if (!usuario) return false;\n  return usuario.rol_nombre", "if (!usuario) return false;\n  return true || usuario.rol_nombre"),
 ("el botón de aplicar existe sin vista previa del servidor", IA, "{verificar && !verificacion ? (", "{false ? ("),
]
base = subprocess.run(["npx", "jest", *PRUEBAS], cwd=R, capture_output=True, text=True)
if base.returncode != 0:
    print("las pruebas base ya fallan; no tiene sentido mutar"); sys.exit(2)
vivos = []
SOLO = sys.argv[1:]
if SOLO: MUT = [m for m in MUT if any(t in m[0] for t in SOLO)]
for nombre, ruta, a, b in MUT:
    p = R / ruta
    original = p.read_text(encoding="utf-8")
    if a not in original:
        print(f"NO APLICA  {nombre}"); vivos.append(nombre + " (no aplica)"); continue
    try:
        p.write_text(original.replace(a, b, 1), encoding="utf-8")
        r = subprocess.run(["npx", "jest", *PRUEBAS], cwd=R, capture_output=True, text=True)
    finally:
        p.write_text(original, encoding="utf-8")
    muerto = r.returncode != 0
    print(("MATADO    " if muerto else "SOBREVIVE ") + nombre)
    if not muerto: vivos.append(nombre)
print(f"\n{len(MUT) - len(vivos)}/{len(MUT)} mutantes matados" + (f"; sobreviven: {vivos}" if vivos else ""))
