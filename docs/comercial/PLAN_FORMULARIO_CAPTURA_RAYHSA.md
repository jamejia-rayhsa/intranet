# PLAN DE CREACIÓN: FORMULARIO DE CAPTURA DINÁMICO RAYHSA
## Solicitudes de Crédito (Industria + Distribución)

---

## 1. VISIÓN GENERAL

**Objetivo:** Sistema web para captura de datos de solicitudes de crédito con formularios dinámicos (Industria/Distribución), guardado en BD servidor, edición post-captura, auditoría completa e impresión PDF similar al diseño original Rayhsa, con integración a MBA3.

**Usuarios:** Personal interno Rayhsa + Clientes externos

**Plataforma:** Aplicación web (navegador)

---

## 2. ARQUITECTURA FUNCIONAL

### 2.1 COMPONENTES PRINCIPALES

```
┌─────────────────────────────────────────────┐
│         FRONTEND (Navegador)                │
│  - Formulario dinámico por tipo cliente     │
│  - Interfaz por pestañas/secciones          │
│  - Vista previa antes de imprimir           │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│         BACKEND (Servidor)                  │
│  - API REST para captura/edición            │
│  - Validaciones avanzadas (RFC, bancarios)  │
│  - Auditoría de cambios                     │
│  - Generación PDF                           │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│      BASE DE DATOS (PostgreSQL/MySQL)       │
│  - Solicitudes de crédito                   │
│  - Historial de cambios (audit log)         │
│  - Estados y flujos                         │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│    INTEGRACIONES EXTERNAS                   │
│  - MBA3 (sincronización de datos)           │
│  - Validador RFC (SAT)                      │
└─────────────────────────────────────────────┘
```

---

## 3. ESPECIFICACIONES POR MÓDULO

### 3.1 FRONTEND - FORMULARIO DINÁMICO

#### Estructura de Pestañas

```
Pestaña 1: DATOS GENERALES
├─ Razón Social (texto, requerido)
├─ RFC (texto, validación SAT, requerido)
├─ Tipo Cliente (radio: INDUSTRIA / DISTRIBUCIÓN)
├─ Sucursal (select: Corp / Qro / Pue, según tipo)
├─ Moneda (radio: USD / MN)
├─ Régimen Fiscal (radio: Física / Moral / Otro)
├─ Giro de Negocio (select dinámico según tipo)
├─ Método de Pago (select)
├─ Uso CFDI (select: G01 / G03 / Otro)
└─ Forma de Pago (checkbox múltiple)

Pestaña 2: DOMICILIOS
├─ Domicilio Fiscal (calle, número, colonia, etc.)
├─ Domicilio de Entrega (calle, número, colonia, etc.)
└─ Validación: Al menos un domicilio requerido

Pestaña 3: DATOS BANCARIOS
├─ Datos Bancarios Nacionales (tabla dinámica, múltiples)
│  └─ Banco, Cuenta, Tipo Cuenta, Sucursal, CLABE
├─ Datos Bancarios Extranjeros (tabla dinámica, múltiple)
│  └─ Banco, Cuenta, Tipo Cuenta, SWIFT, Divisa
└─ Al menos una cuenta nacional requerida

Pestaña 4: CONDICIONES COMERCIALES (dinámico por tipo)
├─ SI INDUSTRIA:
│  ├─ Días de crédito solicitados
│  ├─ Monto de crédito solicitado
│  ├─ Aceptan facturas mes anterior (Si/No)
│  ├─ Aceptan entregas parciales (Si/No)
│  ├─ Tipo de revisión (Presencial/Email/Portal)
│  ├─ Horario de almacén
│  └─ No. empleados que usan EPP
│
├─ SI DISTRIBUCIÓN:
│  ├─ Método de Pago (PUE/PPD)
│  ├─ Línea Fletera
│  └─ Domicilio/Ocurre

Pestaña 5: CONTACTOS
├─ Contacto de Compras
│  └─ Nombre, Email, Teléfono, Extensión, Celular
├─ Contacto de Cuentas por Pagar
│  └─ Nombre, Email, Teléfono, Extensión, Celular
├─ Contacto Almacén (solo Distribución)
│  └─ Nombre, Email, Teléfono, Extensión, Celular
├─ Contacto Gerente de Ventas (solo Industria)
│  └─ Nombre, Email, Teléfono, Extensión, Celular
└─ Al menos un contacto requerido

Pestaña 6: REFERENCIAS COMERCIALES
├─ Referencias (tabla dinámica, mínimo 3-4)
│  ├─ Empresa (requerido)
│  ├─ Nombre contacto (requerido)
│  ├─ Teléfono (requerido)
│  ├─ Email
│  ├─ Página web
│  ├─ Dirección (calle, colonia, delegación, estado, población)
│  └─ Botón Agregar/Eliminar fila
└─ Al menos 3 referencias requeridas

Pestaña 7: REVISIÓN Y FIRMA
├─ Resumen de datos capturados (lectura)
├─ Datos proporcionados por (nombre/puesto)
├─ Botón: Vista Previa PDF
├─ Botón: Guardar Solicitud
└─ Botón: Descargar PDF
```

#### Comportamiento Dinámico

- **Tipo Cliente:** Al seleccionar INDUSTRIA o DISTRIBUCIÓN, ocultar/mostrar campos específicos en pestañas 4, 5 y 6.
- **Giro de Negocio:** Listar opciones diferentes por tipo:
  - INDUSTRIA: Aeroespacial, Farmacéutica, Petróleo, Alimenticia, Textil, Minería, Automotriz, Madera, Química, Construcción, Metalmecánica
  - DISTRIBUCIÓN: Ferretería, Construcción, Distribuidor, Casa de Materiales
- **Sucursal:** Después de seleccionar tipo, listar sucursales disponibles
- **Validación en tiempo real:** RFC, emails, teléfonos

---

### 3.2 BACKEND - LÓGICA Y SERVICIOS

#### Servicios Principales

```
POST /api/solicitudes
├─ Crear nueva solicitud
├─ Guardar en BD con estado "BORRADOR"
└─ Retornar ID solicitud

GET /api/solicitudes/{id}
├─ Recuperar solicitud completa
├─ Incluir historial de cambios
└─ Incluir datos de quién creó y cuándo

PUT /api/solicitudes/{id}
├─ Actualizar solicitud existente
├─ Registrar en audit log (usuario, timestamp, campos modificados)
├─ Validaciones avanzadas
└─ Retornar solicitud actualizada

GET /api/solicitudes/{id}/historial
├─ Listar todos los cambios
├─ Mostrar: usuario, fecha, hora, campos alterados, valores antes/después
└─ Exportar como reporte

POST /api/solicitudes/{id}/generar-pdf
├─ Generar PDF con diseño similar a original Rayhsa
├─ Incluir datos capturados en estructura original
├─ Retornar PDF descargable o para vista previa

GET /api/solicitudes/{id}/vista-previa
├─ Retornar HTML para vista previa antes de imprimir
└─ Incluir validaciones pendientes

POST /api/solicitudes/{id}/sincronizar-mba3
├─ Enviar datos a MBA3 (endpoint/API MBA3)
├─ Registrar resultado de sincronización
└─ Retornar confirmación o errores

GET /api/catalogos
├─ Sucursales (por tipo cliente)
├─ Giros de negocio (por tipo cliente)
├─ Métodos de pago
├─ Estados CFDI
└─ Regímenes fiscales
```

#### Validaciones Avanzadas

```
CAMPO: RFC
├─ Formato: XXXXXX######XXX (13 caracteres)
├─ Estructura válida según SAT
└─ Integración opcional: validador SAT (si existe API)

CAMPO: Email
├─ Formato válido (regex)
└─ Único por solicitud (si aplica)

CAMPO: Teléfono
├─ Formato nacional/internacional
└─ Números válidos

CAMPO: CLABE (datos bancarios)
├─ 18 dígitos exactos
└─ Dígito verificador válido

CAMPO: Monto crédito
├─ Número positivo
├─ Máximo configurable por sucursal
└─ Validación contra límites MBA3 (si aplica)

CAMPO: Días de crédito
├─ Número entre rango permitido (ej: 15-90 días)
└─ Validación según política Rayhsa
```

---

### 3.3 BASE DE DATOS - ESTRUCTURA

#### Tabla Principal: `solicitudes_credito`

```sql
solicitudes_credito
├─ id (UUID, PK)
├─ numero_solicitud (VARCHAR, único, generado automático)
├─ razon_social (VARCHAR, NOT NULL)
├─ rfc (VARCHAR, NOT NULL, único)
├─ tipo_cliente (ENUM: 'INDUSTRIA', 'DISTRIBUCIÓN')
├─ sucursal (VARCHAR)
├─ regimen_fiscal (VARCHAR)
├─ moneda (ENUM: 'USD', 'MN')
├─ giro_negocio (VARCHAR)
├─ metodo_pago (VARCHAR)
├─ uso_cfdi (VARCHAR)
├─ domicilio_fiscal (JSON)
├─ domicilio_entrega (JSON)
├─ datos_bancarios_nacionales (JSON array)
├─ datos_bancarios_extranjeros (JSON array)
├─ contactos (JSON array)
├─ referencias_comerciales (JSON array)
├─ condiciones_comerciales (JSON)
├─ estado (ENUM: 'BORRADOR', 'ENVIADO', 'EN_REVISIÓN', 'APROBADO', 'RECHAZADO')
├─ usuario_creador (VARCHAR, FK usuarios)
├─ fecha_creacion (TIMESTAMP)
├─ usuario_ultimo_cambio (VARCHAR, FK usuarios)
├─ fecha_ultimo_cambio (TIMESTAMP)
├─ sincronizado_mba3 (BOOLEAN, default FALSE)
├─ referencia_mba3 (VARCHAR, nullable)
└─ metadata (JSON, para campos adicionales)

audit_log
├─ id (UUID, PK)
├─ solicitud_id (UUID, FK)
├─ usuario (VARCHAR)
├─ accion (ENUM: 'CREAR', 'EDITAR', 'ELIMINAR', 'SINCRONIZAR')
├─ campos_modificados (JSON) // {campo: {antes, despues}}
├─ timestamp (TIMESTAMP, NOT NULL)
├─ ip_address (VARCHAR)
└─ descripcion (TEXT)

usuarios
├─ id (VARCHAR, PK)
├─ nombre (VARCHAR)
├─ email (VARCHAR, único)
├─ rol (ENUM: 'ADMIN', 'VENDEDOR', 'CLIENTE', 'REVISOR')
├─ sucursal (VARCHAR)
├─ activo (BOOLEAN)
└─ fecha_creacion (TIMESTAMP)
```

---

### 3.4 GENERACIÓN DE PDF

#### Especificaciones

- **Librería:** pdfkit, ReportLab o similar (según tech stack)
- **Plantilla:** Basado en diseño original PDF Rayhsa (proporcionado)
- **Estructura:**
  - Logo Rayhsa (encabezado)
  - Título: "SOLICITUD DE CRÉDITO [INDUSTRIA/DISTRIBUCIÓN]"
  - Fecha de generación
  - Todos los datos capturados en secciones ordenadas
  - Pie con datos de contacto Rayhsa
  - Número de solicitud y folio
  - Firmas/sellos (si aplica)
  - Nota: "Datos generados automáticamente - [fecha/hora]"

- **Configuración de impresión:**
  - Tamaño: Carta (8.5" x 11")
  - Márgenes: 0.5" estándar
  - Escala: 100%

---

### 3.5 INTEGRACIÓN CON MBA3

#### Flujo de Sincronización

```
1. Usuario guarda solicitud en BD (estado: BORRADOR)
2. Usuario presiona "Sincronizar con MBA3" (botón en vista previa)
3. Backend valida solicitud completa
4. Si válida:
   - Mapea datos capturados a formato MBA3
   - Envía POST a API MBA3 (endpoint TBD)
   - Recibe ID/referencia MBA3
   - Guarda referencia_mba3 en BD
   - Actualiza estado a "SINCRONIZADO"
   - Registra en audit_log
5. Si error:
   - Retorna error detallado al usuario
   - Permite reintentarSin generar duplicados
```

#### Campos a Mapear a MBA3 (TBD)

```
Solicitud Rayhsa → MBA3 (requiere especificación MBA3)
├─ razon_social → cliente_nombre
├─ rfc → cliente_rfc
├─ tipo_cliente → tipo_cliente
├─ monto_credito → monto_limite
├─ dias_credito → plazo_dias
├─ contactos → contactos_cliente
├─ referencias_comerciales → referencias
└─ [otros campos según API MBA3]
```

**NOTA:** Requiere documentación/especificación de API MBA3 para completar este mapeo.

---

## 4. FLUJO DE USUARIO

### 4.1 Flujo de Captura (Cliente/Vendedor)

```
1. Acceder a formulario
   ↓
2. Seleccionar Tipo Cliente (INDUSTRIA / DISTRIBUCIÓN)
   ↓
3. Completar Pestaña 1: DATOS GENERALES
   ├─ Validación en tiempo real (RFC)
   └─ Campos específicos se habilitan según tipo
   ↓
4. Completar Pestaña 2: DOMICILIOS
   ├─ Domicilio Fiscal (obligatorio)
   └─ Domicilio Entrega (según tipo)
   ↓
5. Completar Pestaña 3: DATOS BANCARIOS
   ├─ Agregar datos bancarios nacionales (mín. 1)
   └─ Agregar datos bancarios extranjeros (opcional)
   ↓
6. Completar Pestaña 4: CONDICIONES COMERCIALES
   ├─ Si INDUSTRIA: días crédito, monto, aceptan facturas, etc.
   └─ Si DISTRIBUCIÓN: método pago, línea fletera, etc.
   ↓
7. Completar Pestaña 5: CONTACTOS
   ├─ Mínimo 1 contacto requerido
   └─ Validación de emails/teléfonos
   ↓
8. Completar Pestaña 6: REFERENCIAS COMERCIALES
   ├─ Agregar mín. 3 referencias
   └─ Validación de datos completos por referencia
   ↓
9. Pestaña 7: REVISIÓN Y FIRMA
   ├─ Ver resumen completo
   ├─ Botón "Vista Previa PDF" → abre PDF en navegador
   ├─ Botón "Guardar" → guarda en BD (estado BORRADOR)
   └─ Botón "Descargar PDF" → descarga PDF localmente
   ↓
10. Sincronizar con MBA3 (botón adicional)
    └─ Validación final → envío a MBA3 → confirmación
```

### 4.2 Flujo de Edición Post-Captura

```
1. Usuario accede a solicitud guardada
   ├─ Búsqueda por RFC o Número de Solicitud
   └─ Carga datos desde BD
   ↓
2. Cada pestaña muestra datos guardados
   ├─ Editar cualquier campo
   └─ Validación igual a captura original
   ↓
3. Guardar cambios
   ├─ Backend registra cambios en audit_log
   │  └─ {usuario, timestamp, campo, valor_anterior, valor_nuevo}
   └─ Solicitud pasa a estado "EDITADA"
   ↓
4. Ver historial de cambios
   ├─ Botón "Ver Historial"
   └─ Tabla: Fecha | Usuario | Acción | Campos Modificados
   ↓
5. Regenerar y descargar PDF actualizado
```

---

## 5. CARACTERÍSTICAS TÉCNICAS

### 5.1 Auditoría y Cumplimiento

```
Cada cambio registra:
├─ Quién (usuario_id, nombre)
├─ Qué (campos modificados con valores antes/después)
├─ Cuándo (timestamp exacto)
├─ Dónde (IP address, navegador si aplica)
└─ Por qué (descripción de acción: CREAR, EDITAR, SINCRONIZAR, etc.)

Reporte de Auditoría:
├─ Filtrable por solicitud, usuario, fecha rango
├─ Exportable a CSV/Excel
└─ Archivo de log inmutable (append-only)
```

### 5.2 Seguridad

```

Autorización:
├─ VENDEDOR: puede crear/editar solicitudes propias
├─ CLIENTE: puede ver/editar solo sus solicitudes
├─ REVISOR: lectura y aprobación
├─ ADMIN: acceso total + gestión de usuarios
└─ ENCRIPTACIÓN de datos sensibles en BD (RFC, bancarios)

Validación:
├─ CSRF protection
├─ Rate limiting en endpoints sensibles
├─ Validación entrada (sanitización)
└─ HTTPS obligatorio
```

### 5.3 Performance

```
Frontend:
├─ Carga incremental de pestañas (lazy loading)
├─ Validación cliente (sin esperar servidor)
└─ Caché local (localStorage) para borrador automático

Backend:
├─ Índices en RFC, numero_solicitud, fecha_creacion
├─ Paginación en listados (50-100 registros)
├─ Caché de catálogos (sucursales, giros)
└─ Async/await para operaciones no bloqueantes

Base de Datos:
├─ Backup automático diario
├─ Índices en foreign keys
└─ Particionamiento por año (si > 1M registros/año)
```

---

## 6. INTEGRACIONES EXTERNAS

### 6.1 MBA3

- **Tipo:** REST API
- **Sincronización:** Manual (botón usuario) o automática (post-aprobación)
- **Errores:** Reintentos automáticos con backoff exponencial
- **Registro:** Cada sincronización queda en audit_log con resultado

### 6.2 Validador RFC (SAT)

- **Tipo:** REST API o librería local
- **Cuándo:** Al completar campo RFC
- **Respuesta:** Válido/Inválido + mensaje de error
- **Fallback:** Validación formato básico si API no disponible

### 6.3 Generador PDF

- **Tipo:** Librería interna (no API externa)
- **Uso:** En demanda (click "Generar PDF")
- **Output:** PDF descargable o stream para impresión

---

## 7. CONSIDERACIONES ESPECIALES

### 7.1 Campos Dinámicos por Tipo

| Campo | Industria | Distribución |
|-------|-----------|--------------|
| Días de crédito | ✓ | ✗ |
| Monto de crédito | ✓ | ✗ |
| Aceptan facturas mes anterior | ✓ | ✗ |
| Aceptan entregas parciales | ✓ | ✗ |
| Tipo de revisión | ✓ | ✗ |
| No. empleados EPP | ✓ | ✗ |
| Línea Fletera | ✗ | ✓ |
| Método Pago (PUE/PPD) | ✗ | ✓ |
| Contacto Almacén | ✗ | ✓ |
| Contacto Gerente Ventas | ✓ | ✗ |

### 7.2 Validaciones por Campo

| Campo | Validación |
|-------|-----------|
| RFC | Formato 13 caracteres + SAT (si disponible) |
| Email | Regex + SMTP validation (opcional) |
| Teléfono | Formato nacional (10 dígitos MX) |
| CLABE | 18 dígitos + dígito verificador |
| Monto | Número positivo + máximo según sucursal |
| Días crédito | Rango 15-90 (configurable) |
| Referencias | Mínimo 3, todos campos requeridos |
| Contactos | Al menos 1, email + teléfono requeridos |

### 7.3 Estados de Solicitud

```
BORRADOR
  ↓ (usuario guarda)
GUARDADA
  ↓ (usuario sincroniza)
ENVIADA_A_MBA3
  ├─ MBA3 responde OK
  │  ↓
  │  APROBADA
  │
  └─ MBA3 responde ERROR
     ↓
     ERROR_SINCRONIZACION (usuario puede reintentar)

EDITADA (en cualquier momento desde GUARDADA/APROBADA)
  ↓ (usuario resincroniza)
  ENVIADA_A_MBA3 (nuevamente)
```

---



## 9. CRONOGRAMA ESTIMADO

```
Paso 1-2: Diseño y Especificación
├─ Finalizar diseño UI/UX
├─ Documentar API REST completa
└─ Confirmar mapeo MBA3

Paso 3-4: Backend Base
├─ Setup BD (schema + índices)
├─ Implementar API CRUD básica
└─ Validaciones server

Paso 5-6: Frontend Base
├─ Estructura HTML (pestañas)
├─ Validaciones cliente
└─ Integración con API

Paso 7: Auditoría + PDF
├─ Implementar audit_log
├─ Generador PDF
└─ Vista previa

Paso 8: Integraciones
├─ MBA3 sincronización
├─ RFC validator
└─ Testing integración

Paso 9: Testing + Ajustes
├─ QA funcional
├─ Performance testing
└─ Correcciones

Paso 10: Despliegue
├─ Setup producción
├─ Migración datos (si aplica)
├─ Capacitación usuarios
└─ Go-live
```

---

## 10. DOCUMENTACIÓN REQUERIDA DEL USUARIO

Antes de iniciar desarrollo, proporcionar:

1. **API MBA3 Spec**
   - Endpoints disponibles
   - Formato JSON entrada/salida
   - Autenticación (API key, OAuth, etc.)
   - Límites de rate limiting
   - Campos obligatorios vs opcionales

2. **Plantilla PDF**
   - PDF original Rayhsa escaneado o original
   - Especificación exacta de secciones
   - Ubicación de campos en página
   - Fuentes tipográficas usadas
   - Colores corporativos

3. **Políticas Rayhsa**
   - Rango válido de días de crédito (ej: 15-90)
   - Montos máximos por sucursal/tipo cliente
   - Quién puede aprobar qué montos
   - SLA de revisión de solicitudes





