/**
 * Configuración de permisos del módulo Portal
 * Define todos los permisos disponibles para el portal central.
 */

const PERMISOS_PORTAL = {
  // Permisos de visualización
  VER_PORTAL: 'portal.view',
  CREAR_NOTICIAS: 'portal.crear-noticias',

  // Permisos de administración
  ADMIN_PORTAL: 'portal.admin',
};

/**
 * Permisos requeridos por cada ruta del portal
 */
const PERMISOS_POR_RUTA = {
  // Autenticación (el login/registro lo gestiona Supabase Auth)
  'GET /api/auth/perfil': [],
  'POST /api/auth/cambiar-password': [],

  // Módulos
  'GET /api/modulos/activos': [PERMISOS_PORTAL.VER_PORTAL],
  'GET /api/modulos': [PERMISOS_PORTAL.VER_PORTAL, PERMISOS_PORTAL.ADMIN_PORTAL],
  'POST /api/modulos': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'PUT /api/modulos/:id': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'DELETE /api/modulos/:id': [PERMISOS_PORTAL.ADMIN_PORTAL],

  // Roles
  'GET /api/roles': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'POST /api/roles': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'PUT /api/roles/:id': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'DELETE /api/roles/:id': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'PUT /api/roles/:id/permisos': [PERMISOS_PORTAL.ADMIN_PORTAL],

  // Permisos
  'GET /api/permisos': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'POST /api/permisos': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'PUT /api/permisos/:id': [PERMISOS_PORTAL.ADMIN_PORTAL],
  'DELETE /api/permisos/:id': [PERMISOS_PORTAL.ADMIN_PORTAL],

  // Noticias
  'GET /api/noticias/publicadas': [],
  'GET /api/noticias/:id': [],
  'GET /api/noticias': [PERMISOS_PORTAL.VER_PORTAL, PERMISOS_PORTAL.ADMIN_PORTAL],
  'POST /api/noticias': [PERMISOS_PORTAL.ADMIN_PORTAL, PERMISOS_PORTAL.CREAR_NOTICIAS],
  'PUT /api/noticias/:id': [PERMISOS_PORTAL.ADMIN_PORTAL, PERMISOS_PORTAL.CREAR_NOTICIAS],
  'DELETE /api/noticias/:id': [PERMISOS_PORTAL.ADMIN_PORTAL],
};

module.exports = {
  PERMISOS_PORTAL,
  PERMISOS_POR_RUTA,
};
