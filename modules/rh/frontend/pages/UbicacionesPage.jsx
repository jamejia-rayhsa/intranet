import CrudPage from "../components/CrudPage";

export default function UbicacionesPage() {
  return (
    <CrudPage
      titulo="Gestión de Ubicaciones"
      apiRuta="/ubicaciones"
      entidad="ubicacion"
      columnas={[
        { key: "nombre", label: "Nombre" },
        { key: "ciudad", label: "Ciudad" },
        { key: "estado", label: "Estado" },
        { key: "codigo_postal", label: "C.P." },
      ]}
      camposFormulario={[
        { name: "nombre", label: "Nombre", required: true },
        { name: "direccion", label: "Dirección" },
        { name: "ciudad", label: "Ciudad" },
        { name: "estado", label: "Estado" },
        { name: "codigo_postal", label: "Código Postal" },
        { name: "telefono", label: "Teléfono" },
      ]}
    />
  );
}
