const { separarNombreCompleto, nombreDesdeClaims } = require('../utils/nombreDesdeIdP');

describe('separarNombreCompleto', () => {
  it.each([
    ['Juan Carlos Perez Lopez', 'Juan Carlos', 'Perez Lopez'],
    ['Juan Perez', 'Juan', 'Perez'],
    ['Juan Perez Lopez', 'Juan', 'Perez Lopez'],
    ['Maria de la Luz Hernandez Lopez', 'Maria de la Luz', 'Hernandez Lopez'],
    ['Juan de la Cruz Lopez', 'Juan', 'de la Cruz Lopez'],
    ['Ana del Rio', 'Ana', 'del Rio'],
    ['  Luis   Garcia   Ruiz  ', 'Luis', 'Garcia Ruiz'],
  ])('separa "%s" en nombre "%s" y apellido "%s"', (completo, nombre, apellido) => {
    expect(separarNombreCompleto(completo)).toEqual({ nombre, apellido });
  });

  it('devuelve null con un solo elemento o vacío', () => {
    expect(separarNombreCompleto('Madonna')).toBeNull();
    expect(separarNombreCompleto('')).toBeNull();
    expect(separarNombreCompleto(undefined)).toBeNull();
  });

  it('no deja nunca el nombre vacío', () => {
    const r = separarNombreCompleto('de la Cruz');
    expect(r.nombre).toBeTruthy();
    expect(r.apellido).toBeTruthy();
  });

  it('elimina caracteres de marcado y recorta a 100 caracteres', () => {
    expect(separarNombreCompleto('Ana <b>Lopez</b> Ruiz')).toEqual({ nombre: 'Ana', apellido: 'bLopez/b Ruiz' });
    const largo = separarNombreCompleto(`${'A'.repeat(150)} ${'B'.repeat(150)}`);
    expect(largo.nombre).toHaveLength(100);
    expect(largo.apellido).toHaveLength(100);
  });
});

describe('nombreDesdeClaims', () => {
  it('usa full_name de user_metadata', () => {
    const claims = { email: 'a@b.com', user_metadata: { full_name: 'Juan Carlos Perez Lopez' } };
    expect(nombreDesdeClaims(claims)).toEqual({ nombre: 'Juan Carlos', apellido: 'Perez Lopez' });
  });

  it('usa name si no hay full_name', () => {
    expect(nombreDesdeClaims({ user_metadata: { name: 'Ana Lopez' } })).toEqual({ nombre: 'Ana', apellido: 'Lopez' });
  });

  it('prefiere given_name y family_name cuando vienen ambos', () => {
    const claims = { user_metadata: { given_name: 'Juan Carlos', family_name: 'Perez Lopez', name: 'otro nombre cualquiera' } };
    expect(nombreDesdeClaims(claims)).toEqual({ nombre: 'Juan Carlos', apellido: 'Perez Lopez' });
  });

  it('ignora un nombre que es el correo o contiene @', () => {
    expect(nombreDesdeClaims({ email: 'ana@rayhsa.com', user_metadata: { name: 'ana@rayhsa.com' } })).toBeNull();
    expect(nombreDesdeClaims({ user_metadata: { name: 'Ana Lopez ana@x.com' } })).toBeNull();
  });

  it('devuelve null sin datos del proveedor', () => {
    expect(nombreDesdeClaims({})).toBeNull();
    expect(nombreDesdeClaims(undefined)).toBeNull();
    expect(nombreDesdeClaims({ user_metadata: { nombre: 'Ana', apellido: 'P' } })).toBeNull();
  });
});
