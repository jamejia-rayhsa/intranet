// Catálogos del expediente de empleado para la importación masiva (copia en CommonJS de
// modules/rh/frontend/constants/catalogos.js: la prueba importarEmpleados.catalogos.test.js exige que no diverjan).
// Las comparaciones no distinguen acentos, mayúsculas ni signos; el valor guardado es siempre el nombre canónico.

const ESTADOS_MEXICO = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila de Zaragoza",
  "Colima", "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
  "México", "Michoacán de Ocampo", "Morelos", "Nayarit", "Nuevo León",
  "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala",
  "Veracruz de Ignacio de la Llave", "Yucatán", "Zacatecas",
];

const BANCOS_MEXICO = [
  "BBVA México", "Citibanamex", "HSBC México", "Santander México",
  "Banorte", "Scotiabank México", "Inbursa", "Banco Azteca", "BanBajío",
  "Afirme", "Bansí", "Multiva", "Banca Mifel", "CIBanco",
  "Intercam Banco", "Invex", "Ve por Más", "Banjército", "ABC Capital",
  "Consubanco", "Bankaool", "Pagatodo", "Otro",
];

const GENEROS = ["Masculino", "Femenino", "Otro"];
const ESTADOS_CIVILES = ["Soltero", "Casado", "Divorciado", "Separado", "Viudo", "Unión libre"];
const NIVELES_ESCOLARIDAD = [
  "Sin estudios", "Primaria", "Secundaria", "Preparatoria / Bachillerato",
  "Carrera técnica", "Licenciatura", "Maestría", "Doctorado",
];
const TIPOS_CONTRATO = ["Determinado", "Indeterminado", "Por obra", "Honorarios", "Confianza", "Prácticas"];
// Valores de empleados.estatus (el formulario de alta ofrece activo y suspendido; la baja la marca RH).
const ESTATUS_EMPLEADO = ["activo", "baja", "suspendido"];

// Clave de comparación: sin acentos, minúsculas, signos y espacios repetidos fuera.
function normalizarClave(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Alias frecuentes (clave normalizada -> valor canónico).
const ALIAS = {
  estados: {
    cdmx: "Ciudad de México", "distrito federal": "Ciudad de México", df: "Ciudad de México",
    "estado de mexico": "México", edomex: "México", "edo mex": "México",
    coahuila: "Coahuila de Zaragoza", michoacan: "Michoacán de Ocampo",
    veracruz: "Veracruz de Ignacio de la Llave",
  },
  bancos: {
    bbva: "BBVA México", "bbva bancomer": "BBVA México", bancomer: "BBVA México",
    banamex: "Citibanamex", "citi banamex": "Citibanamex", citi: "Citibanamex",
    hsbc: "HSBC México", santander: "Santander México", scotiabank: "Scotiabank México",
  },
  generos: { hombre: "Masculino", mujer: "Femenino" },
  estadosCiviles: {
    soltera: "Soltero", casada: "Casado", divorciada: "Divorciado", viuda: "Viudo", "union libre": "Unión libre",
  },
  escolaridad: {
    preparatoria: "Preparatoria / Bachillerato", bachillerato: "Preparatoria / Bachillerato",
    prepa: "Preparatoria / Bachillerato", tecnica: "Carrera técnica",
  },
  contratos: {
    "tiempo determinado": "Determinado", "tiempo indeterminado": "Indeterminado", indefinido: "Indeterminado",
  },
  estatus: {},
};

function construirIndice(lista, alias) {
  const indice = new Map();
  for (const canonico of lista) indice.set(normalizarClave(canonico), canonico);
  for (const [a, canonico] of Object.entries(alias || {})) {
    if (!indice.has(a)) indice.set(a, canonico);
  }
  return indice;
}

const INDICES = {
  estados: construirIndice(ESTADOS_MEXICO, ALIAS.estados),
  bancos: construirIndice(BANCOS_MEXICO, ALIAS.bancos),
  generos: construirIndice(GENEROS, ALIAS.generos),
  estadosCiviles: construirIndice(ESTADOS_CIVILES, ALIAS.estadosCiviles),
  escolaridad: construirIndice(NIVELES_ESCOLARIDAD, ALIAS.escolaridad),
  contratos: construirIndice(TIPOS_CONTRATO, ALIAS.contratos),
  estatus: construirIndice(ESTATUS_EMPLEADO, ALIAS.estatus),
};

// Devuelve el valor canónico o null si no pertenece al catálogo.
function canonico(catalogo, valor) {
  const clave = normalizarClave(valor);
  if (!clave) return null;
  return INDICES[catalogo].get(clave) || null;
}

module.exports = {
  ESTADOS_MEXICO,
  BANCOS_MEXICO,
  GENEROS,
  ESTADOS_CIVILES,
  NIVELES_ESCOLARIDAD,
  TIPOS_CONTRATO,
  ESTATUS_EMPLEADO,
  normalizarClave,
  canonico,
};
