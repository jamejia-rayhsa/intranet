const CHECKLIST = [
  { tipo: "curriculum_vitae",    etiqueta: "Curriculum Vitae",                        requeridos: 1 },
  { tipo: "ine",                 etiqueta: "Identificación Oficial (INE / Pasaporte)", requeridos: 1 },
  { tipo: "acta_nacimiento",     etiqueta: "Acta de Nacimiento",                       requeridos: 1 },
  { tipo: "rfc",                 etiqueta: "RFC",                                      requeridos: 1 },
  { tipo: "nss",                 etiqueta: "Número de Seguridad Social",               requeridos: 1 },
  { tipo: "curp",                etiqueta: "CURP",                                     requeridos: 1 },
  { tipo: "comprobante_domicilio", etiqueta: "Comprobante de Domicilio",               requeridos: 1 },
  { tipo: "constancia_fiscal",   etiqueta: "Constancia de Situación Fiscal",           requeridos: 1 },
  { tipo: "constancia_estudios", etiqueta: "Constancia de Estudio / Cédula Profesional", requeridos: 1 },
  { tipo: "carta_recomendacion", etiqueta: "Carta de Recomendación",                  requeridos: 2 },
  { tipo: "certificado_medico",  etiqueta: "Certificado Médico",                       requeridos: 1 },
  { tipo: "estado_cuenta",       etiqueta: "Estado de Cuenta Bancario (Para Depósitos)", requeridos: 1 },
  { tipo: "otro",                etiqueta: "Otros",                                    requeridos: 0 },
];

const ETIQUETAS_TIPO = {
  curriculum_vitae:    "Curriculum Vitae",
  ine:                 "Identificación Oficial",
  acta_nacimiento:     "Acta de Nacimiento",
  rfc:                 "RFC",
  nss:                 "NSS",
  curp:                "CURP",
  comprobante_domicilio: "Comprobante de Domicilio",
  constancia_fiscal:   "Constancia Fiscal",
  constancia_estudios: "Constancia de Estudios",
  carta_recomendacion: "Carta de Recomendación",
  certificado_medico:  "Certificado Médico",
  estado_cuenta:       "Estado de Cuenta",
  otro:                "Otro",
};

export default function ChecklistDocumentos({ documentos, onEliminar }) {
  // Agrupar documentos por tipo
  const porTipo = {};
  for (const doc of documentos) {
    if (!porTipo[doc.tipo_documento]) porTipo[doc.tipo_documento] = [];
    porTipo[doc.tipo_documento].push(doc);
  }

  const completos = CHECKLIST.filter((item) => {
    if (item.requeridos === 0) return false;
    return (porTipo[item.tipo]?.length || 0) >= item.requeridos;
  }).length;

  const requeridos = CHECKLIST.filter((i) => i.requeridos > 0).length;

  return (
    <div className="checklist-docs">
      {/* Barra de progreso */}
      <div className="checklist-progreso">
        <div className="progreso-texto">
          <span>{completos} de {requeridos} documentos completos</span>
          <span className="progreso-pct">{Math.round((completos / requeridos) * 100)}%</span>
        </div>
        <div className="progreso-barra">
          <div
            className="progreso-relleno"
            style={{ width: `${(completos / requeridos) * 100}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="checklist-lista">
        {CHECKLIST.map((item) => {
          const docs = porTipo[item.tipo] || [];
          const cantidad = docs.length;
          const requerido = item.requeridos;
          const completo = requerido === 0 ? cantidad > 0 : cantidad >= requerido;
          const esOpcional = requerido === 0;

          return (
            <div
              key={item.tipo}
              className={`checklist-item ${completo ? "completo" : esOpcional ? "opcional" : "faltante"}`}
            >
              <div className="checklist-item-info">
                <span className="checklist-icono">
                  {completo ? "✓" : esOpcional ? "·" : "✗"}
                </span>
                <span className="checklist-etiqueta">{item.etiqueta}</span>
                {requerido > 1 && (
                  <span className="checklist-contador">
                    {cantidad}/{requerido}
                  </span>
                )}
              </div>

              {/* Documentos adjuntos para este tipo */}
              {docs.length > 0 && (
                <div className="checklist-adjuntos">
                  {docs.map((doc) => (
                    <div key={doc.id} className="checklist-adjunto">
                      <span className="adjunto-nombre">
                        📄 {doc.nombre_archivo || doc.descripcion || "Archivo"}
                      </span>
                      <span className="adjunto-fecha">
                        {new Date(doc.fecha_subida).toLocaleDateString("es-MX")}
                      </span>
                      <button
                        className="adjunto-eliminar"
                        onClick={() => onEliminar(doc.id)}
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Badge de estado */}
              {!esOpcional && (
                <span className={`checklist-badge ${completo ? "badge-ok" : "badge-falta"}`}>
                  {completo ? "Completo" : "Falta"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
