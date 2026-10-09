-- ============================================================
-- Catálogos base: areas, departamentos, puestos, ubicaciones
-- Exportado desde dev el 2026-08-19
-- Uso en staging:
--   docker exec -i intranet_postgres_staging \
--     psql -U postgres -d intranet_staging < scripts/staging/seed-catalogos.sql
-- ============================================================

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);

-- ------------------------------------------------------------
-- Areas (4 registros)
-- ------------------------------------------------------------
INSERT INTO public.areas (id, nombre, descripcion, activo, fecha_creacion) VALUES
  (1, 'Administracion', 'Engloba las areas administrativas como contabilidad, cxc, cxp, etc', true, '2026-05-14 23:08:36.473697'),
  (2, 'Operaciones', 'Engloba compras, capital humano y almacen', true, '2026-05-14 23:09:16.139649'),
  (3, 'Comercial', 'Se integra por Ventas, atencion a clientes y sucursales', true, '2026-05-14 23:10:07.505344'),
  (4, 'Direccion', 'Integra areas como mercadotecnia, ti', true, '2026-05-14 23:11:12.351982')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Departamentos (4 registros)
-- ------------------------------------------------------------
INSERT INTO public.departamentos (id, nombre, descripcion, activo, fecha_creacion, area_id) VALUES
  (1, 'TI',               'Tecnologias de La informacion', true, '2026-04-27 20:08:41.750389', 4),
  (2, 'Contabilidad',     'Contabilidad',                  true, '2026-04-27 20:09:01.868273', 1),
  (3, 'Capital Humano',   'Area de Capital humano',        true, '2026-04-27 20:09:16.887479', 2),
  (4, 'Industria',        'Ventas a industrias',           true, '2026-04-27 20:09:51.690586', 3)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Puestos (5 registros)
-- ------------------------------------------------------------
INSERT INTO public.puestos (id, nombre, descripcion, departamento_id, nivel_salarial, activo, fecha_creacion) VALUES
  (1,  'Gerente',                    'Lider del area de TI,',                                                                         1, '$$$$$$', true, '2026-04-27 20:10:40.205315'),
  (6,  'Analista de Credito',        'Analista de cartera, gestion de pagos y clientes',                                              2, '$$$$',   true, '2026-04-29 14:06:18.30194'),
  (39, 'Analista de sistemas',       'Porporciona soporte a primer nivel en los aplicativos , hardaware y software de la empresa',     1, '$$$',    true, '2026-04-29 18:48:18.322897'),
  (40, 'Auxiliar de Recursos Humanos','Apoyo en lo relacionado a la administracion de los recursos humanos de la empresa',            3, '44',     true, '2026-04-29 19:04:40.112513'),
  (41, 'Gerente de Recursos Humanos','Gerente de area',                                                                               3, NULL,     true, '2026-04-29 19:59:01.605679')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Ubicaciones (3 registros)
-- ------------------------------------------------------------
INSERT INTO public.ubicaciones (id, nombre, direccion, ciudad, estado, codigo_postal, telefono, activo, fecha_creacion, prefijo, ultimo_folio) VALUES
  (1, 'Corporativo',       'Circuito ingenieros No 1',                                                       'Satelite',                    'Estado de México', '53100', '5518024211', true, '2026-04-27 19:51:36.896206', '1', 0),
  (2, 'Sucursal Queretaro','Av. Pirineos Numero, Exterior 515, Interior 30, Benito Juárez',                  'Queretaro',                   'Queretaro',        '76120', '4422203192', true, '2026-04-27 20:07:05.799129', '3', 0),
  (3, 'Sucursal Puebla',   'Bodegas GART, Emiliano Zapata 1016, Santiago Momoxpan, Ampliación Momoxpan',    'Heroica Puebla de Zaragoza',  'Puebla',           '72760', '2229491135', true, '2026-04-27 20:08:15.432238', '2', 0)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Resetear secuencias al valor más alto usado
-- ------------------------------------------------------------
SELECT pg_catalog.setval('public.areas_id_seq',        4,  true);
SELECT pg_catalog.setval('public.departamentos_id_seq', 8,  true);
SELECT pg_catalog.setval('public.puestos_id_seq',      41, true);
SELECT pg_catalog.setval('public.ubicaciones_id_seq',   5,  true);
