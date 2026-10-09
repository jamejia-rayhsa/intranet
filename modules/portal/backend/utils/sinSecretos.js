// Quita campos internos (hash e identificador de GoTrue) antes de responder al cliente
function sinSecretos(usuario) {
  if (!usuario) return usuario;
  const { hash_password, auth_uid, ...resto } = usuario; // eslint-disable-line no-unused-vars
  return resto;
}

module.exports = sinSecretos;
