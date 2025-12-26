/**
 * @fileoverview Admin page for user management.
 * Allows admins to view, create, edit, and delete users.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
  } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logInfo, logWarn } from "@/modules/core/lib/logger";
import type { Role } from "@/modules/core/types";
import { PlusCircle, Trash2, RefreshCw, Copy, FileText, Factory } from "lucide-react";
import { getAllRoles, saveAllRoles, resetDefaultRoles } from "@/modules/core/lib/db";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { permissionGroups, permissionTranslations } from "@/modules/core/lib/data";

const emptyRole: Role = {
    id: "",
    name: "",
    permissions: [],
}

const roleTemplates = {
    'requester': {
        name: 'Solicitante de Compras',
        permissions: ['dashboard:access', 'requests:read', 'requests:create', 'requests:notes:add', 'requests:status:cancel']
    },
    'planner': {
        name: 'Planificador de Producción',
        permissions: ['dashboard:access', 'planner:read', 'planner:create', 'planner:status:approve', 'planner:status:in-progress', 'planner:status:on-hold', 'planner:status:completed', 'planner:status:cancel', 'planner:priority:update', 'planner:machine:assign', 'planner:schedule']
    }
}

export default function RolesPage() {
    const { isAuthorized } = useAuthorization(['roles:read', 'roles:create', 'roles:update', 'roles:delete']);
    const { toast } = useToast();
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // State for dialogs
    const [isAddRoleDialogOpen, setAddRoleDialogOpen] = useState(false);
    const [isTemplateSelectorOpen, setTemplateSelectorOpen] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

    // State for form data (add, copy, template)
    const [roleFormData, setRoleFormData] = useState<Role>(emptyRole);
    const [formTitle, setFormTitle] = useState("Crear Nuevo Rol");

    const { setTitle } = usePageTitle();

    const fetchRoles = useCallback(async () => {
        setIsLoading(true);
        const savedRoles = await getAllRoles();
        setRoles(savedRoles);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        setTitle("Gestión de Roles");
        if (isAuthorized) {
            fetchRoles();
        }
    }, [isAuthorized, fetchRoles, setTitle]);
    
    const handlePermissionChange = (roleId: string, permission: string, checked: boolean) => {
        setRoles(currentRoles => 
            currentRoles.map(role => {
                if (role.id === roleId) {
                    const newPermissions = checked
                        ? [...role.permissions, permission]
                        : role.permissions.filter(p => p !== permission);
                    return { ...role, permissions: newPermissions };
                }
                return role;
            })
        );
    }
    
    const handleFormPermissionChange = (permission: string, checked: boolean) => {
        setRoleFormData(currentRole => {
            const newPermissions = checked
                ? [...currentRole.permissions, permission]
                : currentRole.permissions.filter(p => p !== permission);
            return { ...currentRole, permissions: newPermissions };
        })
    }

    const handleSaveAll = async () => {
        await saveAllRoles(roles);
        toast({
            title: "Roles Guardados",
            description: "Los permisos de los roles han sido actualizados.",
        });
        await logInfo("Roles y permisos guardados.", { roles: roles.map(r => r.id) });
    }

    const handleFormSubmit = async () => {
        if (!roleFormData.id || !roleFormData.name) {
            toast({ title: "Error", description: "ID y Nombre son requeridos.", variant: "destructive" });
            return;
        }
        if (roles.some(role => role.id === roleFormData.id)) {
             toast({ title: "Error", description: "El ID del rol ya existe.", variant: "destructive" });
            return;
        }

        const updatedRoles = [...roles, roleFormData];
        setRoles(updatedRoles);
        await saveAllRoles(updatedRoles);
        
        toast({ title: `Rol Creado`, description: `El rol "${roleFormData.name}" ha sido añadido.` });
        await logInfo(`New role created`, { role: roleFormData.name });
        
        setRoleFormData(emptyRole);
        setAddRoleDialogOpen(false);
    }

    const openCopyDialog = (roleToCopy: Role) => {
        setFormTitle(`Copia de: ${roleToCopy.name}`);
        setRoleFormData({
            id: `${roleToCopy.id}-copia`,
            name: `${roleToCopy.name} (Copia)`,
            permissions: [...roleToCopy.permissions]
        });
        setAddRoleDialogOpen(true);
    };

    const openTemplateDialog = (template?: 'requester' | 'planner') => {
        setTemplateSelectorOpen(false); // Close the selector
        if (template) {
            const t = roleTemplates[template];
            setFormTitle(`Nuevo Rol desde Plantilla: ${t.name}`);
            setRoleFormData({
                id: `rol-${template}-personalizado`,
                name: `${t.name} Personalizado`,
                permissions: t.permissions
            });
        } else {
            // Blank role
            setFormTitle("Crear Nuevo Rol en Blanco");
            setRoleFormData(emptyRole);
        }
        setAddRoleDialogOpen(true);
    };


    const handleDeleteRole = async () => {
        if (!roleToDelete) return;

        const updatedRoles = roles.filter(role => role.id !== roleToDelete.id);
        setRoles(updatedRoles);
        await saveAllRoles(updatedRoles);

        toast({ title: "Rol Eliminado", description: `El rol "${roleToDelete.name}" ha sido eliminado.`, variant: 'destructive'});
        await logWarn("Rol eliminado", { role: roleToDelete.name });
        setRoleToDelete(null);
    }

    const handleResetRoles = async () => {
        await resetDefaultRoles();
        await fetchRoles(); // Refresca la lista de roles desde la DB
        toast({ title: "Roles Reiniciados", description: "Los roles por defecto han sido restaurados." });
        await logWarn("Los roles por defecto han sido reiniciados por un administrador.");
    }
    
    if (isAuthorized === null) {
        return null;
    }

    if (isLoading) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-64"/>
                        <Skeleton className="h-4 w-96 mt-2"/>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                       <Skeleton className="h-40 w-full" />
                       <Skeleton className="h-40 w-full" />
                    </CardContent>
                </Card>
            </main>
        )
    }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle>Roles y Permisos</CardTitle>
                    <CardDescription>
                    Define qué acciones puede realizar cada rol dentro del sistema.
                    </CardDescription>
                </div>
                <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Restablecer Roles
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Restablecer Roles por Defecto?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción restaurará los roles por defecto (&apos;admin&apos;, &apos;viewer&apos;, &apos;planner-user&apos;, &apos;requester-user&apos;) a sus permisos originales.
                                    Los roles personalizados que hayas creado no se verán afectados.
                                    Esto es útil si los permisos por defecto se han corrompido.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleResetRoles}>Sí, restablecer</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Dialog open={isTemplateSelectorOpen} onOpenChange={setTemplateSelectorOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Crear Rol
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Crear Nuevo Rol</DialogTitle>
                                <DialogDescription>Elige un punto de partida para tu nuevo rol.</DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => openTemplateDialog('requester')}>
                                    <FileText className="mr-4 h-6 w-6"/>
                                    <div className="text-left">
                                        <p className="font-semibold">Crear desde Plantilla &quot;Solicitante&quot;</p>
                                        <p className="text-xs text-muted-foreground">Precarga permisos para el módulo de compras.</p>
                                    </div>
                                </Button>
                                <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => openTemplateDialog('planner')}>
                                    <Factory className="mr-4 h-6 w-6"/>
                                    <div className="text-left">
                                        <p className="font-semibold">Crear desde Plantilla &quot;Planificador&quot;</p>
                                        <p className="text-xs text-muted-foreground">Precarga permisos para el módulo de producción.</p>
                                    </div>
                                </Button>
                                <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={() => openTemplateDialog()}>
                                    <div className="w-10"></div>
                                    <div className="text-left">
                                        <p className="font-semibold">Crear Rol en Blanco</p>
                                        <p className="text-xs text-muted-foreground">Empieza desde cero sin permisos predefinidos.</p>
                                    </div>
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{role.name}</CardTitle>
                    <Badge variant="secondary" className="w-fit">{role.id}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                     <Button variant="outline" size="sm" onClick={() => openCopyDialog(role)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar
                    </Button>
                    {role.id !== 'admin' && role.id !== 'viewer' && role.id !== 'planner-user' && role.id !== 'requester-user' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => setRoleToDelete(role)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar el rol &quot;{role.name}&quot;?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción no se puede deshacer. Los usuarios asignados a este rol perderán sus permisos.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => setRoleToDelete(null)}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteRole}>Sí, eliminar</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Accordion type="multiple" className="w-full">
                        {Object.entries(permissionGroups).map(([groupName, permissions]) => (
                            <AccordionItem value={`${role.id}-${groupName}`} key={`${role.id}-${groupName}`}>
                                <AccordionTrigger>{groupName}</AccordionTrigger>
                                <AccordionContent>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pl-2">
                                        {permissions.map((permission) => (
                                            <div key={`${role.id}-${permission}`} className="flex items-center space-x-2">
                                                <Checkbox
                                                id={`${role.id}-${permission}`}
                                                checked={role.permissions.includes(permission)}
                                                onCheckedChange={(checked) => handlePermissionChange(role.id, permission, checked === true)}
                                                disabled={role.id === 'admin'}
                                                />
                                                <Label htmlFor={`${role.id}-${permission}`} className={`font-normal text-sm ${role.id === 'admin' ? 'text-muted-foreground' : ''}`}>
                                                {permissionTranslations[permission as keyof typeof permissionTranslations] || permission}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
              </Card>
            ))}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button onClick={handleSaveAll}>Guardar Cambios</Button>
          </CardFooter>
        </Card>
         <Dialog open={isAddRoleDialogOpen} onOpenChange={setAddRoleDialogOpen}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{formTitle}</DialogTitle>
                    <DialogDescription>
                        Define un ID, un nombre y ajusta los permisos para el nuevo rol.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="role-id">ID del Rol (sin espacios)</Label>
                            <Input 
                                id="role-id"
                                value={roleFormData.id}
                                onChange={e => setRoleFormData({...roleFormData, id: e.target.value.toLowerCase().replace(/\s/g, '-')})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role-name">Nombre para mostrar</Label>
                            <Input 
                                id="role-name"
                                value={roleFormData.name}
                                onChange={e => setRoleFormData({...roleFormData, name: e.target.value})}
                            />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-medium">Permisos</h4>
                        <ScrollArea className="h-72 w-full rounded-md border p-4">
                            <Accordion type="multiple" className="w-full">
                                {Object.entries(permissionGroups).map(([groupName, permissions]) => (
                                    <AccordionItem value={groupName} key={groupName}>
                                        <AccordionTrigger>{groupName}</AccordionTrigger>
                                        <AccordionContent>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pl-2">
                                                {permissions.map((permission) => (
                                                <div key={`form-${permission}`} className="flex items-center space-x-2">
                                                    <Checkbox
                                                    id={`form-${permission}`}
                                                    checked={roleFormData.permissions.includes(permission)}
                                                    onCheckedChange={(checked) => handleFormPermissionChange(permission, checked === true)}
                                                    />
                                                    <Label htmlFor={`form-${permission}`} className="font-normal text-sm">
                                                    {permissionTranslations[permission as keyof typeof permissionTranslations] || permission}
                                                    </Label>
                                                </div>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </ScrollArea>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                    <Button onClick={handleFormSubmit}>Guardar Rol</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </main>
  );
}
