========================================
Guía de Despliegue para Clic-Tools en IIS
========================================
v2.1.0

Este documento explica cómo desplegar la aplicación Clic-Tools (Next.js) en un servidor Windows utilizando Internet Information Services (IIS).

--------------------
Requisitos Previos
--------------------
Antes de comenzar, asegúrate de que tu servidor Windows tenga lo siguiente instalado:

1.  **IIS (Internet Information Services)**: El rol de servidor web de Windows.
2.  **Node.js**: Instala la versión LTS (Soporte a Largo Plazo, v20.x o superior) desde el sitio web oficial de Node.js. Asegúrate de instalarlo en la ruta por defecto (`C:\Program Files\nodejs`).
3.  **Módulo URL Rewrite**: Un módulo oficial de Microsoft que permite a IIS reescribir URLs. Descárgalo desde la web de IIS.
4.  **`iisnode`**: Un módulo de IIS que actúa como puente para ejecutar aplicaciones Node.js dentro de IIS. Descarga la última versión desde su repositorio en GitHub.

*Nota Importante: Después de instalar estos componentes, es muy recomendable reiniciar el servicio de IIS (`iisreset` en CMD) o el servidor completo para asegurar que todos los módulos se carguen correctamente.*

--------------------
Pasos de Despliegue
--------------------

**Paso 1: Mover los archivos del proyecto al servidor**

1.  Crea una carpeta en tu servidor donde vivirá la aplicación (ej: `C:\inetpub\wwwroot\clic-tools`).
2.  Copia **todo el contenido del proyecto** (excepto la carpeta `node_modules` y `.next`) a esta nueva carpeta. Consulta el archivo `DEPLOYMENT_GUIDE.md` para más detalles sobre qué archivos copiar.

**Paso 2: Instalar dependencias en el servidor**

1.  Abre una terminal (CMD o PowerShell) **como Administrador**.
2.  Navega a la carpeta donde copiaste los archivos del proyecto (ej: `cd C:\inetpub\wwwroot\clic-tools`).
3.  Ejecuta el siguiente comando para instalar solo las dependencias necesarias para producción:
    ```bash
    npm install --omit=dev
    ```

**Paso 3: Construir la aplicación para producción**

1.  En la misma terminal, ejecuta el comando para construir la versión optimizada de Next.js. Si la carpeta `.next` ya existe por una compilación anterior, se recomienda borrarla primero.
    ```bash
    npm run build
    ```
    Esto creará una carpeta `.next` con la versión de producción de la aplicación.

**Paso 4: Configurar el Sitio en IIS**

1.  Abre el "Administrador de Internet Information Services (IIS)".
2.  En el panel de "Conexiones", haz clic derecho en "Sitios" y selecciona "Agregar sitio web".
3.  **Nombre del sitio**: Asigna un nombre descriptivo (ej: `Clic-Tools`).
4.  **Ruta de acceso física**: Selecciona la carpeta donde están los archivos del proyecto (ej: `C:\inetpub\wwwroot\clic-tools`).
5.  **Enlace**: Configura el puerto en el que se ejecutará la aplicación en tu red LAN (ej: puerto 80 o 9003) y el nombre de host si lo vas a usar (ej: intratool.miempresa.com).
6.  Haz clic en "Aceptar".

**Paso 5: Copiar y Asegurar los archivos de configuración de IIS**

1.  Desde la carpeta `deployment/IIS_Setup/` de tu proyecto, copia el archivo `web.config` a la raíz de tu sitio en el servidor (ej: a `C:\inetpub\wwwroot\clic-tools`).
2.  Este archivo es crucial, ya que le dice a IIS cómo manejar las solicitudes y pasárselas a Node.js a través de `iisnode`. **Este archivo ya está optimizado para evitar reinicios inesperados al modificar las bases de datos en la carpeta `dbs/`**.

--------------------
Solución de Problemas
--------------------

-   **Permisos de Carpeta**: Asegúrate de que la cuenta de usuario del grupo de aplicaciones de IIS (generalmente `IIS_IUSRS`) tenga permisos de lectura y ejecución sobre la carpeta del proyecto.
-   **Error 500.19 o similar**: Generalmente indica que `iisnode` o `URL Rewrite` no están instalados o no se cargaron correctamente. Reinstálalos y reinicia el servidor.
-   **Logs de `iisnode`**: Si encuentras errores (ej. `HTTP 500`), el `web.config` ya está configurado para crear una carpeta `iisnode` en el directorio de tu aplicación con archivos de log. Revisa `iisnode-stdout.log` y `iisnode-stderr.log` para obtener pistas sobre el problema.
-   **Síntoma: Reinicios inesperados al guardar datos.** Si la aplicación se reinicia al importar datos o al realizar cambios de configuración, es probable que `iisnode` esté detectando cambios en los archivos de base de datos (`.db`). Asegúrate de que el archivo `web.config` copiado en el Paso 5 esté presente en la raíz de tu aplicación, ya que contiene las reglas para ignorar la carpeta `dbs/`.
-   **Síntoma: Iconos en blanco o colores incorrectos.** Si después de añadir una nueva herramienta o tarjeta, su icono aparece en blanco, es probable que la clase de color de fondo (ej: `bg-slate-500`) no esté en la lista segura de Tailwind. **Solución:** Edita el archivo `tailwind.config.ts` en la raíz del proyecto y añade la clase de color faltante al array `safelist`. Luego, reconstruye la aplicación (`npm run build`) y reinicia el sitio en IIS.

Una vez completados estos pasos, la aplicación Clic-Tools debería estar funcionando en la dirección y puerto que configuraste en IIS.
