# Checklist de Regresión de Funcionalidad Crítica
# Clic-Tools v1.9.0

Este documento es la lista de verificación maestra para asegurar que las funcionalidades clave del sistema no se hayan roto después de introducir nuevos cambios. Debe ser revisado antes de cada despliegue a producción.

---

## Módulo 1: Autenticación y Acceso

- **Responsable:** `auth-form.tsx`, `setup-wizard.tsx`, `useAuth.tsx`
- **Descripción:** Asegura que los usuarios puedan entrar, salir y gestionar su acceso de forma segura.

### Checklist:
- [ ] **Inicio de Sesión:** Un usuario con credenciales correctas puede iniciar sesión.
- [ ] **Credenciales Incorrectas:** El sistema muestra un error claro si las credenciales son incorrectas.
- [ ] **Recuperación de Contraseña:** Un usuario puede solicitar una contraseña temporal por correo (si el SMTP está configurado).
- [ ] **Cambio Forzado de Contraseña:** Al ingresar con una clave temporal, el sistema fuerza al usuario a establecer una nueva contraseña antes de continuar.
- [ ] **Asistente de Primera Vez:** Si no hay usuarios en la base de datos, se presenta el asistente para crear el primer administrador.
- [ ] **Cierre de Sesión:** Un usuario puede cerrar sesión y es redirigido a la página de login.
- [ ] **Protección de Rutas:** Un usuario no autenticado que intenta acceder a `/dashboard` es redirigido a la página de login.

---

## Módulo 2: Panel Principal y Navegación

- **Responsable:** `layout.tsx`, `sidebar.tsx`, `header.tsx`
- **Descripción:** Verifica la integridad de la navegación principal y la experiencia de usuario del layout.

### Checklist:
- [ ] **Carga sin Parpadeos:** Al iniciar sesión o recargar la página, no hay "flashes" o cambios bruscos de contenido.
- [ ] **Menú Lateral (Sidebar):** El menú lateral se puede colapsar y expandir en escritorio.
- [ ] **Menú Lateral (Móvil):** El menú lateral se abre y se cierra correctamente en dispositivos móviles.
-_**Sincronización ERP:** El botón de "Sincronizar ERP" en el encabezado es funcional y muestra el texto completo en escritorio y solo el ícono en móvil.
- [ ] **Buzón de Sugerencias:** El botón "Sugerencias" del encabezado abre el diálogo para enviar feedback.
- [ ] **Centro de Notificaciones:** El icono de la campana muestra el contador de notificaciones no leídas y despliega el panel correctamente.

---

## Módulo 3: Cotizador

- **Responsable:** `quoter/page.tsx`, `hooks/useQuoter.ts`
- **Descripción:** Garantiza que la herramienta de cotización sea rápida, fluida y precisa.

### Checklist:
- [ ] **Selección de Cliente:** Se puede buscar y seleccionar un cliente del ERP.
- [ ] **Selección de Producto:** Se puede buscar y añadir un producto a la cotización.
- [ ] **Ciclo de `Enter`:** Al añadir un producto, presionar `Enter` navega correctamente por los campos: `Cantidad` -> `Precio` -> `Búsqueda de Producto`.
- [ ] **Edición de Línea:** Todos los campos de una línea (cantidad, precio, descripción) son editables.
- [ ] **Añadir Línea Manual:** Se puede añadir una línea en blanco y editar todos sus campos (código, descripción, etc.).
- [ ] **Cálculo de Totales:** El subtotal, los impuestos y el total se actualizan correctamente al modificar líneas.
- [ ] **Manejo de Exoneración:** Al seleccionar un cliente exonerado, el impuesto de las nuevas líneas se establece en 0%.
- [ ] **Guardar y Cargar Borrador:** Una cotización se puede guardar como borrador y cargarse posteriormente sin perder datos.
- [ ] **Generar PDF:** El botón "Generar Cotización" descarga un PDF con la información correcta y el formato adecuado.

---

## Módulo 4: Planificador de Producción (OP)

- **Responsable:** `planner/page.tsx`, `hooks/usePlanner.ts`
- **Descripción:** Asegura la correcta gestión del ciclo de vida de las órdenes de producción.

### Checklist:
- [ ] **Crear Orden:** Se puede crear una nueva orden de producción asignando un cliente y un producto.
- [ ] **Cambio de Estado:** Un usuario con permisos puede cambiar el estado de una orden (ej: de `Pendiente` a `Aprobada`).
- [ ] **Edición de Orden:** Se puede editar una orden `Pendiente`. La edición de una orden `Aprobada` marca la alerta "Modificado".
- [ ] **Asignación y Programación:** Se puede asignar una máquina/turno y programar un rango de fechas en una orden.
- [ ] **Historial de Orden:** El historial de una orden muestra correctamente los cambios de estado.
- [ ] **Filtros de Vista:** Los filtros por estado, búsqueda y fecha funcionan correctamente.
- [ ] **Exportación:** Se puede exportar la vista actual a PDF y Excel.

---

## Módulo 5: Solicitud de Compra (SC)

- **Responsable:** `requests/page.tsx`, `hooks/useRequests.ts`
- **Descripción:** Valida el flujo de creación y aprobación de solicitudes de compra.

### Checklist:
- [ ] **Crear Solicitud:** Se puede crear una nueva solicitud de compra.
- [ ] **Crear desde Pedido ERP:** La función para crear solicitudes a partir de un pedido del ERP funciona correctamente.
- [ ] **Cambio de Estado:** Un usuario con permisos puede avanzar el estado de una solicitud (ej: de `Revisión` a `Aprobación`).
- [ ] **Retroceso de Estado:** Se puede regresar una solicitud de `Pendiente Aprobación` a `Revisión Compras`.
- [ ] **Filtros de Vista:** Los filtros por estado, búsqueda y fecha funcionan correctamente.
- [ ] **Exportación:** Se puede exportar la vista actual a PDF y Excel.

---

## Módulo 6: Analíticas y Reportes

- **Responsable:** `analytics/`
- **Descripción:** Garantiza que las herramientas de inteligencia de negocio funcionen correctamente.

### Checklist:
- [ ] **Sugerencias de Compra:**
    - [ ] El análisis por rango de fechas genera una lista de artículos con faltantes.
    - [ ] Los filtros (búsqueda, clasificación) y la ordenación de columnas funcionan.
    - [ ] Se pueden seleccionar artículos y crear solicitudes de compra automáticamente.
    - [ ] Las preferencias de filtros se pueden guardar y cargan correctamente.
- [ ] **Reporte de Permisos de Usuario:**
    - [ ] El reporte carga la lista de todos los usuarios y sus permisos.
    - [ ] Los filtros y la ordenación funcionan.
    - [ ] Se puede exportar el reporte a PDF y Excel.

---

## Módulo 7: Administración

- **Responsable:** `admin/`
- **Descripción:** Valida las funciones críticas de configuración del sistema.

### Checklist:
- [ ] **Gestión de Usuarios:** Se puede crear, editar y eliminar un usuario.
- [ ] **Gestión de Roles:** Se puede crear un nuevo rol y modificar sus permisos.
- [ ] **Importación de Datos (Archivos):** Se puede ejecutar la importación desde un archivo `.txt` y los datos se reflejan en la aplicación.
- [ ] **Importación de Datos (SQL):** Se puede ejecutar la importación desde SQL Server y los datos se reflejan en la aplicación.
- [ ] **Mantenimiento:** Se puede crear un punto de restauración.
- [ ] **Mantenimiento:** La función de "Auditoría de Bases de Datos" se ejecuta y muestra un resultado.
- [ ] **Visor de Eventos:** Los logs del sistema se cargan y se pueden filtrar.
```