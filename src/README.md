# Clic-Tools: Documentación Técnica y Manual de Usuario

**Clic-Tools v2.0.0** es una aplicación web interna diseñada para centralizar herramientas y procesos empresariales clave en un único panel de control. El objetivo es proporcionar una plataforma sencilla, rápida, segura y altamente configurable, optimizada para su uso en una red local (LAN).

Esta versión marca un hito importante, introduciendo mejoras significativas en la arquitectura, la experiencia de usuario y la inteligencia de negocio.

---

## 1. Arquitectura y Filosofía

-   **Stack Tecnológico**:
    -   **Framework**: Next.js 14+ (con App Router).
    -   **Lenguaje**: TypeScript y Zod para validación de esquemas.
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
-   `web.config`: **(Nuevo en v2.0)** Archivo de configuración para despliegues en IIS que previene reinicios inesperados.
-   `.env.local`: Archivo **NO COMPARTIDO** donde se almacenan las credenciales de SQL Server y SMTP.

---

## 3. Guía de Módulos (Funcionalidades)

Para una guía detallada de todas las funcionalidades, por favor, accede al **Centro de Ayuda** directamente dentro de la aplicación una vez instalada. Lo encontrarás en `/dashboard/help`.

El Centro de Ayuda incluye:
- Guías paso a paso para cada módulo.
- Explicaciones de los flujos de trabajo.
- Tutoriales para la configuración y administración del sistema.
- Un control de cambios (changelog) de las versiones.

---

## 4. Instalación y Despliegue

La aplicación está diseñada para ser desplegada en servidores Windows (con IIS) o Linux (con PM2).

1.  **Requisitos Previos:**
    -   Node.js v20.x o superior.
    -   **Para Windows:** IIS con los módulos `iisnode` y `URL Rewrite`.
    -   **Para Linux:** `build-essential` y `python3`.

2.  **Instalar dependencias**:
    ```bash
    npm install --omit=dev
    ```

3.  **Configurar Variables de Entorno (Opcional)**:
    -   Crea un archivo `.env.local` en la raíz del proyecto.
    -   Añade las credenciales necesarias (SQL Server, SMTP) consultando el archivo `docs/deployment/README.txt` para ver los detalles.

4.  **Construir para Producción**:
    ```bash
    npm run build
    ```

5.  **Ejecutar en Producción**:
    ```bash
    npm run start
    ```

Para una guía más detallada, incluyendo scripts de automatización, consulta los siguientes archivos en la carpeta `docs/deployment/`:
-   `setup-ubuntu.sh`: Script para automatizar la instalación en servidores Ubuntu.
-   `IIS_Setup/README.txt`: Guía completa para el despliegue en Windows con IIS.

---

## 5. Proceso de Actualización de Versiones

Actualizar la aplicación a una nueva versión sin perder datos es un proceso crítico. Sigue estos pasos cuidadosamente.

**Filosofía de Actualización:** La aplicación está diseñada para manejar cambios en la base de datos de forma automática. Al iniciar, el sistema verifica si faltan tablas o columnas y las añade sin borrar los datos existentes. Este proceso se conoce como **migración**.

### Proceso de Actualización Seguro:

1.  **Paso 1: Realizar una Copia de Seguridad (¡CRÍTICO!)**
    -   Antes de hacer cualquier cambio, ve a **Administración > Mantenimiento** y haz clic en **"Crear Punto de Restauración"**.
    -   Haz también una copia manual del archivo `.env.local` si lo estás usando.

2.  **Paso 2: Reemplazar los Archivos de la Aplicación**
    -   Detén la aplicación en el servidor.
    -   Consulta el archivo `DEPLOYMENT_GUIDE.md` para una lista detallada de qué archivos reemplazar y cuáles **NO** debes tocar (como la carpeta `dbs/`).
    -   Copia los archivos de la nueva versión en el directorio de la aplicación.

3.  **Paso 3: Actualizar Dependencias y Reconstruir**
    -   Abre una terminal en la carpeta del proyecto en el servidor.
    -   Ejecuta `npm install --omit=dev` para instalar cualquier nueva dependencia.
    -   Ejecuta `npm run build` para compilar la nueva versión.

4.  **Paso 4: Reiniciar la Aplicación**
    -   Inicia la aplicación nuevamente.
    -   Al primer inicio, la aplicación detectará las diferencias y aplicará las migraciones necesarias automáticamente.

5.  **Paso 5: Verificar**
    -   Accede a la aplicación y verifica que tus datos sigan ahí y que las nuevas funcionalidades operen correctamente.

---

## 6. Créditos y Licencia

Este proyecto es desarrollado y mantenido por CLIC SOPORTE Y CLIC TIENDA S.R.L. y se distribuye bajo la **Licencia MIT**.
