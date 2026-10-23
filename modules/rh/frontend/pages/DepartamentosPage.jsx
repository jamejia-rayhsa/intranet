import { useState, useEffect } from "react";
import { obtenerAreas } from "../services/areas.service";
import CrudPage from "../components/CrudPage";
import { solicitar } from "../../../portal/frontend/utils/api";
import {
  COLUMNAS_DEPARTAMENTOS, FILAS_EJEMPLO_DEPARTAMENTOS, hojasPlantillaDepartamentos,
} from "../constants/importacionDepartamentos";
import { descargarLibro } from "../utils/libroXlsx";

// Turnos activos con su detalle por día (para el horario resumido de la hoja "Catálogos"). Requiere Asistencia:consulta;
// si falta o falla, la hoja sale sin turnos.
async function obtenerTurnosConDetalle() {
  try {
    const lista = await solicitar("/asistencia/turnos");
    if (!lista.exito) return [];
    const activos = lista.datos.filter((t) => t.activo);
    return await Promise.all(activos.map(async (t) => {
      try {
        const d = await solicitar(`/asistencia/turnos/${t.id}`);
        return d.exito ? d.datos : t;
      } catch {
        return t;
      }
    }));
  } catch {
    return [];
  }
}

export default function DepartamentosPage() {
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    obtenerAreas()
      .then(r => { if (r.exito) setAreas(r.datos); })
      .catch(() => {});
  }, []);

  return (
    <CrudPage
      titulo="Gestión de Departamentos"
      apiRuta="/departamentos"
      columnas={[
        { key: "nombre", label: "Nombre" },
        { key: "area_nombre", label: "Área" },
        { key: "cupo_vacaciones", label: "Cupo de vacaciones" },
        { key: "turno_actual", label: "Turno actual" },
        { key: "descripcion", label: "Descripción" },
      ]}
      camposFormulario={[
        { name: "nombre", label: "Nombre", required: true },
        {
          name: "area_id",
          label: "Área",
          tipo: "select",
          opciones: areas.map(a => ({ value: a.id, label: a.nombre })),
        },
        {
          name: "cupo_vacaciones",
          label: "Cupo de vacaciones (personas a la vez)",
          tipo: "number",
          required: true,
          min: 1,
          step: 1,
          defecto: 1,
        },
        { name: "descripcion", label: "Descripción", tipo: "textarea" },
      ]}
      importadorConfig={{
        titulo: "Importar catálogo de departamentos",
        columnas: COLUMNAS_DEPARTAMENTOS,
        filasEjemplo: FILAS_EJEMPLO_DEPARTAMENTOS,
        nombreArchivo: "plantilla_departamentos.csv",
        rutaImportar: "/departamentos/importar",
        permiteActualizar: true,
        textosModo: {
          titulo: "Qué hacer con los departamentos que ya existen",
          ayuda: "Se buscan por nombre (sin acentos ni mayúsculas). Solo las celdas con valor sobrescriben: una celda vacía nunca borra datos.",
        },
        accionesDescarga: [
          {
            etiqueta: "⬇ Descargar plantilla (.xlsx)",
            onClick: async () => {
              const turnos = await obtenerTurnosConDetalle();
              descargarLibro("plantilla_departamentos.xlsx", hojasPlantillaDepartamentos({ turnos, areas }), {
                Departamentos: [28, 22, 40, 20, 20, 22], Instrucciones: [140], "Catálogos": [30, 40, 30],
              });
            },
          },
        ],
      }}
    />
  );
}
