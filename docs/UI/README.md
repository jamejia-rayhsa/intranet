# Rayhsa · Sistema visual — Drop-in package

Este paquete contiene el nuevo lenguaje visual aplicado al portal y a los 4 dashboards. Mantiene los servicios y endpoints existentes y solo cambia componentes de presentación.

## Contenido

```
modules/
├─ portal/frontend/
│  ├─ styles/
│  │  └─ rayhsa-system.css           ← NUEVO. Estilos del sistema (sidebar, KPI, charts, modal, etc.)
│  ├─ components/
│  │  ├─ Icons.jsx                   ← NUEVO. Set de iconos SVG (reemplaza emojis)
│  │  ├─ AppTopbar.jsx               ← NUEVO. Topbar con buscador + breadcrumb
│  │  ├─ KPICard.jsx                 ← NUEVO. (reemplaza TarjetaKPI.jsx — mantener ambos)
│  │  ├─ BarChart.jsx                ← NUEVO. SVG, simple o stacked
│  │  ├─ DonutChart.jsx              ← NUEVO. SVG con leyenda
│  │  ├─ ChartCard.jsx               ← NUEVO. Contenedor de gráficas
│  │  ├─ TablaCard.jsx               ← NUEVO. Wrapper de tablas con título + CTA
│  │  ├─ PageHeader.jsx              ← NUEVO. Eyebrow + h1 + acciones
│  │  ├─ StatusPill.jsx              ← NUEVO. Pill de estado + <Piramide> + <Avatar>
│  │  ├─ NewsCarousel.jsx            ← NUEVO. (sustituto editorial de CarruselNoticias.jsx)
│  │  ├─ ComunicadosGrid.jsx         ← NUEVO.
│  │  ├─ JobsTicker.jsx              ← NUEVO. Marquee de ofertas internas
│  │  └─ ArticleModal.jsx            ← NUEVO. Modal de lectura para noticias/comunicados
│  ├─ pages/
│  │  └─ PortalHome.jsx              ← REEMPLAZA al existente
│  └─ main.jsx                       ← REEMPLAZA al existente (importa rayhsa-system.css y usa <AppTopbar>)
│
├─ tickets/frontend/pages/TicketsDashboard.jsx    ← REEMPLAZA
├─ rh/frontend/pages/RHDashboard.jsx              ← REEMPLAZA
├─ auditoria/frontend/pages/AuditoriaDashboard.jsx ← REEMPLAZA
└─ comercial/frontend/pages/ComercialDashboard.jsx ← REEMPLAZA
```

## Instalación (1-2-3)

1. **Copia los archivos.** El paquete sigue la misma estructura que tu repo, así que puedes copiar el contenido de `repo-drop-in/` directamente sobre `modules/`:

   ```bash
   cp -r repo-drop-in/modules/* modules/
   ```

   Esto sobrescribe `main.jsx`, `PortalHome.jsx` y los 4 `*Dashboard.jsx`, y agrega los componentes nuevos. **No toca** servicios, contextos, modelos ni controladores.

2. **Verifica `main.jsx`.** Añade el import del CSS justo después de `globales.css`:

   ```js
   import './styles/globales.css';
   import './styles/rayhsa-system.css';
   ```

   (Si copiaste el `main.jsx` del paquete, esto ya está hecho.)

3. **Levanta el dev server** y entra a `/`. El layout debe verse igual de funcional pero con sidebar navy resaltando el módulo activo, KPI cards con barra de color y modal de lectura al clic en una noticia.

## Notas de compatibilidad

- **Endpoints sin cambios.** Cada dashboard consume los mismos endpoints que la versión anterior (`/tickets/dashboard`, `/rh/dashboard`, `/auditoria/dashboard`, `obtenerEstadisticas`). Si el shape cambia, ajusta el mapeo en el dashboard correspondiente.
- **`TarjetaKPI.jsx` queda obsoleto.** El nuevo `KPICard.jsx` no es API-compatible (cambia `titulo`/`valor`/`color`/`icono` por `label`/`valor`/`accent`/`icon`). Borra el archivo viejo cuando todas las pantallas hayan migrado.
- **`CarruselNoticias.jsx` queda obsoleto.** `NewsCarousel.jsx` lo reemplaza, pero ningún otro componente importa al antiguo así que puedes dejarlo y borrar cuando confirmes.
- **Iconos.** Los emojis (📋 🎫 👥) se reemplazan por SVG (`Icons.briefcase`, `Icons.users`, etc.). El sidebar (`MenuDinamico`) sigue usando emojis hoy — ver siguiente punto.

## Migración del MenuDinamico (opcional)

El sidebar actual usa el constante `ICONOS_MODULOS` con emojis. Para alinear con el resto del sistema, cambia:

```js
// modules/portal/frontend/components/MenuDinamico.jsx
const ICONOS_MODULOS = {
  portal:    '🏠',  // ← reemplaza con Icons.home
  rh:        '👥',  // ← Icons.users
  tickets:   '🎫',  // ← Icons.ticket
  auditoria: '📋',  // ← Icons.shield
  bi:        '📊',  // ← Icons.chart
  comercial: '💼',  // ← Icons.briefcase
};
```

Esto es opcional y puede hacerse en un segundo PR.

## CSS — coexistencia con globales.css

El nuevo CSS está **scopeado a `.rayhsa`**. Todas las reglas viven dentro de ese namespace, así que no pisa nada de `globales.css`. El layout shell (`.app-shell`, `.app-sidebar`, `.app-topbar`) sí comparte clases — los estilos nuevos las extienden, no las reemplazan.

Si en algún módulo ves estilos viejos colándose, envuelve la página en `<div className="rayhsa">…</div>` (eso ya lo hace el `LayoutConMenu` del nuevo `main.jsx`).

## Probar en aislado

Cada dashboard se puede probar individualmente sin necesidad de levantar el backend completo:

```bash
# Solo el frontend del portal apuntando a un mock o entorno dev
cd modules/portal/frontend
npm run dev
```

Luego abre `http://localhost:3000/tickets`, `/rh`, `/auditoria`, `/comercial`.

## Soporte responsive

El sistema responde automáticamente a tres tamaños:

| Viewport      | Comportamiento                                  |
|---------------|-------------------------------------------------|
| ≥ 1025px      | Sidebar 220px fijo, comunicados 4 col, modal centrado |
| 641 – 1024px  | Sidebar 196px, comunicados 2×2                  |
| ≤ 640px       | Sidebar se vuelve drawer (hamburguesa), comunicados 1 col, modal full-screen |

Las media queries están en `rayhsa-system.css`; no hay que duplicar lógica JS.

## Smoke test

Después de copiar:

- [ ] `/` carga sin errores, muestra noticias + comunicados + ofertas
- [ ] Clic en una noticia abre el modal de lectura
- [ ] `/tickets`, `/rh`, `/auditoria`, `/comercial` cargan con KPI + charts
- [ ] Resize a 640px: aparece hamburguesa, sidebar se vuelve drawer
- [ ] Logo Rayhsa visible en sidebar (de `/logo-rayhsa.png` en `public/`)
- [ ] No hay errores en consola tipo "cannot find module" — todos los imports relativos a `portal/frontend/components`
