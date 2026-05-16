import { useState, useEffect } from "react";
import { obtenerAreas } from "../services/areas.service";
import CrudPage from "../components/CrudPage";

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
        { name: "descripcion", label: "Descripción", tipo: "textarea" },
      ]}
      importadorConfig={{
        titulo: "Importar catálogo de departamentos",
        columnas: [
          { clave: "nombre", etiqueta: "Nombre", requerido: true },
          { clave: "area", etiqueta: "Área", requerido: false },
          { clave: "descripcion", etiqueta: "Descripción", requerido: false },
        ],
        filasEjemplo: [
          { nombre: "Contabilidad", area: "Administración", descripcion: "Gestión financiera y contable" },
          { nombre: "Logística", area: "Operaciones", descripcion: "Distribución y almacén" },
          { nombre: "Ventas", area: "Comercial", descripcion: "Atención y cierre de ventas" },
          { nombre: "Desarrollo", area: "Tecnología", descripcion: "Construcción y mantenimiento de sistemas" },
        ],
        nombreArchivo: "plantilla_departamentos.csv",
        rutaImportar: "/departamentos/importar",
      }}
    />
  );
}
