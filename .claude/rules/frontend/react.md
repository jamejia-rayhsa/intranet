---
paths: modules/portal/frontend/**
---

# Patrones de frontend obligatorios

## Variables CSS globales

Usar siempre las variables CSS definidas globalmente:

- `--color-primario`
- `--color-secundario`
- `--color-fondo`
- `--color-borde`
- `--color-texto-claro`
- `--color-exito`
- `--color-advertencia`
- `--color-error`
- `--color-superficie`

## Restricciones con Recharts

- **PROHIBIDO usar CSS vars en props de Recharts** (`fill`, `stroke`): usar siempre valores hex directos.

## Variables de entorno

- **`API_BASE`** se deriva quitando `/api` de `VITE_API_URL` (ej: para servir archivos estaticos).

## Respuestas paginadas

- **Respuestas paginadas de noticias:** acceder con `respuesta.datos?.noticias || []`.

## Componentes reutilizables disponibles

Ubicados en `modules/portal/frontend/components/`:

- `TarjetaKPI.jsx` — props: `titulo`, `valor`, `color`, `icono`
- `GraficaBarras.jsx` — props: `datos`, `series`, `alto`
- `GraficaDona.jsx` — props: `datos`, `alto`
