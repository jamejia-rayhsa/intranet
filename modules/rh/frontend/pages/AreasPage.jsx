import CrudPage from "../components/CrudPage";

export default function AreasPage() {
  return (
    <CrudPage
      titulo="Gestión de Áreas"
      apiRuta="/areas"
      columnas={[
        { key: "nombre", label: "Nombre" },
        { key: "descripcion", label: "Descripción" },
      ]}
      camposFormulario={[
        { name: "nombre", label: "Nombre", required: true },
        { name: "descripcion", label: "Descripción", tipo: "textarea" },
      ]}
      importadorConfig={{
        titulo: "Importar catálogo de áreas",
        columnas: [
          { clave: "nombre", etiqueta: "Nombre", requerido: true },
          { clave: "descripcion", etiqueta: "Descripción", requerido: false },
        ],
        filasEjemplo: [
          { nombre: "Administración", descripcion: "Dirección, finanzas y recursos humanos" },
          { nombre: "Operaciones", descripcion: "Logística, producción y mantenimiento" },
          { nombre: "Comercial", descripcion: "Ventas, mercadotecnia y atención a clientes" },
          { nombre: "Tecnología", descripcion: "Sistemas, desarrollo e infraestructura" },
        ],
        nombreArchivo: "plantilla_areas.csv",
        rutaImportar: "/areas/importar",
      }}
    />
  );
}
