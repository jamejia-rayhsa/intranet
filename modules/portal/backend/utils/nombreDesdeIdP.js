// Obtiene nombre y apellidos a partir de los datos que entrega el proveedor de identidad (Microsoft).
//
// Microsoft entrega el nombre completo en un solo campo (`name`); `given_name`/`family_name` solo
// llegan si el administrador de Entra configura reclamaciones opcionales. Cuando no hay forma
// fiable de separarlos se aplica la convención habitual en México: los DOS ÚLTIMOS elementos son
// los apellidos y el resto el nombre ("Juan Carlos Perez Lopez" -> "Juan Carlos" / "Perez
// Lopez"). Las partículas ("de", "del", "la", "los", "y", "san"...) se pegan al apellido que
// las sigue ("Juan de la Cruz Lopez" -> "Juan" / "de la Cruz Lopez"). No es perfecto: un
// administrador puede corregirlo luego desde el panel y esa corrección ya no se pisa.
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "san", "santa"]);
const MAXIMO = 100; // longitud de usuarios.nombre / usuarios.apellido

function limpiar(texto) {
  return String(texto || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function separarNombreCompleto(completo) {
  const tokens = limpiar(completo).split(" ").filter(Boolean);
  if (tokens.length < 2) return null;

  // Inicio del grupo de apellido que termina justo antes de `fin` (incluye las partículas previas).
  // `i > 1` garantiza que siempre quede al menos un elemento para el nombre.
  const inicioApellido = (fin) => {
    let i = fin - 1;
    while (i > 1 && PARTICULAS.has(tokens[i - 1].toLowerCase())) i--;
    return i;
  };

  let inicio = inicioApellido(tokens.length); // último apellido
  if (inicio > 1) {
    const inicioPrevio = inicioApellido(inicio); // penúltimo apellido (deja >= 1 elemento de nombre)
    if (inicioPrevio >= 1) inicio = inicioPrevio;
  }
  return {
    nombre: tokens.slice(0, inicio).join(" ").slice(0, MAXIMO),
    apellido: tokens.slice(inicio).join(" ").slice(0, MAXIMO),
  };
}

/**
 * Devuelve { nombre, apellido } si los claims del token traen un nombre utilizable, o null.
 * Los claims de un token de GoTrue llevan los datos del proveedor en `user_metadata`.
 */
function nombreDesdeClaims(claims) {
  const meta = (claims && claims.user_metadata) || {};
  const correo = String(claims && claims.email ? claims.email : "").toLowerCase();

  const nombre = limpiar(meta.given_name);
  const apellido = limpiar(meta.family_name);
  if (nombre && apellido && !nombre.includes("@")) {
    return { nombre: nombre.slice(0, MAXIMO), apellido: apellido.slice(0, MAXIMO) };
  }

  const completo = limpiar(meta.full_name || meta.name);
  // Descarta valores que no son un nombre (el correo, o cualquier cosa con "@")
  if (!completo || completo.includes("@") || completo.toLowerCase() === correo) return null;
  return separarNombreCompleto(completo);
}

module.exports = { separarNombreCompleto, nombreDesdeClaims };
