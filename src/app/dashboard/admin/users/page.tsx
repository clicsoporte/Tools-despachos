/**
 * @fileoverview Admin page for user management.
 * Allows admins to view, create, edit, and delete users.
 */
"use client";

import { useState, useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User, Role } from "@/modules/core/types";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, PlusCircle } from "lucide-react";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logInfo, logWarn, logError } from "@/modules/core/lib/logger";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAllUsers, saveAllUsers, addUser as addUserAction } from "@/modules/core/lib/auth-client";
import { getAllRoles } from "@/modules/core/lib/db";
import { Separator } from "@/components/ui/separator";
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

type NewUserForm = Omit<User, 'id' | 'avatar' | 'recentActivity' | 'securityQuestion' | 'securityAnswer'> & {
    password: string;
    forcePasswordChange: boolean;
};

// Initial state for the "Add User" form.
const emptyUser: NewUserForm = {
    name: "",
    email: "",
    password: "",
    role: "viewer", // Default role for new users
    phone: "",
    whatsapp: "",
    erpAlias: "",
    forcePasswordChange: true,
}

const getInitials = (name: string) => {
    if (!name) return "";
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
};


/**
 * Renders the user management page.
 * Handles fetching users and roles, and provides UI for all CRUD operations.
 */
export default function UsersPage() {
    const { isAuthorized } = useAuthorization(['users:create', 'users:read', 'users:update', 'users:delete']);
    const { toast } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { setTitle } = usePageTitle();

    // State for dialogs and forms
    const [isAddUserDialogOpen, setAddUserDialogOpen] = useState(false);
    const [isEditDialogOpen, setEditDialogOpen] = useState(false);
    const [isDeleteAlertOpen, setDeleteAlertOpen] = useState(false);
    
    const [newUser, setNewUser] = useState<NewUserForm>(emptyUser);
    const [currentUserToEdit, setCurrentUserToEdit] = useState<User | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    
    const [newPassword, setNewPassword] = useState("");

    const fetchAllData = async () => {
        try {
            setIsLoading(true);
            const [usersData, rolesData] = await Promise.all([
                getAllUsers(),
                getAllRoles()
            ]);

            const roleIds = new Set(rolesData.map(r => r.id));
            const sanitizedUsers = usersData.map(user => {
                if (!roleIds.has(user.role)) {
                    logWarn(`User '${user.name}' has an invalid role '${user.role}'. Defaulting to 'viewer'.`);
                    return { ...user, role: 'viewer' };
                }
                return user;
            });

            setUsers(sanitizedUsers);
            setRoles(rolesData);
        } catch (error) {
            console.error("Failed to fetch user data:", error);
            toast({
                title: "Error al Cargar Datos",
                description: "No se pudieron obtener los usuarios y roles del sistema.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setTitle("Gestión de Usuarios");
        if (isAuthorized) {
            fetchAllData();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthorized]);

    /**
     * Persists the current state of users to the database.
     * @param updatedUsers - The full list of users to save.
     */
    const handleSaveToDb = async (updatedUsers: User[]) => {
        try {
            await saveAllUsers(updatedUsers);
            setUsers(updatedUsers); // Update local state to match DB
        } catch (error) {
            logError("Failed to save users to DB", { error });
            toast({ title: "Error", description: "No se pudieron guardar los cambios en la base de datos.", variant: "destructive" });
        }
    }
    
    /**
     * Handles the creation of a new user.
     */
    const handleAddUser = async () => {
        if(!newUser.name || !newUser.email || !newUser.password) {
            toast({ title: "Campos Requeridos", description: "Nombre, correo y contraseña son obligatorios.", variant: "destructive" });
            return;
        }
        if (users.some(u => u.email === newUser.email)) {
            toast({ title: "Correo Duplicado", description: "Ya existe un usuario con este correo electrónico.", variant: "destructive" });
            return;
        }
        if (newUser.password.length < 6) {
            toast({ title: "Contraseña Débil", description: "La contraseña debe tener al menos 6 caracteres.", variant: "destructive"});
            return;
        }
        
        try {
            const addedUser = await addUserAction(newUser);
            setUsers(prevUsers => [...prevUsers, addedUser]);

            toast({ title: "Usuario Añadido", description: `${addedUser.name} ha sido añadido al sistema.` });
            await logInfo("New user added", { user: addedUser.name, role: addedUser.role });
            setNewUser(emptyUser);
            setAddUserDialogOpen(false);
            
        } catch(error: any) {
             logError("Failed to add user", { error: error.message });
             toast({ title: "Error", description: `No se pudo añadir el usuario a la base de datos: ${error.message}`, variant: "destructive" });
        }
    }

    /**
     * Handles the update of an existing user's information.
     */
    const handleEditUser = async () => {
        if (!currentUserToEdit) return;

        let userToUpdate = { ...currentUserToEdit };

        // Handle password change if a new one is provided
        if (newPassword) {
            if (newPassword.length < 6) {
                toast({ title: "Contraseña Débil", description: "La nueva contraseña debe tener al menos 6 caracteres.", variant: "destructive" });
                return;
            }
            userToUpdate.password = newPassword;
            toast({ title: "Contraseña Actualizada", description: `La contraseña para ${userToUpdate.name} ha sido cambiada.` });
            await logInfo("User password updated by admin", { user: userToUpdate.name });
        }

        const updatedUsers = users.map(user => user.id === userToUpdate.id ? userToUpdate : user);
        await handleSaveToDb(updatedUsers);
        
        toast({ title: "Usuario Actualizado", description: `Los datos de ${currentUserToEdit.name} han sido actualizados.` });
        await logInfo("User profile updated", { user: currentUserToEdit.name });

        // Reset form and close dialog
        setEditDialogOpen(false);
        setCurrentUserToEdit(null);
        setNewPassword("");
    }
    
    /**
     * Handles the deletion of a user.
     */
    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        if (userToDelete.id === 1) { // Assuming user with ID 1 is the primary admin
            toast({ title: "Acción no permitida", description: "No se puede eliminar al administrador principal.", variant: "destructive"});
            return;
        }
        const updatedUsers = users.filter(user => user.id !== userToDelete.id);
        await handleSaveToDb(updatedUsers);
        toast({ title: "Usuario Eliminado", description: `${userToDelete.name} ha sido eliminado.`, variant: "destructive" });
        await logWarn("User deleted", { user: userToDelete.name });
        
        setDeleteAlertOpen(false);
        setUserToDelete(null);
    }

    const openEditDialog = (user: User) => {
        // Deep copy to avoid modifying state directly while editing
        setCurrentUserToEdit(JSON.parse(JSON.stringify(user))); 
        setNewPassword(""); // Clear password field on open
        setEditDialogOpen(true);
    }

    const openDeleteAlert = (user: User) => {
        setUserToDelete(user);
        setDeleteAlertOpen(true);
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
                    <CardContent>
                        <div className="space-y-2">
                           <Skeleton className="h-12 w-full"/>
                           <Skeleton className="h-12 w-full"/>
                           <Skeleton className="h-12 w-full"/>
                        </div>
                    </CardContent>
                </Card>
            </main>
        )
    }


  return (
    <>
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle>Usuarios del Sistema</CardTitle>
                    <CardDescription>
                    Añade, edita y gestiona los usuarios y sus roles de acceso.
                    </CardDescription>
                </div>
                <Dialog open={isAddUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Añadir Usuario
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Añadir Nuevo Usuario</DialogTitle>
                            <DialogDescription>
                                Completa los detalles para crear un nuevo usuario.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh]">
                            <div className="space-y-4 py-4 px-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre</Label>
                                    <Input id="name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Correo</Label>
                                    <Input id="email" type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="erpAlias">Alias de Usuario (ERP)</Label>
                                    <Input id="erpAlias" value={newUser.erpAlias || ''} onChange={e => setNewUser({...newUser, erpAlias: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Contraseña</Label>
                                    <Input id="password" type="password" value={newUser.password || ''} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox 
                                        id="force-password-change"
                                        checked={newUser.forcePasswordChange}
                                        onCheckedChange={checked => setNewUser({...newUser, forcePasswordChange: !!checked})}
                                    />
                                    <Label htmlFor="force-password-change" className="font-normal">
                                        Forzar cambio de contraseña en el próximo inicio de sesión
                                    </Label>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="role">Rol</Label>
                                    <Select value={newUser.role} onValueChange={(value) => setNewUser({...newUser, role: value as User["role"]})}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona un rol" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {roles.map(role => (
                                                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                            <Button onClick={handleAddUser}>Guardar Usuario</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead className="w-1/3">Nombre</TableHead>
                        <TableHead className="w-1/3 hidden sm:table-cell">Correo Electrónico</TableHead>
                        <TableHead className="w-1/4 hidden md:table-cell">Rol</TableHead>
                        <TableHead>
                            <span className="sr-only">Acciones</span>
                        </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => {
                            const userRole = roles.find(r => r.id === user.role);
                            return (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium flex items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={user.avatar} alt={user.name} />
                                            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <span>{user.name}</span>
                                            <span className="text-muted-foreground text-xs sm:hidden">{user.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                                    <TableCell className="hidden md:table-cell">
                                    {userRole ? (
                                        <Badge variant={userRole.id === 'admin' ? 'default' : 'secondary'}>
                                            {userRole.name}
                                        </Badge>
                                    ) : (
                                        <Badge variant="destructive">Rol Inválido</Badge>
                                    )}
                                    </TableCell>
                                    <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                        <Button aria-haspopup="true" size="icon" variant="ghost">
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">Toggle menu</span>
                                        </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                        <DropdownMenuItem onSelect={() => openEditDialog(user)}>Editar</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => openDeleteAlert(user)} className="text-red-600">
                                            Eliminar
                                        </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
          </CardContent>
        </Card>
      </main>

       {/* Edit User Dialog */}
       <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Editar Usuario</DialogTitle>
                    <DialogDescription>
                        Actualiza los detalles del usuario. Haz clic en guardar cuando termines.
                    </DialogDescription>
                </DialogHeader>
                {currentUserToEdit && (
                    <ScrollArea className="max-h-[70vh]">
                        <div className="space-y-4 py-4 px-2">
                            <div className="space-y-2">
                                <Label htmlFor="edit-name">Nombre</Label>
                                <Input id="edit-name" value={currentUserToEdit.name} onChange={e => setCurrentUserToEdit({...currentUserToEdit, name: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-email">Correo Electrónico</Label>
                                <Input id="edit-email" type="email" value={currentUserToEdit.email} onChange={e => setCurrentUserToEdit({...currentUserToEdit, email: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-erpAlias">Alias de Usuario (ERP)</Label>
                                <Input id="edit-erpAlias" value={currentUserToEdit.erpAlias || ''} onChange={e => setCurrentUserToEdit({...currentUserToEdit, erpAlias: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-phone">Teléfono</Label>
                                    <Input id="edit-phone" value={currentUserToEdit.phone || ''} onChange={e => setCurrentUserToEdit({...currentUserToEdit, phone: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-whatsapp">WhatsApp</Label>
                                    <Input id="edit-whatsapp" value={currentUserToEdit.whatsapp || ''} onChange={e => setCurrentUserToEdit({...currentUserToEdit, whatsapp: e.target.value})} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-role">Rol</Label>
                                <Select value={currentUserToEdit.role} onValueChange={(value) => setCurrentUserToEdit({...currentUserToEdit, role: value as User["role"]})}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un rol" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map(role => (
                                            <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Separator className="my-6" />
                            <div className="space-y-2">
                                <Label htmlFor="edit-password">Nueva Contraseña</Label>
                                <Input 
                                    id="edit-password" 
                                    type="password" 
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)} 
                                    placeholder="Dejar en blanco para no cambiar"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                                Solo complete el campo de contraseña si desea cambiarla.
                            </p>
                        </div>
                    </ScrollArea>
                )}
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                    <Button onClick={handleEditUser}>Guardar Cambios</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        {/* Delete User Alert Dialog */}
        <AlertDialog open={isDeleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente al usuario {userToDelete?.name} y sus datos del sistema.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteUser} className={buttonVariants({ variant: "destructive" })}>Sí, eliminar usuario</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  );
}
