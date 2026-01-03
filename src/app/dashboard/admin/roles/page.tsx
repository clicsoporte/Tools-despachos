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
import { PlusCircle, Trash2, RefreshCw, Copy, Edit2 } from "lucide-react";
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
import { permissionGroups, permissionTranslations, permissionTree } from "@/modules/core/lib/permissions";

const emptyRole: Role = {
    id: "",
    name: "",
    permissions: [],
}

export default function RolesPage() {
    const { isAuthorized } = useAuthorization(['roles:read', 'roles:create', 'roles:update', 'roles:delete']);
    const { toast } = useToast();
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // State for dialogs
    const [isRoleFormOpen, setRoleFormOpen] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

    // State for form data (add, copy, edit)
    const [roleFormData, setRoleFormData] = useState<Role>(emptyRole);
    const [formTitle, setFormTitle] = useState("Crear Nuevo Rol");
    const [isEditing, setIsEditing] = useState(false);

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
    
    const getParentPermissions = (permission: string): string[] => {
        const parents: string[] = [];
        for (const parent in permissionTree) {
            if (permissionTree[parent as keyof typeof permissionTree]?.includes(permission)) {
                parents.push(parent);
                parents.push(...getParentPermissions(parent));
            }
        }
        return parents;
    };
    
    const getChildPermissions = (permission: string): string[] => {
        const children = permissionTree[permission as keyof typeof permissionTree] || [];
        return children.flatMap(child => [child, ...getChildPermissions(child)]);
    };

    const handleFormPermissionChange = (permission: string, checked: boolean) => {
        setRoleFormData(currentRole => {
            const currentPermissions = new Set(currentRole.permissions);
            if (checked) {
                currentPermissions.add(permission);
                getParentPermissions(permission).forEach(p => currentPermissions.add(p));
            } else {
                currentPermissions.delete(permission);
                getChildPermissions(permission).forEach(p => currentPermissions.delete(p));
            }
            return { ...currentRole, permissions: Array.from(currentPermissions) };
        });
    };


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

        let updatedRoles;

        if (isEditing) {
            updatedRoles = roles.map(role => role.id === roleFormData.id ? roleFormData : role);
            toast({ title: `Rol Actualizado`, description: `El rol "${roleFormData.name}" ha sido actualizado.` });
            await logInfo(`Role updated`, { role: roleFormData.name });
        } else {
            if (roles.some(role => role.id === roleFormData.id)) {
                toast({ title: "Error", description: "El ID del rol ya existe.", variant: "destructive" });
                return;
            }
            updatedRoles = [...roles, roleFormData];
            toast({ title: `Rol Creado`, description: `El rol "${roleFormData.name}" ha sido añadido.` });
            await logInfo(`New role created`, { role: roleFormData.name });
        }
        
        setRoles(updatedRoles);
        await saveAllRoles(updatedRoles);
        
        setRoleFormOpen(false);
    }

    const openNewBlankDialog = () => {
        setFormTitle("Crear Nuevo Rol");
        setRoleFormData(emptyRole);
        setIsEditing(false);
        setRoleFormOpen(true);
    };

    const openCopyDialog = (roleToCopy: Role) => {
        setFormTitle(`Copia de: ${roleToCopy.name}`);
        setRoleFormData({
            id: `${roleToCopy.id}-copia`,
            name: `${roleToCopy.name} (Copia)`,
            permissions: [...roleToCopy.permissions]
        });
        setIsEditing(false);
        setRoleFormOpen(true);
    };

    const openEditDialog = (roleToEdit: Role) => {
        setFormTitle(`Editar Rol: ${roleToEdit.name}`);
        setRoleFormData({ ...roleToEdit });
        setIsEditing(true);
        setRoleFormOpen(true);
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
                                Restablecer Rol Admin
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Restablecer Rol de Administrador?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción restaurará el rol &apos;admin&apos; a sus permisos originales (todos).
                                    Los roles personalizados que hayas creado no se verán afectados.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleResetRoles}>Sí, restablecer</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button onClick={openNewBlankDialog}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Crear Rol
                    </Button>
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
                     <Button variant="outline" size="sm" onClick={() => openEditDialog(role)}>
                        <Edit2 className="mr-2 h-4 w-4" />
                        Editar Permisos
                    </Button>
                     <Button variant="outline" size="sm" onClick={() => openCopyDialog(role)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar
                    </Button>
                    {role.id !== 'admin' && (
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
              </Card>
            ))}
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <p className="text-sm text-muted-foreground">La gestión de permisos se guarda automáticamente al crear, editar o eliminar roles.</p>
          </CardFooter>
        </Card>
         <Dialog open={isRoleFormOpen} onOpenChange={setRoleFormOpen}>
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
                                disabled={isEditing || roleFormData.id === 'admin'}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role-name">Nombre para mostrar</Label>
                            <Input 
                                id="role-name"
                                value={roleFormData.name}
                                onChange={e => setRoleFormData({...roleFormData, name: e.target.value})}
                                disabled={roleFormData.id === 'admin'}
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
                                                    disabled={roleFormData.id === 'admin'}
                                                    />
                                                    <Label htmlFor={`form-${permission}`} className={`font-normal text-sm ${roleFormData.id === 'admin' ? 'text-muted-foreground' : ''}`}>
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
                    <Button onClick={handleFormSubmit} disabled={roleFormData.id === 'admin'}>Guardar Rol</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </main>
  );
}
