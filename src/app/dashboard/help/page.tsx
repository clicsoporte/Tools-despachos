

"use client";

import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "../../../modules/core/hooks/usePageTitle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../../components/ui/accordion";
import { Code, FileUp, FileTerminal, Network, ShieldCheck, Users, Building, FileDown, PlusCircle, UserCog, DatabaseZap, Keyboard, DollarSign, ShieldQuestion, LifeBuoy, Rocket, Boxes, CalendarCheck, ShoppingCart, Truck, PackageCheck, Factory, CheckCircle, XCircle, ShieldAlert, Search, Wrench, Map, PackagePlus, BookMarked, Save, Copy, Folder, AlertTriangle, ToggleRight, FilePlusIcon, Warehouse, Send, Loader2, Play, Pause, History, Undo2, Info, BadgeInfo, CreditCard, MessageSquare, Trash2, Download, Briefcase, Store, ListChecks, Hourglass, Layers, UploadCloud, BarChartBig, Lightbulb, FileText, Calculator, PanelLeft, Mail, KeyRound, BellRing } from "lucide-react";
import { Skeleton } from "../../../components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// --- Helper Functions ---

// Normaliza el texto: lo convierte a minúsculas y elimina los acentos.
const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Componente para resaltar texto
const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) {
    return <>{text}</>;
  }
  const normalizedHighlight = normalizeText(highlight);

  const parts = text.split(new RegExp(`(${normalizedHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return (
    <>
      {parts.map((part, i) =>
        normalizeText(part).toLowerCase() === normalizedHighlight ? (
          <mark key={i} className="bg-yellow-300 p-0 m-0">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};


// Componente para una sección de ayuda individual
const HelpSection = ({ title, icon, content, searchTerm }: { title: string, icon: React.ReactNode, content: React.ReactNode, searchTerm: string }) => {
    
    const contentString = useMemo(() => {
        // Simple function to extract text from JSX for searching
        const getText = (node: React.ReactNode): string => {
            if (typeof node === 'string') return node;
            if (Array.isArray(node)) return node.map(getText).join(' ');
            if (typeof node === 'object' && node !== null && 'props' in node && node.props.children) {
                return getText(node.props.children);
            }
            return '';
        };
        return getText(content);
    }, [content]);

    const isVisible = useMemo(() => {
        const searchTerms = normalizeText(searchTerm).split(' ').filter(Boolean);
        if (searchTerms.length === 0) return true;

        const targetText = normalizeText(title + ' ' + contentString);
        return searchTerms.every(term => targetText.includes(term));
    }, [searchTerm, title, contentString]);

    if (!isVisible) {
        return null;
    }

    return (
        <AccordionItem value={title}>
            <AccordionTrigger className="text-lg font-semibold">
                <div className="flex items-center">
                    {icon}
                    <HighlightedText text={title} highlight={searchTerm} />
                </div>
            </AccordionTrigger>
            <AccordionContent className="prose max-w-none text-base">
                {content}
            </AccordionContent>
        </AccordionItem>
    );
};


export default function HelpPage() {
  const { setTitle } = usePageTitle();
  const { companyData } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  
  useEffect(() => {
    setTitle("Centro de Ayuda");
  }, [setTitle]);

  const helpSections = [
    {
        title: "Introducción al Sistema",
        icon: <Rocket className="mr-4 h-6 w-6 text-blue-500" />,
        content: (
            <>
                <p>
                ¡Bienvenido a <strong><HighlightedText text={companyData?.systemName || "la Aplicación"} highlight={searchTerm}/></strong>! Piensa en este sistema como tu navaja suiza digital para las tareas diarias de la empresa. Ha sido diseñado para ser súper rápido y fácil de usar desde cualquier computadora en la oficina.
                </p>
                <p>
                El objetivo es simple: tener todas las herramientas importantes (como hacer cotizaciones, solicitudes de compra o planificar la producción) en un solo lugar, con la flexibilidad de obtener datos tanto de archivos de texto como directamente desde el ERP.
                </p>
                 <Alert variant="default" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>¡Nuevo Panel Lateral Plegable!</AlertTitle>
                    <AlertDescription>
                        Ahora puedes hacer clic en el botón <span className="inline-flex items-center justify-center h-6 w-6 bg-primary/10 rounded-md"><PanelLeft className="h-4 w-4 text-primary" /></span> en la esquina superior izquierda para contraer el menú lateral y maximizar tu espacio de trabajo.
                    </AlertDescription>
                </Alert>
            </>
        )
    },
    {
        title: "Guía del Centro de Notificaciones",
        icon: <BellRing className="mr-4 h-6 w-6 text-yellow-500" />,
        content: (
             <div className="space-y-4">
                <p>
                El Centro de Notificaciones es el corazón de la comunicación proactiva de la aplicación. En lugar de que tengas que revisar constantemente los módulos, el sistema te avisará cuando algo requiera tu atención.
                </p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">¿Cómo Funciona?</h4>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Icono de Campana (<BellRing className="inline h-4 w-4"/>):</strong> Ubicado en la cabecera, este icono mostrará un punto rojo con un número que indica cuántas notificaciones tienes sin leer. Si llega una nueva, se animará sutilmente.
                    </li>
                    <li>
                        <strong>Panel de Notificaciones:</strong> Al hacer clic en la campana, se desplegará una lista con tus últimas notificaciones, ordenadas de la más reciente a la más antigua.
                    </li>
                    <li>
                        <strong>Redirección Inteligente:</strong> Cada notificación es un enlace. Al hacerle clic, te llevará directamente a la orden, solicitud o sección correspondiente.
                    </li>
                    <li>
                        <strong>Marcar como Leídas:</strong> Al hacer clic en una notificación, se marca automáticamente como leída. También puedes usar el botón &quot;Marcar todas como leídas&quot; para limpiar tu bandeja.
                    </li>
                </ul>

                <Alert variant="default" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Notificaciones Accionables</AlertTitle>
                    <AlertDescription>
                        Algunas notificaciones, como las de &quot;solicitud de cancelación&quot;, incluirán botones de acción rápida (ej: &quot;Aprobar&quot;, &quot;Rechazar&quot;). Esto te permite gestionar tareas críticas directamente desde el panel de notificaciones sin tener que navegar a la página específica.
                    </AlertDescription>
                </Alert>
            </div>
        )
    },
    {
        title: "Guía Crítica: Sincronización de Datos del ERP",
        icon: <DatabaseZap className="mr-4 h-6 w-6 text-cyan-500" />,
        content: (
            <div className="space-y-4">
                <p>
                Esta es una de las funcionalidades más importantes. Permite que la aplicación se mantenga al día con los datos maestros de tu sistema ERP (clientes, productos, inventario, etc.). Se gestiona desde <strong>Administración &gt; Importar Datos</strong> y tiene dos modos de funcionamiento.
                </p>

                <h4 className="font-semibold text-lg pt-2 border-t">Modo 1: Importación desde Archivos</h4>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>¿Cómo funciona?:</strong> Debes generar archivos de texto plano (`.txt` o `.csv`) desde tu ERP y colocarlos en una carpeta en el servidor. Luego, en la pantalla de importación, le dices a la aplicación la ruta completa de cada archivo.
                    </li>
                    <li>
                        <strong>Ventajas:</strong> Es un método robusto y sencillo de configurar, ideal si no quieres dar acceso directo a tu base de datos del ERP.
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">Modo 2: Sincronización desde SQL Server (Recomendado)</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>¿Cómo funciona?:</strong> En lugar de archivos, la aplicación se conecta directamente a la base de datos de tu ERP (usando un usuario de **solo lectura**) y ejecuta consultas `SELECT` para traer los datos.
                    </li>
                     <li>
                        <strong>¿Cómo se configura?:</strong> Un administrador debe ir a <strong>Administración &gt; Importar Datos</strong> y:
                        <ol className="list-decimal space-y-2 pl-5 mt-2">
                            <li>Activar el interruptor a &quot;Importar desde SQL Server&quot;.</li>
                            <li>Ingresar las credenciales de la base de datos (servidor, usuario, contraseña, etc.).</li>
                            <li>Pegar las consultas `SELECT` específicas para cada tipo de dato (clientes, artículos, etc.) en el &quot;Gestor de Consultas&quot;.</li>
                        </ol>
                    </li>
                    <li>
                        <strong>Ventajas:</strong> Es más rápido, directo y elimina la necesidad de generar archivos manually.
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">¿Qué es el Botón &quot;Sincronizar ERP&quot;?</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>Este botón, visible en el encabezado para usuarios con permisos, ejecuta el proceso de importación completo (ya sea desde archivos o SQL) en segundo plano.</li>
                    <li>
                        <strong>Alerta de Sincronización Antigua (<AlertTriangle className="inline h-4 w-4 text-red-600"/>):</strong> Si ha pasado mucho tiempo desde la última sincronización (el tiempo es configurable en Administración &gt; General), el indicador &quot;Última Sinc&quot; y el botón de sincronización se pondrán en **rojo y parpadearán**. Esto es una alerta visual crítica que te indica que los datos de la aplicación (como precios o inventario) pueden estar desactualizados.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Guía de Seguridad: Recuperación de Contraseña",
        icon: <KeyRound className="mr-4 h-6 w-6 text-fuchsia-600" />,
        content: (
            <div className="space-y-4">
                <p>
                Para mejorar la seguridad y la autonomía del usuario, el sistema ahora incluye un flujo completo para recuperar el acceso a una cuenta.
                </p>

                <h4 className="font-semibold text-lg pt-2 border-t">Configuración para Administradores</h4>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Paso 1: Configurar el SMTP.</strong> Para que el sistema pueda enviar correos, un administrador debe ir a <strong>Administración &gt; Configuración de Correo</strong>.
                    </li>
                    <li>
                        <strong>Campos Requeridos:</strong> Se deben ingresar los datos del servidor de correo de la empresa (Host, Puerto, Usuario, Contraseña y Seguridad). Estos datos se guardan de forma segura.
                    </li>
                     <li>
                        <strong>Plantilla Personalizable:</strong> En esta misma pantalla, se puede personalizar el **asunto y el cuerpo del correo** de recuperación, usando `[NOMBRE_USUARIO]` y `[CLAVE_TEMPORAL]` como placeholders.
                    </li>
                    <li>
                        <strong>Prueba de Conexión:</strong> Es crucial usar el botón **&quot;Enviar Correo de Prueba&quot;** para verificar que la configuración sea correcta.
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Recuperación para Usuarios</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Olvidé mi contraseña:</strong> En la pantalla de login, el usuario hace clic en el enlace, ingresa su correo y el sistema le envía una **contraseña temporal**.
                    </li>
                    <li>
                        <strong>Inicio de Sesión Forzado:</strong> Al ingresar con la contraseña temporal, la misma tarjeta de login se transforma y le pide al usuario que establezca una **nueva contraseña personal**.
                    </li>
                    <li>
                        <strong>Proceso Finalizado:</strong> Una vez que establece su nueva contraseña, se le informa que el cambio fue exitoso y se le pide que vuelva a la pantalla de login para ingresar normalmente.
                    </li>
                </ul>

                 <h4 className="font-semibold text-lg pt-2 border-t">Creación de Nuevos Usuarios</h4>
                 <ul className="list-disc space-y-3 pl-6">
                    <li>Al crear un nuevo usuario, el administrador ahora tiene una casilla: **&quot;Forzar cambio de contraseña en el próximo inicio de sesión&quot;**.</li>
                    <li>Si se marca, el nuevo usuario seguirá el mismo flujo de cambio de contraseña forzado la primera vez que ingrese, asegurando que establezca una clave personal y segura.</li>
                 </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Buzón de Sugerencias",
        icon: <MessageSquare className="mr-4 h-6 w-6 text-green-600" />,
        content: (
             <div className="space-y-4">
                <p>
                Esta es una herramienta de comunicación directa para mejorar la aplicación. Todos los usuarios pueden participar.
                </p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Enviar una Sugerencia:</strong> En el panel principal, haz clic en el botón verde <strong>&quot;Sugerencias y Mejoras&quot;</strong> (<MessageSquare className="inline h-4 w-4" />). Se abrirá una ventana donde podrás escribir tu idea, reportar un problema o proponer una mejora. Al enviarla, los administradores serán notificados.
                    </li>
                    <li>
                        <strong>Gestión para Administradores:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Los administradores verán un contador de sugerencias no leídas en el botón de &quot;Configuración&quot; del menú lateral.</li>
                            <li>Dentro de <strong>Administración &gt; Buzón de Sugerencias</strong>, podrán ver todas las sugerencias enviadas, quién las envió y cuándo.</li>
                            <li>Las sugerencias nuevas aparecen resaltadas. Pueden marcarlas como leídas (<CheckCircle className="inline h-4 w-4 text-green-600"/>) o eliminarlas (<Trash2 className="inline h-4 w-4 text-red-600"/>).</li>
                        </ul>
                    </li>
                </ul>
            </div>
        )
    },
     {
        title: "Guía Maestra: Asistente de Costos",
        icon: <Calculator className="mr-4 h-6 w-6 text-orange-500" />,
        content: (
            <div className="space-y-4">
                <p>Esta herramienta te ayuda a calcular los precios de venta de tus productos importados, tomando en cuenta todos los costos asociados a una compra.</p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Trabajo del Asistente</h4>
                <ol className="list-decimal space-y-4 pl-6">
                    <li>
                        <strong>Paso 1: Cargar Facturas XML (<UploadCloud className="inline h-4 w-4"/>).</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Usa el botón &quot;Cargar Facturas XML&quot; para seleccionar una o varias facturas de compra en formato XML de Hacienda. El sistema extraerá automáticamente todos los artículos, cantidades y costos.</li>
                            <li>Verás las facturas procesadas en la tarjeta de &quot;Facturas Procesadas&quot;, indicando si la extracción fue exitosa o si hubo algún error (ej. XML malformado).</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 2: Añadir Costos y Manejar Descuentos.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Ingresa el costo total de **Transporte** y de **Otros Costos** (como aduanas, comisiones, etc.). El sistema **prorrateará** estos costos automáticamente entre todos los artículos cargados.</li>
                            <li>**Manejo de Descuentos:** En la misma tarjeta, puedes decidir cómo tratar los descuentos de la factura: si se aplican para **reducir el costo** del producto (beneficiando al cliente final) o si se consideran como **parte de la ganancia** de la empresa.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 3: Ajustar y Calcular Precios.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>En la tabla de &quot;Artículos Extraídos&quot;, puedes editar la mayoría de los campos.</li>
                            <li><strong>Costo Unit. (s/IVA):</strong> Este es el costo real del artículo (costo de factura + costo prorrateado +/- efecto del descuento). Puedes **sobrescribirlo manually** si necesitas ajustar el costo base para un artículo específico.</li>
                            <li><strong>Imp. %:</strong> El sistema extrae el impuesto del XML, pero puedes editarlo aquí si es necesario (ej. de &quot;13&quot; a &quot;1&quot;).</li>
                            <li><strong>Margen:</strong> Introduce el margen de ganancia deseado (ej. &quot;20&quot; para un 20%).</li>
                            <li>El sistema calculará automáticamente el **P.V.P. Unitario Sugerido** y la **Ganancia por Línea** en tiempo real.</li>
                        </ul>
                    </li>
                     <li>
                        <strong>Paso 4: Guardar o Exportar.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li><strong>Guardar Borrador (<Save className="inline h-4 w-4"/>):</strong> Si necesitas continuar más tarde, guarda tu análisis como un borrador. Podrás cargarlo desde el botón &quot;Cargar Borradores&quot;.</li>
                            <li><strong>Exportar para ERP (<FileDown className="inline h-4 w-4"/>):</strong> Cuando los precios estén listos, haz clic en este botón. Se generará un archivo **Excel (.xlsx)** con el formato exacto para ser importado directamente en tu ERP, actualizando o creando los nuevos precios de venta.</li>
                        </ul>
                    </li>
                </ol>
            </div>
        )
    },
    {
        title: "Guía Maestra: Módulo Cotizador",
        icon: <DollarSign className="mr-4 h-6 w-6 text-green-500" />,
        content: (
             <div className="space-y-4">
                <p>Esta es tu herramienta principal para crear y enviar cotizaciones profesionales a los clientes. Su diseño está optimizado para la velocidad y la precisión.</p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Flujo de Trabajo Recomendado</h4>
                <ol className="list-decimal space-y-4 pl-6">
                    <li>
                        <strong>Paso 1: Seleccionar al Cliente y Verificar su Información.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Empieza a escribir el nombre, código o cédula del cliente en el campo &quot;Buscar Cliente&quot;. El sistema te mostrará una lista de sugerencias. Haz clic o presiona `Enter` para seleccionarlo.</li>
                            <li>Al seleccionar, aparecerá una tarjeta con los <strong>datos críticos del ERP</strong> (<CreditCard className="inline h-4 w-4"/>): cédula, límite de crédito, condición de pago y vendedor asignado. Esto te da una visión instantánea del estado del cliente.</li>
                            <li><strong>Verificar Exoneración (<ShieldQuestion className="inline h-4 w-4" />):</strong> Si el cliente tiene una exoneración en el ERP, aparecerá una segunda tarjeta. El sistema consultará a Hacienda **en tiempo real** y te mostrará dos estados para que los compares: el del ERP y el de Hacienda. Esto te permite confirmar si la exoneración sigue vigente antes de aplicarla.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 2: Agregar Productos y Consultar Detalles.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>En el campo &quot;Agregar Producto&quot;, busca por código o descripción. El sistema te sugerirá productos y te mostrará el **inventario actual del ERP** entre paréntesis.</li>
                            <li>Presiona `Enter` o haz clic para añadir el producto a la cotización. El sistema aplicará el impuesto automáticamente (13% por defecto, 1% para canasta básica, o 0% si el cliente tiene una exoneración válida).</li>
                            <li><strong>Consultar Info del Producto (<BadgeInfo className="inline h-4 w-4"/>):</strong> Haz clic en cualquier parte de la fila de un producto ya agregado. Aparecerá una tarjeta con información detallada del ERP: su <strong>clasificación</strong>, la <strong>fecha del último ingreso</strong> y notas importantes.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 3: Ajustar Cantidades y Precios.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Modifica directamente los campos de cantidad y precio.</li>
                            <li><strong>Atajos de Teclado (<Keyboard className="inline h-4 w-4" />):</strong> Usa la tecla `Enter` en los campos &quot;Cantidad&quot; y &quot;Precio&quot;. El sistema te moverá eficientemente: de Cantidad a Precio, y de Precio de vuelta al buscador de productos para que puedas seguir añadiendo artículos sin usar el mouse.</li>
                            <li><strong>Uso en Móviles:</strong> En pantallas pequeñas, los campos de Cantidad y Precio ahora tienen más espacio. Si necesitas ver otras columnas como &quot;Cabys&quot; o &quot;Unidad&quot;, puedes activarlas desde los checkboxes que aparecen encima de la tabla.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 4: Finalizar y Generar.</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Ajusta las condiciones de pago, la validez de la oferta y añade cualquier nota adicional.</li>
                            <li><strong>Borradores (<Folder className="inline h-4 w-4" />):</strong> Si no terminaste, guarda la cotización como borrador. Puedes cargarla más tarde desde el botón &quot;Ver Borradores&quot;.</li>
                            <li><strong>Generar PDF (<FileDown className="inline h-4 w-4" />):</strong> Cuando todo esté listo, genera el PDF. El número de cotización se actualizará automáticamente para la próxima vez.</li>
                        </ul>
                    </li>
                </ol>
            </div>
        )
    },
    {
        title: "Tutorial: Módulo Solicitud de Compra",
        icon: <ShoppingCart className="mr-4 h-6 w-6 text-yellow-500" />,
        content: (
            <div className="space-y-4">
                <p>Esta herramienta te permite crear, gestionar y dar seguimiento a las solicitudes de compra internas de manera centralizada.</p>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Flujo 1: Creación Manual</h4>
                <ol className="list-decimal space-y-3 pl-6">
                <li>
                    <strong>Paso 1: Crear Solicitud (<FilePlusIcon className="inline h-4 w-4" />):</strong> Haz clic en &quot;Nueva Solicitud&quot; para abrir el formulario. Busca al cliente y el artículo de la misma forma que en el cotizador. Completa los campos como la cantidad requerida, la fecha en que lo necesitas y el proveedor (si lo conoces).
                </li>
                <li>
                    <strong>Paso 2: Entender el Flujo de Estados.</strong> Las solicitudes pasan por varios estados para un seguimiento claro:
                    <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                        <li><strong>Pendiente:</strong> La solicitud ha sido creada y está esperando revisión.</li>
                        <li><strong>Revisión Compras:</strong> El equipo de compras está revisando la solicitud. Desde aquí, pueden **regresar a Pendiente** si se necesita una corrección.</li>
                        <li><strong>Pendiente Aprobación:</strong> La solicitud ha sido enviada para su aprobación final. Desde aquí, se puede **regresar a Revisión Compras**.</li>
                        <li><strong>Aprobada (<CheckCircle className="inline h-4 w-4 text-green-600"/>):</strong> Un usuario con permisos ha aprobado la compra.</li>
                        <li><strong>Ordenada (<Truck className="inline h-4 w-4 text-blue-600"/>):</strong> Ya se realizó el pedido al proveedor.</li>
                        <li><strong>Recibida (<PackageCheck className="inline h-4 w-4 text-teal-600"/>):</strong> (Paso opcional) El producto ha llegado.</li>
                        <li><strong>En Bodega (<Warehouse className="inline h-4 w-4 text-gray-700"/>):</strong> (Paso opcional) El producto ya está en el almacén físico.</li>
                        <li><strong>Ingresado en ERP (<DatabaseZap className="inline h-4 w-4 text-indigo-600"/>):</strong> (Paso opcional) El ingreso de la mercancía se ha registrado en el ERP.</li>
                        <li><strong>Cancelada (<XCircle className="inline h-4 w-4 text-red-600"/>):</strong> La solicitud ha sido cancelada.</li>
                    </ul>
                </li>
                </ol>

                <h4 className="font-semibold text-lg pt-2 border-t">Flujo 2: Creación Inteligente desde Pedido ERP</h4>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>Paso 1: Iniciar el Proceso (<Layers className="inline h-4 w-4"/>):</strong> Haz clic en el nuevo botón &quot;Crear desde Pedido ERP&quot;.
                    </li>
                    <li>
                        <strong>Paso 2: Buscar el Pedido:</strong> En la ventana emergente, introduce el número de pedido de venta de tu ERP (ej: PE0000125972) y haz clic en &quot;Cargar Pedido&quot;. El sistema consultará el ERP en tiempo real.
                    </li>
                    <li>
                        <strong>Paso 3: Selección Inteligente:</strong> Se abrirá una nueva ventana con una tabla de todos los artículos del pedido. Aquí ocurre la magia:
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Las filas en <span className="text-red-600 font-semibold">rojo</span> indican que la cantidad pedida es **mayor** al inventario actual del ERP. Estas filas vendrán **marcadas por defecto** para ser compradas.</li>
                            <li>Las filas en <span className="text-green-600 font-semibold">verde</span> indican que **hay suficiente stock**. Estarán desmarcadas por defecto.</li>
                            <li>Puedes **editar la cantidad a solicitar y el precio de venta** directamente en la tabla.</li>
                            <li>Usa los checkboxes para anular las sugerencias y decidir manually qué comprar.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Paso 4: Crear Solicitudes en Lote:</strong> Al hacer clic en &quot;Crear Solicitudes&quot;, el sistema generará automáticamente una solicitud de compra **independiente para cada artículo que hayas marcado**, usando las cantidades y precios que definiste.
                    </li>
                </ol>
                
                <h4 className="font-semibold text-lg pt-2 border-t">Funcionalidades Comunes</h4>
                <ul className="list-disc space-y-3 pl-6">
                <li>
                    <strong>Visibilidad por Defecto:</strong> Por seguridad y claridad, la vista de solicitudes siempre mostrará por defecto solo los documentos que tú has creado. Si tienes el permiso `requests:read:all`, podrás desmarcar la casilla &quot;Mostrar solo mis solicitudes&quot; para ver las de todos los usuarios.
                </li>
                <li>
                    <strong>Aviso de &quot;Modificado&quot; (<AlertTriangle className="inline h-4 w-4 text-red-600" />):</strong> Si una solicitud es editada (cambiando cantidad, fecha, etc.) *después* de haber sido Aprobada u Ordenada, aparecerá una alerta visual &quot;Modificado&quot;. Esto sirve como una advertencia para que todos los involucrados estén al tanto del cambio.
                </li>
                 <li>
                    <strong>Alerta de Duplicados (<Info className="inline h-4 w-4 text-amber-500" />):</strong> Al crear una solicitud, si el sistema detecta que ya existen otras solicitudes activas (pendientes, aprobadas u ordenadas) para el mismo artículo, te mostrará una advertencia para evitar compras duplicadas.
                </li>
                <li>
                    <strong>Solicitar Cancelación:</strong> Si una solicitud ya está Aprobada u Ordenada, no se puede cancelar directamente. En su lugar, un usuario con permisos puede &quot;Solicitar Cancelación&quot;. Esto pone la solicitud en un estado de espera y notifica a un administrador, quien debe aprobar o rechazar la cancelación, dejando un registro del motivo.
                </li>
                <li>
                    **Exportación:** Puedes generar un archivo **PDF** o **Excel (.xlsx)** del reporte actual.
                </li>
                </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Módulo Planificador OP",
        icon: <CalendarCheck className="mr-4 h-6 w-6 text-purple-500" />,
        content: (
             <div className="space-y-4">
                <p>
                Organiza y visualiza la carga de trabajo del taller o la producción. Permite un seguimiento detallado de cada orden.
                </p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        **Visibilidad por Defecto:** Al igual que en Compras, el planificador te mostrará por defecto solo las órdenes que tú has creado. Los usuarios con el permiso `planner:read:all` pueden desmarcar el filtro para tener una vista global de la producción.
                    </li>
                    <li>
                        **Paso 1: Crear Órdenes.** Similar a los otros módulos, crea una nueva orden de producción buscando al cliente y el producto. Establece la cantidad, la fecha de entrega y la prioridad.
                         <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>**Alerta de Duplicados (<Info className="inline h-4 w-4 text-amber-500" />):** Al seleccionar un producto, el sistema te avisará si ya existen otras órdenes de producción activas para ese mismo artículo, ayudándote a evitar duplicar trabajo.</li>
                        </ul>
                    </li>
                    <li>
                        **Paso 2: Flujo de Estados y Trazabilidad.**
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>**Pendiente:** La orden ha sido creada y espera aprobación.</li>
                            <li>**Aprobada (<CheckCircle className="inline h-4 w-4 text-green-600"/>):** La orden está autorizada para producción.</li>
                            <li>**En Cola (<Hourglass className="inline h-4 w-4 text-cyan-600"/>):** La orden está lista, esperando que se libere un recurso (ej: una máquina) para poder iniciar.</li>
                            <li>**En Progreso (<Play className="inline h-4 w-4 text-blue-600"/>):** La orden se está produciendo activamente.</li>
                            <li>**En Espera / Mantenimiento (<Pause className="inline h-4 w-4 text-gray-600"/>):** La producción se detuvo temporalmente.</li>
                            <li>**Completada (<PackageCheck className="inline h-4 w-4 text-teal-600"/>):** La producción ha finalizado.</li>
                            <li>**En Bodega (<Warehouse className="inline h-4 w-4 text-gray-700"/>):** (Paso opcional) El producto terminado ya está en el almacén.</li>
                        </ul>
                    </li>
                    <li>
                        **Paso 3: Alertas y Solicitudes de Cambio.**
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>**Aviso de &quot;Modificado&quot; (<AlertTriangle className="inline h-4 w-4 text-red-600" />):** Si una orden se edita después de ser aprobada, aparecerá esta alerta para notificar a todos sobre el cambio.</li>
                            <li>**Solicitar Desaprobación (<Undo2 className="inline h-4 w-4 text-orange-600"/>):** Si una orden ya aprobada necesita un cambio mayor (ej: cambiar de producto), un usuario puede &quot;Solicitar Desaprobación&quot;. Esto bloquea la orden y requiere que un administrador la apruebe o rechace para devolverla al estado &quot;Pendiente&quot;.</li>
                            <li>**Solicitar Cancelación (<XCircle className="inline h-4 w-4 text-red-600"/>):** Similar a la desaprobación, permite pedir la cancelación de una orden que ya está en el flujo, requiriendo aprobación administrativa.</li>
                        </ul>
                    </li>
                    <li>
                        **Paso 4: Programación y Prioridades.**
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>**Programación por Rango:** Haz clic en el área de &quot;Fecha Programada&quot; para abrir un calendario y seleccionar un rango de fechas de inicio y fin.</li>
                            <li>**Asignación:** Asigna cada orden a una máquina, proceso u operario específico desde el menú desplegable. Estas opciones se configuran en Administración.</li>
                            <li>**Gestión de Turnos:** Asigna la orden a un turno de trabajo específico. Los turnos disponibles se pueden personalizar completamente en **Administración &gt; Config. Planificador**.</li>
                            <li>**Prioridades y Cuenta Regresiva:** Usa el selector de prioridad y fíjate en el indicador de días restantes (basado en la fecha de entrega) para organizar el trabajo.</li>
                        </ul>
                    </li>
                    <li>
                        **Exportación:** Puedes generar un archivo **PDF** o **Excel (.xlsx)** del reporte actual.
                    </li>
                    <li>
                        **Historial (<History className="inline h-4 w-4"/>):** Haz clic en el icono de historial en cualquier orden para ver un registro detallado de cada cambio de estado, quién lo hizo y cuándo.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Módulo de Analíticas",
        icon: <BarChartBig className="mr-4 h-6 w-6 text-indigo-500" />,
        content: (
            <div className="space-y-4">
                <p>
                Este es el centro de inteligencia de la aplicación. Agrupa herramientas que analizan los datos del ERP y del sistema para ayudarte a tomar decisiones más inteligentes.
                </p>
                <h4 className="font-semibold text-lg pt-2 border-t">Sugerencias de Compra Proactivas (<Lightbulb className="inline h-5 w-5 text-yellow-400"/>)</h4>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>¿Qué hace?:</strong> Esta herramienta revisa todos los pedidos de venta del ERP dentro de un rango de fechas, los compara con el inventario actual y te dice exactamente qué artículos te hacen falta para cumplir con esos pedidos.
                    </li>
                    <li>
                        <strong>¿Cómo se usa?:</strong>
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Selecciona un rango de fechas de los pedidos del ERP que quieres analizar y haz clic en &quot;Analizar Pedidos&quot;.</li>
                            <li>El sistema te mostrará una tabla con los artículos faltantes. Para cada artículo, verás la cantidad total que necesitas, cuánto tienes en inventario, y el faltante exacto.</li>
                            <li>**Ordena los resultados:** Haz clic en el encabezado de cualquier columna (ej: &quot;Próxima Entrega&quot; o &quot;Faltante Total&quot;) para ordenar la tabla según ese criterio. Una flecha te indicará el orden actual.</li>
                            <li>También verás información clave como los **clientes involucrados** y la **próxima fecha de entrega** que debes cumplir.</li>
                            <li>Usa los filtros de búsqueda y de clasificación (que ahora permite **selección múltiple**) para refinar la lista.</li>
                            <li>Marca los artículos que quieres comprar, y haz clic en **&quot;Crear Solicitudes&quot;** para generar todas las solicitudes de compra de forma automática. El sistema te advertirá si estás a punto de crear una solicitud duplicada.</li>
                            <li>Puedes exportar esta vista a **Excel** para un análisis más profundo.</li>
                        </ul>
                    </li>
                </ol>
            </div>
        )
    },
     {
        title: "Tutorial: Módulo de Almacenes",
        icon: <Warehouse className="mr-4 h-6 w-6 text-cyan-600" />,
        content: (
             <div className="space-y-4">
                <p>Este módulo te da control sobre la ubicación de tu inventario. Su configuración, aunque potente, puede ser confusa al principio. Se basa en un concepto de dos pasos: el <strong>Molde</strong> y el <strong>Árbol</strong>.</p>
                
                <ul className="list-none space-y-3 pl-0">
                    <li>
                        <strong className="text-base">1. El Molde (Definir Jerarquía):</strong> Aquí le dices al sistema cómo organizas tu almacén, pero sin crear nada real todavía. Es solo la plantilla. Por ejemplo: le dices que usas &quot;Bodegas&quot;, que dentro de ellas hay &quot;Pasillos&quot;, y que en los pasillos hay &quot;Racks&quot;.
                    </li>
                    <li>
                        <strong className="text-base">2. El Árbol (Crear Ubicaciones Reales):</strong> Una vez que tienes el &quot;molde&quot;, aquí es donde creas el árbol real de tu almacén. Aquí es donde dices: &quot;Ok, voy a crear una ubicación de tipo `Bodega` y se va a llamar `Bodega 04`&quot;. Luego, &quot;dentro de Bodega 04, voy a crear una ubicación de tipo `Pasillo` y se va a llamar `Pasillo Bolsas 01`&quot;, y así sucesivamente.
                    </li>
                </ul>

                <h4 className="font-semibold text-lg pt-4 border-t">Tutorial Práctico: Configurando tu Almacén desde Cero</h4>
                <p>Usemos un ejemplo real: tienes una bodega (`04`), con un pasillo (`01`) entre dos racks (`01` y `02`).</p>

                <h5 className="font-semibold">Paso 1: Crear el &quot;Molde&quot; (La Jerarquía)</h5>
                <ol className="list-decimal space-y-2 pl-6">
                    <li>Ve a <strong>Administración &gt; Config. Almacenes</strong>.</li>
                    <li>En la sección <strong>&quot;Paso 1: Definir Jerarquía del Almacén&quot;</strong>, borra los niveles que existan.</li>
                    <li>Añade, en orden, los siguientes niveles:
                        <ul className="list-[circle] space-y-1 pl-5 mt-2">
                            <li>Bodega</li>
                            <li>Pasillo</li>
                            <li>Rack</li>
                        </ul>
                    </li>
                    <li>Haz clic en <strong>Guardar Niveles</strong>.</li>
                </ol>

                <h5 className="font-semibold">Paso 2: Construir el &quot;Árbol&quot; (Las Ubicaciones Reales)</h5>
                <p>Ahora, en la sección <strong>&quot;Paso 2: Crear Ubicaciones Reales&quot;</strong>, vamos a construir el almacén pieza por pieza:</p>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>Crear la Bodega:</strong>
                        <ul className="list-[circle] space-y-1 pl-5 mt-2 text-sm">
                            <li>Haz clic en <strong>&quot;Añadir Ubicación&quot;</strong>.</li>
                            <li><strong>Nombre:</strong> `Bodega 04`, <strong>Código:</strong> `B04`.</li>
                            <li><strong>Tipo de Ubicación:</strong> `Nivel 1: Bodega`.</li>
                            <li><strong>Ubicación Padre:</strong> Déjalo en `Sin padre`.</li>
                            <li>Guarda. Ya tienes la raíz de tu árbol.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Crear el Pasillo:</strong>
                        <ul className="list-[circle] space-y-1 pl-5 mt-2 text-sm">
                            <li>Haz clic de nuevo en <strong>&quot;Añadir Ubicación&quot;</strong>.</li>
                            <li><strong>Nombre:</strong> `Pasillo 01`, <strong>Código:</strong> `P01`.</li>
                            <li><strong>Tipo de Ubicación:</strong> `Nivel 2: Pasillo`.</li>
                            <li><strong>Ubicación Padre:</strong> Selecciona `Bodega 04`.</li>
                            <li>Guarda. Verás que `Pasillo 01` aparece anidado debajo de `Bodega 04`.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Crear los Racks:</strong> Repite el proceso para crear `Rack 01` (Código `R01`) y `Rack 02` (Código `R02`), ambos de tipo `Nivel 3: Rack` y ambos con `Pasillo 01` como padre.
                    </li>
                </ol>
                <p className="pt-2">Una vez configurado, puedes ir al módulo <strong>Asignar Inventario</strong> para empezar a colocar tus artículos en estas nuevas ubicaciones.</p>
            </div>
        )
    },
    {
        title: "Tutorial: Consultas a Hacienda",
        icon: <Search className="mr-4 h-6 w-6 text-indigo-500" />,
        content: (
            <div className="space-y-4">
                <p>
                Esta herramienta te permite consultar información directamente de las APIs del Ministerio de Hacienda de Costa Rica de forma centralizada.
                </p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Búsqueda Unificada:</strong> Es la forma más potente de usar el módulo. Busca un cliente del ERP y el sistema hará todo el trabajo:
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Consultará la <strong>Situación Tributaria</strong> del cliente usando su cédula.</li>
                            <li>Buscará si tiene una <strong>exoneración asociada en el ERP</strong>.</li>
                            <li>Si la encuentra, consultará esa exoneración en Hacienda para ver su <strong>estado y los códigos CABYS</strong> que cubre.</li>
                            <li>Te presentará toda la información consolidada en una sola pantalla.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Búsquedas Individuales:</strong> También puedes usar las pestañas &quot;Situación Tributaria&quot; y &quot;Exoneraciones&quot; para hacer consultas directas a Hacienda ingresando una cédula o un número de autorización, respectivamente.
                    </li>
                </ul>
            </div>
        )
    },
    {
        title: "Tutorial: Mi Perfil",
        icon: <UserCog className="mr-4 h-6 w-6 text-blue-500" />,
        content: (
            <div className="flex items-start gap-4">
                <UserCog className="mt-1 h-6 w-6 text-blue-500 shrink-0" />
                <div>
                    <p>
                    Aquí puedes personalizar tu propia cuenta de usuario.
                    </p>
                    <ul className="list-disc space-y-2 pl-6">
                        <li>Actualiza tu nombre, teléfono y WhatsApp.</li>
                        <li>Cambia tu foto de perfil haciendo clic sobre el círculo con tus iniciales.</li>
                        <li>Cambia tu contraseña.</li>
                        <li>Configura una pregunta de seguridad para poder recuperar tu cuenta si olvidas la contraseña.</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        title: "Guía Técnica: Panel de Administración (Configuración)",
        icon: <Wrench className="mr-4 h-6 w-6 text-slate-600" />,
        content: (
            <div className="space-y-4">
                <p>
                Esta es la sala de máquinas del sistema, accesible solo para administradores. Aquí se configura todo el comportamiento de la aplicación, módulo por módulo.
                </p>
                <div className="space-y-4">
                    <div className="flex items-start gap-4">
                        <Users className="mt-1 h-6 w-6 text-blue-500 shrink-0" />
                        <div><h4 className="font-semibold">Gestión de Usuarios</h4><p>Permite crear, editar, eliminar y asignar roles a las cuentas de usuario. Incluye la opción de forzar el cambio de contraseña para nuevos usuarios.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <ShieldCheck className="mt-1 h-6 w-6 text-green-500 shrink-0" />
                        <div><h4 className="font-semibold">Gestión de Roles</h4><p>Define qué puede hacer cada usuario. Puedes crear roles personalizados (ej: &quot;Supervisor&quot;) y asignar permisos granulares para cada módulo.</p></div>
                    </div>
                     <div className="flex items-start gap-4">
                        <Mail className="mt-1 h-6 w-6 text-purple-600 shrink-0" />
                        <div><h4 className="font-semibold">Configuración de Correo</h4><p>Configura tu servidor de correo (SMTP) para habilitar el envío de notificaciones y la recuperación de contraseñas. Permite personalizar las plantillas de los correos.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Briefcase className="mt-1 h-6 w-6 text-orange-500 shrink-0" />
                        <div><h4 className="font-semibold">Configuración General</h4><p>Establece la identidad de tu empresa (nombre, logo, etc.) y ajusta parámetros globales como el tiempo de espera de la búsqueda o las horas para la alerta de sincronización.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <MessageSquare className="mt-1 h-6 w-6 text-green-600 shrink-0" />
                        <div><h4 className="font-semibold">Buzón de Sugerencias</h4><p>Revisa el feedback enviado por los usuarios a través del botón &quot;Sugerencias y Mejoras&quot;.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <DollarSign className="mt-1 h-6 w-6 text-emerald-600 shrink-0" />
                        <div><h4 className="font-semibold">Config. Cotizador</h4><p>Ajusta el comportamiento del Cotizador, definiendo el prefijo y el número con el que iniciará la siguiente cotización.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Calculator className="mt-1 h-6 w-6 text-orange-600 shrink-0" />
                        <div><h4 className="font-semibold">Config. Asist. Costos</h4><p>Gestionar ajustes para el asistente de costos.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Factory className="mt-1 h-6 w-6 text-purple-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Planificador</h4><p>Personaliza el Planificador, incluyendo los nombres de &quot;máquinas&quot;, los turnos de trabajo y las columnas a exportar en PDF.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Store className="mt-1 h-6 w-6 text-amber-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Compras</h4><p>Define las rutas de entrega, métodos de envío y activa pasos opcionales en el flujo de aprobación como &quot;Recibido en Bodega&quot; o &quot;Ingresado en ERP&quot;.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Map className="mt-1 h-6 w-6 text-teal-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Almacenes</h4><p>Define la estructura jerárquica de tu bodega (Paso 1) y luego crea las ubicaciones físicas reales que la componen (Paso 2).</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Boxes className="mt-1 h-6 w-6 text-green-700 shrink-0" />
                        <div><h4 className="font-semibold">Config. Inventario</h4><p>Gestiona las bodegas del sistema. Puedes añadir nuevas bodegas, marcar una como predeterminada o decidir si una bodega debe ser visible en los desgloses de inventario.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <FileUp className="mt-1 h-6 w-6 text-cyan-500 shrink-0" />
                        <div>
                            <h4 className="font-semibold">Importar Datos</h4>
                            <p>Sincroniza los datos maestros (clientes, productos, etc.) desde tu ERP. Tienes dos modos: por <strong>Archivos</strong> (cargando .txt o .csv) o por <strong>SQL Server</strong> (conectando directamente a la base de datos de tu ERP).</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <DatabaseZap className="mt-1 h-6 w-6 text-red-500 shrink-0" />
                        <div><h4 className="font-semibold">Mantenimiento</h4>
                            <p>Herramientas críticas, ahora separadas en secciones para mayor claridad y seguridad:</p>
                            <ul className="list-disc pl-5 text-sm space-y-1 mt-2">
                                <li><strong>Backups y Puntos de Restauración:</strong> Gestiona backups de **todo el sistema**. Crea un &quot;Punto de Restauración&quot; antes de una actualización y restáuralo si algo sale mal.</li>
                                <li><strong>Zona de Peligro:</strong> Acciones que afectan módulos **individuales**. Aquí puedes restaurar la base de datos de un solo módulo (ej: `planner.db`) desde un archivo que subas, o resetear un módulo a su estado de fábrica. Estas acciones requieren confirmación estricta para evitar accidentes.</li>
                            </ul>
                        </div>
                    </div>
                    <div className="flex items-start gap-4">
                        <Network className="mt-1 h-6 w-6 text-indigo-500 shrink-0" />
                        <div><h4 className="font-semibold">Configuración de API</h4><p>Define las URLs de los servicios externos que utiliza la aplicación, como las APIs de Hacienda para consultar el tipo de cambio, la situación tributaria y el estado de las exoneraciones.</p></div>
                    </div>
                    <div className="flex items-start gap-4">
                        <FileTerminal className="mt-1 h-6 w-6 text-slate-500 shrink-0" />
                        <div><h4 className="font-semibold">Visor de Eventos</h4>
                            <p>Un registro (log) de todo lo que sucede en el sistema. Es una herramienta invaluable para diagnosticar problemas. Permite filtrar y limpiar los registros de forma granular (Operativos vs. Sistema) y conserva por defecto los últimos 30 días, a menos que se indique lo contrario.</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        title: "Guía Técnica: ¿Cómo se actualiza la aplicación?",
        icon: <Wrench className="mr-4 h-6 w-6 text-slate-600" />,
        content: (
            <div className="space-y-4">
                <p>Actualizar la aplicación a una nueva versión sin perder tus datos es un proceso crítico. El sistema está diseñado para manejar esto de forma segura gracias a las **migraciones automáticas**.</p>
                
                <h4 className="font-semibold">Proceso de Actualización Seguro:</h4>
                <ol className="list-decimal space-y-3 pl-6">
                    <li>
                        <strong>Paso 1: Realizar una Copia de Seguridad (<Copy className="inline h-4 w-4"/>).</strong> Este es el paso más importante. Antes de tocar nada, ve a <strong>Administración &gt; Mantenimiento</strong> y haz clic en <strong>&quot;Crear Punto de Restauración&quot;</strong>. Esto generará una copia segura de todas las bases de datos del sistema.
                    </li>
                    <li>
                        <strong>Paso 2: Reemplazar Archivos.</strong> Detén la aplicación (por ejemplo, usando `pm2 stop clic-tools`). Luego, borra todos los archivos y carpetas de la versión anterior **excepto** la carpeta `dbs/` y, si existe, el archivo `.env.local`. Después, copia todos los archivos de la nueva versión en su lugar.
                    </li>
                    <li>
                        <strong>Paso 3: Actualizar y Reconstruir.</strong> Abre una terminal en la carpeta del proyecto, ejecuta `npm install --omit=dev` para instalar cualquier nueva dependencia y luego `npm run build` para compilar la nueva versión.
                    </li>
                    <li>
                        <strong>Paso 4: Reiniciar.</strong> Vuelve a iniciar la aplicación (ej: `pm2 start clic-tools`). Al arrancar, el sistema detectará que las bases de datos en la carpeta `dbs/` no tienen las últimas columnas o tablas y las añadirá automáticamente sin borrar los datos existentes.
                    </li>
                </ol>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>¡Atención!</AlertTitle>
                    <AlertDescription>
                        Nunca reemplaces la carpeta &quot;dbs/&quot; del servidor con la de la nueva versión, ya que esto borraría todos tus datos de producción.
                    </AlertDescription>
                </Alert>
            </div>
        )
    },
     {
        title: "Control de Cambios (Changelog)",
        icon: <ListChecks className="mr-4 h-6 w-6 text-fuchsia-600" />,
        content: (
             <div className="space-y-4">
                <h4 className="font-semibold text-lg">Versión 1.8.0 <Badge variant="secondary">Actual</Badge></h4>
                <p className="text-sm text-muted-foreground">Lanzamiento: Octubre 2024</p>
                <ul className="list-disc space-y-3 pl-6">
                    <li>
                        <strong>Nueva Funcionalidad Mayor: Centro de Notificaciones.</strong> Se ha añadido un sistema de notificaciones en tiempo real dentro de la aplicación.
                        <ul className="list-[circle] space-y-2 pl-5 mt-2 text-sm">
                            <li>Un icono de campana en la cabecera alerta sobre nuevas notificaciones.</li>
                            <li>El panel de notificaciones permite ver y navegar directamente a las órdenes o solicitudes relevantes.</li>
                            <li>Ciertas notificaciones son accionables, permitiendo aprobar o rechazar tareas directamente desde el panel.</li>
                        </ul>
                    </li>
                     <li>
                        <strong>Nuevo Módulo: Centro de Ayuda.</strong> Se ha añadido una guía de usuario interactiva y con capacidad de búsqueda directamente en la aplicación para mejorar la autonomía del usuario.
                    </li>
                </ul>
                 <h4 className="font-semibold text-lg pt-4 border-t">Versión 1.7.0</h4>
                <p className="text-sm text-muted-foreground">Lanzamiento: Octubre 2024</p>
                <ul className="list-disc space-y-3 pl-6">
                     <li>
                        <strong>Nueva Funcionalidad Mayor: Recuperación de Contraseña.</strong> Se implementó un sistema completo para que los usuarios puedan recuperar su contraseña por correo electrónico. Incluye una nueva página de administración para configurar el servidor SMTP y personalizar la plantilla del correo.
                    </li>
                    <li>
                        <strong>Nueva Funcionalidad de Seguridad: Cambio de Contraseña Forzado.</strong> Al crear un nuevo usuario, ahora se puede forzar a que cambie su contraseña en el primer inicio de sesión. Este flujo también se activa automáticamente al usar una contraseña temporal recuperada.
                    </li>
                    <li>
                        <strong>Mejora en Flujo de Compras:</strong> Se añadió la capacidad de configurar el paso final &quot;Ingresado en ERP&quot; y de retroceder solicitudes entre los estados de &quot;Pendiente&quot;, &quot;Revisión&quot; y &quot;Pendiente de Aprobación&quot; para mayor flexibilidad.
                    </li>
                     <li>
                        <strong>Mejora de Robustez: Refactorización del Flujo de Autenticación.</strong> Se reescribió la lógica de inicio de sesión, cierre de sesión y protección de rutas para eliminar condiciones de carrera, evitar parpadeos de pantalla y manejar las sesiones de manera más segura y estable.
                    </li>
                    <li>
                        **Mejora de Estabilidad: Corrección de Migraciones.** Se revisaron y corrigieron todos los scripts de migración de la base de datos para asegurar que las actualizaciones de la aplicación se realicen sin errores ni pérdida de datos.
                    </li>
                </ul>
                 <h4 className="font-semibold text-lg pt-4 border-t">Versión 1.6.0</h4>
                <p className="text-sm text-muted-foreground">Lanzamiento: Octubre 2024</p>
                <ul className="list-disc space-y-3 pl-6">
                     <li>
                        <strong>Nuevo Módulo Mayor: Asistente de Costos.</strong> Permite cargar facturas XML, prorratear costos y calcular precios de venta.
                    </li>
                    <li>
                        <strong>Mejora Mayor en Interfaz: Panel Lateral Plegable.</strong>
                    </li>
                </ul>
            </div>
        )
    }
  ];

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      <div className="space-y-6">
        <Card>
            <CardHeader>
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white">
                        <LifeBuoy className="h-6 w-6" />
                    </div>
                    <div>
                        {companyData ? (
                        <CardTitle className="text-2xl">Manual de Usuario de {companyData.systemName || "la Aplicación"}</CardTitle>
                        ) : (
                            <Skeleton className="h-8 w-96" />
                        )}
                        <CardDescription>
                        Guía completa sobre cómo utilizar las herramientas y funcionalidades del sistema.
                        </CardDescription>
                    </div>
                </div>
                <div className="relative mt-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                        placeholder="Escribe para buscar en la ayuda (ej: 'contraseña', 'importar', 'resetear')..."
                        className="w-full pl-10 h-12 text-base"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" className="w-full">
                    {helpSections.map((section, index) => (
                        <HelpSection
                            key={index}
                            title={section.title}
                            icon={section.icon}
                            content={section.content}
                            searchTerm={searchTerm}
                        />
                    ))}
                </Accordion>
            </CardContent>
        </Card>
      </div>
    </main>
  );
}

