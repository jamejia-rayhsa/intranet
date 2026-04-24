import { useLocation, Link } from "react-router-dom";

const enlacesRH = [
  { path: "/rh", label: "Empleados" },
  { path: "/rh/puestos", label: "Puestos" },
  { path: "/rh/departamentos", label: "Departamentos" },
  { path: "/rh/ubicaciones", label: "Ubicaciones" },
];

export default function RHSubMenu() {
  const location = useLocation();

  return (
    <nav className="rh-submenu">
      {enlacesRH.map((enlace) => (
        <Link
          key={enlace.path}
          to={enlace.path}
          className={location.pathname === enlace.path ? "activo" : ""}
        >
          {enlace.label}
        </Link>
      ))}
    </nav>
  );
}
