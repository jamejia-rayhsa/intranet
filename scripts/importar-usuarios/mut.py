#!/usr/bin/env python3
"""Mutación manual de las reglas de 'Importar usuarios': cada mutante rompe UNA regla y las pruebas jest deben fallar.
Uso: python3 scripts/importar-usuarios/mut.py   (desde la raíz del repo; restaura cada archivo al terminar)."""
import subprocess, sys, pathlib
R = pathlib.Path(__file__).resolve().parents[2]
U = "modules/portal/backend/utils/importarUsuarios.js"
M = "modules/portal/backend/models/usuarioImportacion.model.js"
C = "modules/portal/backend/controllers/usuarioImportacion.controller.js"
RT = "modules/portal/backend/routes/usuario.routes.js"
UC = "modules/portal/backend/controllers/usuario.controller.js"
FU = "modules/portal/frontend/utils/importarUsuarios.js"
IA = "modules/portal/frontend/components/ImportadorArchivo.jsx"
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
 ("correo existente con auth se vuelve error", M, 'return previo.conAuth\n        ? { ...base, estado: "omitir"', 'return !previo.conAuth\n        ? { ...base, estado: "omitir"'),
 ("la cuenta queda inactiva", M, 'SET auth_uid = $2, activo = true', 'SET auth_uid = $2, activo = false'),
 ("el rol sale de un id fijo", M, '[usuarioId, rolId]', '[usuarioId, 1]'),
 ("no se borra la reserva tras un error definitivo de GoTrue", M, '      await borrarFilaLocal(usuarioId);\n    } catch (e2) {', '    } catch (e2) {'),
 ("un timeout se trata como definitivo (se compensa)", M, 'if (e && e.incierto) {', 'if (false) {'),
 ("no se borra la cuenta de GoTrue si falla el vínculo", M, 'await servicio.eliminarUsuario(authUid);', ''),
 ("se envía contraseña a GoTrue", M, 'servicio.crearUsuario({ correo: p.fila.correo,', 'servicio.crearUsuario({ password: "x", correo: p.fila.correo,'),
 ("sin tope de una importación simultánea", M, 'if (enEjecucion >= 1) throw', 'if (enEjecucion >= 99) throw'),
 ("sin corte tras GoTrue caído", M, 'const MAX_INCIERTOS_SEGUIDOS = 3;', 'const MAX_INCIERTOS_SEGUIDOS = 99;'),
 ("el vínculo no pasa por empleadoCuenta (no se vincula)", M, 'return EmpleadoCuenta.vincularEnTransaccion(', 'return ({ detalle: [{ resultado: "vinculada" }] }) || EmpleadoCuenta.vincularEnTransaccion('),
 ("no se toma el candado 4701", M, 'await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ESPACIO_IMPORTAR_USUARIOS, CLAVE_IMPORTAR_USUARIOS]);', ''),
 ("la vista previa no pide el rol", M, 'async vistaPrevia(preparadas) {\n    await obtenerRolImportado(grupo);', 'async vistaPrevia(preparadas) {'),
 ("se aplica sin confirmar", C, 'if (cuerpo.confirmar !== true) {', 'if (false) {'),
 ("la auditoría incluye correos", C, 'usuarios_creados: r.filas', 'correos: r.filas.map((f) => f.nombre), usuarios_creados: r.filas'),
 ("cualquier rol puede importar", RT, 'if (!esSuperAdmin(req.user)) {', 'if (false) {'),
 ("PUT acepta contraseña en ms365", UC, 'if (actual.auth_tipo !== "local") {', 'if (false) {'),
 ("el botón lo ve cualquiera", FU, "if (!usuario) return false;\n  return usuario.rol_nombre", "if (!usuario) return false;\n  return true || usuario.rol_nombre"),
 ("el botón de aplicar existe sin vista previa del servidor", IA, "{verificar && !verificacion ? (", "{false ? ("),
]
base = subprocess.run(["npx", "jest", "modules/portal", "modules/rh/tests/importarFechas.util.test.js"], cwd=R, capture_output=True, text=True)
if base.returncode != 0:
    print("las pruebas base ya fallan; no tiene sentido mutar"); sys.exit(2)
vivos = []
for nombre, ruta, a, b in MUT:
    p = R / ruta
    original = p.read_text(encoding="utf-8")
    if a not in original:
        print(f"NO APLICA  {nombre}"); vivos.append(nombre + " (no aplica)"); continue
    try:
        p.write_text(original.replace(a, b, 1), encoding="utf-8")
        r = subprocess.run(["npx", "jest", "modules/portal"], cwd=R, capture_output=True, text=True)
    finally:
        p.write_text(original, encoding="utf-8")
    muerto = r.returncode != 0
    print(("MATADO    " if muerto else "SOBREVIVE ") + nombre)
    if not muerto: vivos.append(nombre)
print(f"\n{len(MUT) - len(vivos)}/{len(MUT)} mutantes matados" + (f"; sobreviven: {vivos}" if vivos else ""))
