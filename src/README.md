# Clic-Tools: Documentación Técnica y Manual de Usuario

**Clic-Tools v1.9.0** es una aplicación web interna diseñada para centralizar herramientas y procesos empresariales clave en un único panel de control. El objetivo es proporcionar una plataforma sencilla, rápida, segura y altamente configurable, optimizada para su uso en una red local (LAN).

---

## 1. Arquitectura y Filosofía

-   **Stack Tecnológico**:
    -   **Framework**: Next.js 14+ (con App Router).
    -   **Lenguaje**: TypeScript.
    -   **UI**: React, Tailwind CSS, ShadCN UI y Lucide React (iconos).
    -   **Base de Datos Local**: `better-sqlite3` para bases de datos locales basadas en archivos, garantizando alta velocidad y funcionamiento offline.
    -   **Conectividad ERP**: Soporte para `mssql` para conexión directa y de solo lectura a bases de datos de SQL Server.
    -   **Envío de Correo**: `nodemailer` para el envío de notificaciones y recuperación de contraseñas.

-   **Filosofía de Diseño**:
    -   **Server-Centric**: La mayor parte de la lógica crítica se ejecuta en el servidor (`'use server'`), mejorando la seguridad y el rendimiento.
    -   **Modularidad**: Cada herramienta (Cotizador, Planificador, etc.) tiene su propia base de datos (`.db`), asegurando un desacoplamiento total. Un error o reseteo en un módulo no afecta a los demás.
    -   **Independencia y Resiliencia**: El sistema funciona sobre su propia base de datos SQLite. Los datos del ERP (clientes, productos, etc.) se **sincronizan** a esta base de datos local. Esto significa que la aplicación es extremadamente rápida y puede seguir funcionando incluso si el servidor del ERP no está disponible temporalmente.
    -   **Doble Modo de Importación**:
        1.  **Desde Archivos**: El método tradicional, cargando datos desde archivos de texto (`.txt` o `.csv`). Ideal para una configuración rápida o como método de respaldo.
        2.  **Desde SQL Server**: El método recomendado. Conecta directamente a la base de datos del ERP (con un usuario de **solo lectura**) para sincronizar los datos.
    -   **Gestor de Consultas Dinámico**: Para el modo SQL, las consultas `SELECT` no están escritas en el código. Se configuran desde la interfaz de administración, permitiendo adaptar la aplicación a cambios en la estructura del ERP sin necesidad de modificar el código fuente.

---

## 2. Estructura del Proyecto

-   `src/app/`: Contiene las rutas y páginas de la aplicación.
    -   `(auth)/`: Páginas de autenticación (login).
    -   `dashboard/`: Layout y páginas del panel de control principal.
-   `src/components/`: Componentes de React reutilizables (UI, Layout).
-   `src/modules/`: El corazón de la aplicación, organizado por funcionalidad.
    -   `core/`: Lógica compartida (autenticación, tipos, hooks, conexión a BD).
    -   `quoter/`, `planner/`, `requests/`, `warehouse/`, `cost-assistant/`: Módulos para cada herramienta, conteniendo sus propios `hooks`, `actions` y lógica de base de datos.
-   `src/lib/`: Utilidades generales.
-   `dbs/`: **Directorio persistente** donde se almacenan todos los archivos de base de datos (`.db`).
-   `docs/`: Documentación del proyecto y archivos de ejemplo.
-   `.env.local`: Archivo **NO COMPARTIDO** donde se almacenan las credenciales de SQL Server y SMTP.

---

## 3. Guía de Módulos (Funcionalidades)

### 3.1. Centro de Notificaciones
- **Alertas Proactivas:** Un icono de campana en la cabecera muestra un contador de notificaciones no leídas y se anima sutilmente cuando llega una nueva.
- **Bandeja de Tareas Interactiva:** Al hacer clic en la campana, se despliega un panel con las últimas notificaciones. Cada notificación es un enlace directo a la entidad correspondiente (una orden, una solicitud, etc.).
- **Notificaciones Accionables:** Ciertas notificaciones (ej: "Se solicita cancelar una orden") incluyen botones para realizar acciones rápidas directamente desde el panel, como "Aprobar" o "Rechazar", convirtiendo las notificaciones en una herramienta de gestión activa.
- **Inteligencia de Contexto:** El sistema notifica a usuarios específicos (ej: el creador de una orden) o a roles completos (ej: todos los administradores) según la relevancia de la acción.

### 3.2. Cotizador (`/dashboard/quoter`)
- **Creación Rápida:** Permite buscar y añadir clientes y productos de forma ágil, con autocompletado y atajos de teclado. Muestra la cédula del cliente para evitar confusiones.
- **Validación en Tiempo Real:** Verifica el estado de exoneración de un cliente directamente con la API de Hacienda al seleccionarlo.
- **Generación de PDF:** Crea documentos de cotización profesionales con la información de la empresa.

### 3.3. Asistente de Costos (`/dashboard/cost-assistant`)
- **Análisis de Facturas:** Carga facturas de compra en formato XML y extrae automáticamente todos los artículos, cantidades y costos.
- **Prorrateo de Costos:** Permite ingresar costos adicionales (transporte, aduanas, etc.) que se distribuyen automáticamente entre todos los artículos para obtener un costo final real.
- **Manejo de Descuentos:** Configura si los descuentos de la factura se trasladan al costo (beneficiando al cliente) o a la ganancia (beneficiando a la empresa).
- **Cálculo de Precios de Venta:** Ingresa el margen de ganancia deseado para cada artículo y el sistema calcula el precio de venta final sugerido.
- **Exportación a ERP:** Genera un archivo Excel (`.xlsx`) formateado para ser importado directamente en tu ERP, actualizando los precios de venta de los artículos analizados.

### 3.4. Planificador (`/dashboard/planner`)
- **Gestión de Órdenes:** Permite crear, editar y visualizar órdenes de producción, mostrando siempre el nombre y la cédula del cliente para mayor claridad.
- **Visibilidad Controlada:** Por defecto, los usuarios solo ven las órdenes que ellos han creado. Un permiso especial (`planner:read:all`) permite a supervisores y administradores ver todas las órdenes.
- **Flujo de Estados Completo:** Controla el ciclo de vida de una orden (Pendiente, Aprobada, En Progreso, Completada, etc.).
- **Trazabilidad:** Cada cambio de estado, nota o modificación queda registrada en un historial detallado por orden.
- **Alertas Visuales:**
    - Las órdenes modificadas después de ser aprobadas se marcan visualmente para alertar a los supervisores.
    - Al crear una nueva orden, el sistema avisa si ya existen otras órdenes activas para el mismo producto.
- **Gestión de Turnos Personalizable**: Desde administración, se puede cambiar el nombre de la etiqueta "Turno" y añadir, editar o eliminar los diferentes turnos de trabajo disponibles.
- **Interfaz Optimizada**: La vista de órdenes ahora cuenta con un **encabezado fijo** que permanece visible al hacer scroll, mejorando la legibilidad.
- **Exportación Flexible:** Permite exportar la vista actual (con filtros) a un archivo **PDF** o **Excel (.xlsx)**.

### 3.5. Solicitud de Compra (`/dashboard/requests`)
- **Visibilidad Controlada:** Por defecto, los usuarios ven solo sus propias solicitudes. El permiso `requests:read:all` otorga visibilidad total.
- **Flujo de Aprobación Flexible:**
  - Controla el ciclo de vida de una solicitud, desde "Pendiente" hasta "Recibida".
  - **Pasos Opcionales:** Desde administración se puede activar el estado "Recibido en Bodega" y el estado final "Ingresado en ERP" para una trazabilidad completa.
  - **Retroceso en el Flujo:** Permite regresar una solicitud de "Revisión" a "Pendiente", o de "Pendiente de Aprobación" de vuelta a "Revisión", para corregir errores.
- **Creación Inteligente desde ERP:** Permite crear solicitudes de compra automáticamente a partir de un pedido de venta del ERP. El sistema analiza el pedido, compara con el inventario actual y sugiere qué artículos comprar.
- **Alerta Visual de Duplicados:** Antes de crear una solicitud, el sistema avisa si ya existen otras solicitudes activas para el mismo artículo.
- **Interfaz Optimizada**: La vista de solicitudes ahora cuenta con un **encabezado fijo** que permanece visible al hacer scroll.
- **Exportación Flexible:** Permite exportar la vista actual (con filtros) a un archivo **PDF** o **Excel (.xlsx)**.

### 3.6. Analíticas y Reportes (`/dashboard/analytics`)
Este módulo agrupa herramientas de inteligencia de negocio para ayudar en la toma de decisiones.
- **Sugerencias de Compra Proactivas (`/purchase-suggestions`):**
    - Analiza los pedidos de venta del ERP en un rango de fechas y los cruza con el inventario actual.
    - Genera una lista consolidada de todos los artículos que tienen un faltante de stock para cumplir con la demanda.
    - Permite filtrar por clasificación de producto (con multiselección), ordenar los resultados por cualquier columna y paginar la lista.

### 3.7. Almacenes (`/dashboard/warehouse`)
- **Consulta de Inventario:** Permite buscar artículos o clientes y ver sus ubicaciones y existencias en tiempo real, combinando datos del ERP y las ubicaciones físicas asignadas.
- **Asignación de Ubicaciones:** Herramienta para mover inventario o asignar artículos a ubicaciones físicas en el almacén.
- **Configuración Flexible:** Soporta un modo "informativo" (solo asignación) y un modo "avanzado" (conteo de existencias físicas por ubicación).

### 3.8. Consultas Hacienda (`/dashboard/hacienda`)
- **Búsqueda Unificada:** Centraliza la consulta de situación tributaria y exoneraciones de un cliente.

### 3.9. Buzón de Sugerencias (`/dashboard/admin/suggestions`)
- **Feedback Directo:** Permite a los usuarios enviar sugerencias o reportar problemas directamente desde la interfaz.
- **Panel de Administración:** Los administradores pueden ver, gestionar y marcar como leídas las sugerencias para un seguimiento efectivo.

### 3.10. Centro de Ayuda (`/dashboard/help`)
- **Documentación Integrada**: Una guía de usuario completa y siempre actualizada, directamente accesible desde la aplicación.
- **Búsqueda Inteligente**: Incluye una barra de búsqueda que filtra y resalta las secciones relevantes en tiempo real.

---

## 4. Gestión de Usuarios y Seguridad

### 4.1. Recuperación de Contraseña
- **Flujo de Autoservicio:** Los usuarios pueden hacer clic en "¿Olvidaste tu contraseña?" en la pantalla de login.
- **Correo Seguro:** El sistema envía una contraseña temporal al correo electrónico registrado del usuario.
- **Configuración SMTP:** Un administrador debe configurar las credenciales del servidor de correo (SMTP) en **Administración > Configuración de Correo** para que esta función esté activa.

### 4.2. Cambio de Contraseña Forzado
- **Para Nuevos Usuarios:** Al crear un nuevo usuario, un administrador puede marcar la opción **"Forzar cambio de contraseña en el próximo inicio de sesión"**.
- **Para Contraseñas Recuperadas:** Este proceso se activa automáticamente cuando un usuario utiliza una contraseña temporal.
- **Proceso:** Tras iniciar sesión, la misma tarjeta de login se transformará para solicitarle al usuario que establezca una nueva contraseña personal antes de poder acceder al sistema.

---

## 5. Instalación y Despliegue

1.  **Instalar dependencias**:
    ```bash
    npm install
    ```
2.  **(Opcional) Configurar Conexiones Externas**:
    -   Crea un archivo llamado `.env.local` en la raíz del proyecto.
    -   Añade las siguientes líneas con tus credenciales. Solo necesitas las que vayas a usar.
        ```
        # Para conexión a SQL Server
        SQL_SERVER_USER=tu_usuario
        SQL_SERVER_PASSWORD=tu_contraseña
        SQL_SERVER_HOST=ip_del_servidor
        SQL_SERVER_DATABASE=nombre_bd
        SQL_SERVER_PORT=1433

        # Para envío de correos (SMTP)
        SMTP_HOST=smtp.tuproveedor.com
        SMTP_PORT=587
        SMTP_USER=tu_correo@ejemplo.com
        SMTP_PASS=tu_contraseña_de_correo
        SMTP_SECURE=true
        ```
3.  **Ejecutar en desarrollo**:
    ```bash
    npm run dev
    ```
    La aplicación se iniciará en `http://localhost:9003`.
4.  **Primer Inicio de Sesión**:
    -   Al acceder por primera vez, la aplicación te presentará un **Asistente de Configuración**.
    -   Deberás crear el **primer usuario administrador**.
5.  **Construir y Ejecutar en Producción**:
    ```bash
    npm run build
    npm run start
    ```
    Se recomienda usar un gestor de procesos como **PM2** (para Linux) o configurar el sitio en **IIS** (para Windows).

---

## 6. Proceso de Actualización de Versiones

Actualizar la aplicación a una nueva versión sin perder datos es un proceso crítico. Sigue estos pasos cuidadosamente.

**Filosofía de Actualización:** La aplicación está diseñada para manejar cambios en la base de datos de forma automática. Al iniciar, el sistema verifica si faltan tablas o columnas y las añade sin borrar los datos existentes. Este proceso se conoce como **migración**.

### Proceso de Actualización Seguro:

1.  **Paso 1: Realizar una Copia de Seguridad (¡CRÍTICO!)**
    -   Antes de hacer cualquier cambio, ve a **Administración > Mantenimiento** y haz clic en **"Crear Punto de Restauración"**.
    -   Haz también una copia manual del archivo `.env.local` si lo estás usando.

2.  **Paso 2: Reemplazar los Archivos de la Aplicación**
    -   Detén la aplicación en el servidor.
    -   Elimina todos los archivos y carpetas de la versión anterior **EXCEPTO** la carpeta `dbs/` y el archivo `.env.local`.
    -   Copia todos los archivos y carpetas de la **nueva versión** en el directorio de la aplicación.

3.  **Paso 3: Actualizar Dependencias y Reconstruir**
    -   Abre una terminal en la carpeta del proyecto en el servidor.
    -   Ejecuta `npm install --omit=dev` para instalar cualquier nueva dependencia.
    -   Ejecuta `npm run build` para compilar la nueva versión.

4.  **Paso 4: Reiniciar la Aplicación**
    -   Inicia la aplicación nuevamente.
    -   Al primer inicio, la aplicación detectará las diferencias en la base de datos y aplicará las migraciones necesarias automáticamente.

5.  **Paso 5: Verificar**
    -   Accede a la aplicación y verifica que tus datos sigan ahí y que las nuevas funcionalidades operen correctamente.

---

## 7. Créditos y Licencia

Este proyecto es desarrollado y mantenido por CLIC SOPORTE Y CLIC TIENDA S.R.L. y se distribuye bajo la **Licencia MIT**.
