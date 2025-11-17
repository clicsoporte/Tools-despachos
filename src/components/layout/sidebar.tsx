
/**
 * @fileoverview Sidebar component for the main application layout.
 * It handles navigation, displays user and company information, and adapts
 * to mobile and desktop views.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Settings,
  Network,
  Wrench,
  LayoutDashboard,
  LifeBuoy,
  Sheet as SheetIcon,
  CalendarCheck,
  ShoppingCart,
  Warehouse,
  Search,
  PackagePlus,
  BookMarked,
  MessageSquare,
  BarChartBig,
  Calculator,
} from "lucide-react";
import type { Tool } from "@/modules/core/types";
import { UserNav } from "./user-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/core/hooks/useAuth";

/**
 * Renders the main application sidebar.
 * It fetches current user and company data to display personalized information.
 * It highlights the active navigation link based on the current URL path.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { user: currentUser, companyData, userRole, isReady } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };


  /**
   * Determines if a navigation link should be considered active.
   * @param href - The href of the navigation link.
   * @returns True if the link is active, false otherwise.
   */
  const isActive = (href: string) => {
    if (href === '/dashboard') {
        return pathname === href;
    }
    return pathname.startsWith(href);
  };
  
  const hasAdminAccess = userRole?.id === 'admin';
  const hasAnalyticsAccess = hasAdminAccess || userRole?.permissions.includes('analytics:read');


  if (!isReady) {
    return (
        <div className="hidden md:flex flex-col w-64 border-r p-4 gap-4 bg-sidebar text-sidebar-foreground">
            <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-10 w-10 rounded-lg"/>
                <Skeleton className="h-6 w-32"/>
            </div>
            <div className="space-y-2 flex-1">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="mt-auto space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
    )
  }

  const navLinks: Tool[] = [
    {
      id: "dashboard",
      name: "Panel",
      description: "Visión general de las herramientas y actividad.",
      href: "/dashboard",
      icon: LayoutDashboard,
      bgColor: "bg-blue-500",
      textColor: "text-white",
    },
    {
      id: "quoter",
      name: "Cotizador",
      description: "Crear y gestionar cotizaciones para clientes.",
      href: "/dashboard/quoter",
      icon: SheetIcon,
      bgColor: "bg-green-500",
      textColor: "text-white",
    },
    {
      id: "purchase-request",
      name: "Solicitud de Compra",
      description: "Crear y gestionar solicitudes de compra internas.",
      href: "/dashboard/requests",
      icon: ShoppingCart,
      bgColor: "bg-yellow-500",
      textColor: "text-white",
    },
     {
      id: "planner",
      name: "Planificador OP",
      description: "Gestionar y visualizar la carga de producción.",
      href: "/dashboard/planner",
      icon: CalendarCheck,
      bgColor: "bg-purple-500",
      textColor: "text-white",
    },
    {
      id: 'cost-assistant',
      name: 'Asistente de Costos',
      description: 'Calcular costos y precios a partir de facturas XML.',
      href: '/dashboard/cost-assistant',
      icon: Calculator,
      bgColor: 'bg-orange-500',
      textColor: 'text-white',
    },
    {
      id: "warehouse",
      name: "Consulta Almacén",
      description: "Localizar artículos y gestionar ubicaciones en bodega.",
      href: "/dashboard/warehouse",
      icon: Warehouse,
      bgColor: "bg-cyan-600",
      textColor: "text-white",
    },
    {
      id: "warehouse-assign",
      name: "Asignar Inventario",
      description: "Mover inventario entre ubicaciones físicas.",
      href: "/dashboard/warehouse/assign",
      icon: PackagePlus,
      bgColor: "bg-teal-600",
      textColor: "text-white",
    },
     {
      id: "hacienda-query",
      name: "Consultas Hacienda",
      description: "Verificar situación tributaria y exoneraciones.",
      href: "/dashboard/hacienda",
      icon: Search,
      bgColor: "bg-blue-600",
      textColor: "text-white",
    },
    {
      id: "help",
      name: "Centro de Ayuda",
      description: "Consultar la documentación y guías de uso del sistema.",
      href: "/dashboard/help",
      icon: LifeBuoy,
      bgColor: "bg-orange-500",
      textColor: "text-white",
    },
  ];

  return (
      <Sidebar collapsible="icon" className="border-r z-20">
        <SidebarHeader>
          <Button variant="ghost" size="icon" className="size-10" asChild>
            <Link href="/dashboard" onClick={handleLinkClick}>
              <Network />
            </Link>
          </Button>
          <h2 className="text-lg font-semibold tracking-tight text-sidebar-foreground">
            {companyData?.systemName || 'Clic-Tools'}
          </h2>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navLinks.map((item) => (
                <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.name}
                    >
                    <Link href={item.href} onClick={handleLinkClick}>
                        <item.icon />
                        <span>{item.name}</span>
                    </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              )
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton
                asChild
                isActive={isActive("/dashboard/profile")}
                tooltip="Mi Perfil"
                >
                <Link href="/dashboard/profile" onClick={handleLinkClick}>
                    <Settings />
                    <span>Mi Perfil</span>
                </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>

             {hasAnalyticsAccess && (
                <SidebarMenuItem>
                    <SidebarMenuButton
                        asChild
                        isActive={isActive("/dashboard/analytics")}
                        tooltip="Analíticas"
                    >
                        <Link href="/dashboard/analytics" onClick={handleLinkClick}>
                            <BarChartBig />
                            <span>Analíticas</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            )}
            
            {hasAdminAccess && (
                 <SidebarMenuItem>
                    <SidebarMenuButton
                        asChild
                        isActive={isActive("/dashboard/admin")}
                        tooltip="Configuración"
                    >
                        <Link href="/dashboard/admin" onClick={handleLinkClick} className="relative">
                           <Wrench />
                           <span>Configuración</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            )}
          </SidebarMenu>
          <div className="flex items-center gap-2 p-2 mt-4 border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
            <UserNav user={currentUser} />
            <div className="flex flex-col text-sm">
              <span className="font-semibold text-sidebar-foreground">
                {currentUser?.name}
              </span>
              <span className="text-sidebar-foreground/70">
                {currentUser?.email}
              </span>
            </div>
          </div>
           <div className="text-center text-xs text-sidebar-foreground/50 p-2 group-data-[collapsible=icon]:hidden">
                Clic-Tools v2.0.0 - ClicSoporte
           </div>
        </SidebarFooter>
      </Sidebar>
  );
}
