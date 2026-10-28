import subprocess, shutil, sys
import os
WT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),"..",".."))
M="modules/rh/backend/models/empleadoCuenta.model.js"
I="modules/rh/backend/models/empleado.model.js"
U="modules/rh/backend/utils/vincularCuentas.js"
F="modules/rh/frontend/utils/cuentasEmpleado.js"
C="modules/rh/backend/controllers/empleadoCuenta.controller.js"
muts=[
 (M,'cliente.release(rollbackFallo || undefined);','cliente.release();',"modelo: release sin error tras ROLLBACK fallido"),
 (M,'if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_BLOQUEO_FILAS);','if (e && e.code === "55P03") throw new ErrorVinculacion(409, MENSAJE_EN_CURSO);',"modelo: mensaje de filas bloqueadas"),
 (M,'if (enEjecucion >= MAX_VINCULACIONES_SIMULTANEAS) throw','if (false) throw',"modelo: tope de ejecuciones simultáneas"),
 (M,'else if (e.estatus !== "activo") motivo = "empleado_no_activo";','else if (e.estatus === "baja") motivo = "empleado_no_activo";',"modelo: suspendidos se vinculan"),
 (M,'else if (c.correo_duplicado) motivo = "cuenta_correo_duplicado";','',"modelo: correo duplicado entre cuentas"),
 (M,'if (busqueda.length < MIN_BUSQUEDA) {','if (false) {',"modelo: búsqueda mínima del selector"),
 (M,"COALESCE(e.estatus, 'activo') = 'activo'\n         ORDER BY e.nombre","COALESCE(e.estatus, 'activo') <> 'baja'\n         ORDER BY e.nombre","modelo: vista previa sugiere suspendidos"),
 (I,'if (validas.some((v) => v.fila.correo_cuenta)) {','if (false) {',"import: candado 4601"),
 (I,'if (cuenta.ambigua || cuenta.correo_duplicado) {','if (false) {',"import: correo ambiguo"),
 (I,'if (estatusEmpleado && estatusEmpleado !== "activo") {','if (estatusEmpleado === "baja") {',"import: suspendidos"),
 (F,'if (c.privilegiada) { omitidas.privilegiadas++; continue; }','',"front: atajo marca privilegiadas"),
 (F,'if (c.correo_duplicado) { omitidas.duplicadas++; continue; }','',"front: atajo marca correos duplicados"),
 (U,'.replace(/n\\u0303/g, "ñ")','',"util: la ñ se normaliza a n"),
 (C,'if (Object.keys(motivos).length === 0) motivos.otra_operacion_en_curso = 1;','',"ctrl: rechazo 'en curso' sin motivo"),
 (M,'else if (e.usuario_id !== null) motivo = "empleado_ya_vinculado";','',"modelo: pisa vínculo del empleado"),
 (M,'else if (duenos.has(p.usuario_id)) motivo = "cuenta_ya_vinculada";','',"modelo: cuenta a dos empleados"),
 (M,'if (privilegiadas.length && !confirmarPrivilegiadas)','if (false)',"modelo: privilegiadas sin confirmar"),
 (M,'if (r.rowCount !== 1) throw','if (false) throw',"modelo: rowCount del UPDATE"),
 (M,'if (e.usuario_id === p.usuario_id) { trabajo.push','if (false) { trabajo.push',"modelo: idempotencia"),
 (M,"[ESPACIO_VINCULACION, CLAVE_VINCULACION]);\n      } catch","[1, 1]);\n      } catch","modelo: clave del candado"),
 (I,'if (dueno) { error(cruda, fila, "Esa cuenta ya está vinculada a OTRO empleado; no se vinculó"); continue; }','',"import: cuenta de otro empleado"),
 (I,'if (actualId !== null && actualId !== undefined) {','if (false) {',"import: pisa otra cuenta del empleado"),
 (I,'if (cuenta.privilegiada) {','if (false) {',"import: privilegiadas"),
 (I,'if (!cuenta) { error','if (false) { error',"import: cuenta inexistente"),
 (I,'if (!(destino && actualId === cuenta.id)) {','if (true) {',"import: idempotencia del vínculo existente"),
 (U,'(ap === e.paterno || ap.startsWith(`${e.paterno} `))','(ap === e.paterno)',"util: apellido con materno"),
 (U,'if (ids.length < 2) continue;','continue;',"util: dos cuentas, un empleado"),
 (U,'if (cuentas.has(usuario_id)) return','if (false) return',"util: cuenta repetida en el lote"),
 (U,'const finos = candidatos.filter((e) => e.tieneMaterno && ap === e.completo);','const finos = [];',"util: desempate por materno"),
 (C,'if (cuerpo.confirmar !== true) {','if (false) {',"ctrl: confirmación explícita"),
 (C,'confirmarPrivilegiadas: cuerpo.confirmar_privilegiadas === true','confirmarPrivilegiadas: Boolean(cuerpo.confirmar_privilegiadas)',"ctrl: confirmar_privilegiadas estricto"),
]
mat=0
for f,a,b,n in muts:
    p=f"{WT}/{f}"; s=open(p).read()
    if a not in s: print("NO APLICA:",n); continue
    open(p,'w').write(s.replace(a,b,1))
    r=subprocess.run("npx jest modules/rh/backend/tests/empleadoCuenta modules/rh/backend/tests/importarCuentas modules/rh/tests/vincularCuentas modules/rh/tests/cuentasEmpleado --testPathIgnorePatterns '/.claude/worktrees/'",shell=True,cwd=WT,capture_output=True,text=True)
    out=r.stdout+r.stderr
    muerto = ("failed" in out.split("Tests:")[-1] and "Tests:" in out) and "Test suite failed to run" not in out
    open(p,'w').write(s)
    print(("MATADO   " if muerto else "SOBREVIVE ")+n)
    if muerto: mat+=1
print(mat,"/",len(muts))
