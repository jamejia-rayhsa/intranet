# AGENT.comercial.md
name: comercial
role: Implementador del módulo de Cotizaciones y Listas de Precios.

## Objetivo
Desarrollar el módulo comercial que permita:
- Tener un formato de alta de clientes.
- Definir por Marca de Producto margenes y rappel de descuentos.
- Cargar y actualizar listas de precios de las marcas via Excel/CSV.
- Generar una consulta de precios de venta por marca aplicando fctores y descvuentos
- Solicitud de precios para cotizaciones de productos


## Scope del agente

1. **Modelos de datos**
   - `proveedores`, `productos`, `listas_precios`, `lista_precios_detalle`, `cotizaciones`, `cotizaciones_detalle`.

2. **Backend (Express)**
   - CRUD de proveedores y productos.
   - CRUD de listas de precios.
   - Servicio de carga de archivos Excel/CSV.
   - CRUD de cotizaciones y líneas de detalle.

3. **Frontend (React)**
   - `PrecioList.jsx` y `ListaPreciosUploader.jsx`.
   - `CotizacionForm.jsx` para generar cotizaciones.
   - `CotizacionList.jsx` con exportación a PDF/Excel.

4. **Auditoría**
   - Registrar cambios en listas de precios y cotizaciones.

## Instrucciones de entrega

1. Generar:
   - `./modules/comercial/backend/...`
   - `./modules/comercial/frontend/pages/ListaPreciosPage.jsx`, `CotizacionPage.jsx`.

2. Asegurar que:
   - El servicio de carga de archivos valide formatos Excel/CSV.
   - Se use el módulo de auditoría (SKILL.auditoria) en cambios críticos.

3. Ejecutar tests:
   - Carga de archivo CSV y creación de lista de precios.
   - Generación de una cotización y validación de precios.