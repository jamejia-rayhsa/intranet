import CrudPage from "../components/CrudPage";

export default function DepartamentosPage() {
  return (
    <CrudPage
      titulo="Gestión de Departamentos"
      apiRuta="/departamentos"
      entidad="departamento"
      columnas={[
        { key: "nombre", label: "Nombre" },
        { key: "descripcion", label: "Descripción" },
      ]}
      camposFormulario={[
        { name: "nombre", label: "Nombre", required: true },
        { name: "descripcion", label: "Descripción", tipo: "textarea" },
      ]}
    />
  );
}
