/**
 * @fileoverview User profile settings page.
 * Allows the currently logged-in user to update their personal information,
 * security question, and password.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useToast } from "../../../modules/core/hooks/use-toast";
import type { User } from "../../../modules/core/types";
import { Skeleton } from "../../../components/ui/skeleton";
import { logInfo, logError } from "../../../modules/core/lib/logger";
import { Separator } from "../../../components/ui/separator";
import { getAllUsers, saveAllUsers, comparePasswords } from "../../../modules/core/lib/auth-client";
import { usePageTitle } from "../../../modules/core/hooks/usePageTitle";
import { useDropzone } from "react-dropzone";
import { Avatar, AvatarImage, AvatarFallback } from "../../../components/ui/avatar";
import { Camera } from "lucide-react";
import { useAuth } from "@/modules/core/hooks/useAuth";

/**
 * Renders the user profile settings page.
 * Fetches the current user's data and provides forms to update their details
 * and change their password.
 */
export default function SettingsPage() {
  const { toast } = useToast();
  const { user, isReady, refreshAuth } = useAuth();
  const { setTitle } = usePageTitle();
  
  const [formData, setFormData] = useState({
      name: "",
      email: "",
      phone: "",
      whatsapp: "",
      erpAlias: "",
      securityQuestion: "",
      securityAnswer: "",
      avatar: ""
  });
  
  // State for the password change form
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  useEffect(() => {
    setTitle("Configuración de Perfil");
    if (user) {
        setFormData({
            name: user.name || "",
            email: user.email || "",
            phone: user.phone || "",
            whatsapp: user.whatsapp || "",
            erpAlias: user.erpAlias || "",
            securityQuestion: user.securityQuestion || "",
            securityAnswer: user.securityAnswer || "",
            avatar: user.avatar || ""
        });
    }
  }, [setTitle, user]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({...prev, avatar: base64String}));
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': [],
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setPasswords((prev) => ({ ...prev, [id]: value }));
  }

  const handleSubmit = async () => {
    if (!user) return;

    let userToUpdate: User = {
        ...user,
        ...formData
    };

    if (passwords.current || passwords.new || passwords.confirm) {
      if (!passwords.current || !passwords.new || !passwords.confirm) {
          toast({ title: "Error", description: "Por favor, complete todos los campos de contraseña para cambiarla.", variant: "destructive" });
          return;
      }

      const isMatch = await comparePasswords(user.id, passwords.current);
      if (!isMatch) {
        toast({
          title: "Error de Contraseña",
          description: "La contraseña actual no es correcta.",
          variant: "destructive",
        });
        return;
      }
      if (passwords.new.length < 6) {
        toast({
          title: "Contraseña Débil",
          description: "La nueva contraseña debe tener al menos 6 caracteres.",
          variant: "destructive",
        });
        return;
      }
      if (passwords.new !== passwords.confirm) {
          toast({
              title: "Error de Contraseña",
              description: "Las nuevas contraseñas no coinciden.",
              variant: "destructive",
          });
          return;
      }
      userToUpdate.password = passwords.new;
      toast({
        title: "Contraseña Actualizada",
        description: "Tu contraseña ha sido cambiada exitosamente.",
      });
      await logInfo("User password updated by self", { user: user.name });
      setPasswords({ current: "", new: "", confirm: "" });
    }
    
    try {
        const allUsers = await getAllUsers();
        const updatedUsers = allUsers.map(u => u.id === userToUpdate.id ? userToUpdate : u);
        await saveAllUsers(updatedUsers);
        
        toast({
          title: "Perfil Actualizado",
          description: "Tu información ha sido guardada exitosamente.",
        });
        await logInfo(`User '${user.name}' updated their profile.`, { name: formData.name, email: formData.email });
        await refreshAuth();
    } catch (error: any) {
        logError("Failed to save user profile", { error: error.message });
        toast({
            title: "Error al Guardar",
            description: `No se pudo actualizar tu perfil: ${error.message}`,
            variant: "destructive"
        });
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "";
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  };
  
  if (!isReady || !user) {
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-full mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                    <CardFooter className="border-t px-6 py-4">
                        <Button disabled>Guardar Cambios</Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    )
  }


  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div {...getRootProps()} className="relative group cursor-pointer">
                    <input {...getInputProps()} />
                    <Avatar className="h-24 w-24 text-4xl">
                        <AvatarImage src={formData.avatar} alt={formData.name} />
                        <AvatarFallback>{getInitials(formData.name)}</AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div>
                    <CardTitle>Mi Perfil</CardTitle>
                    <CardDescription>
                      Actualiza tu información personal y foto. Estos datos se usarán en las
                      cotizaciones si así lo especificas.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={handleProfileChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleProfileChange}
                  />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="erpAlias">Alias de Usuario (ERP)</Label>
                  <Input
                    id="erpAlias"
                    value={formData.erpAlias || ''}
                    onChange={handleProfileChange}
                    placeholder="Tu nombre de usuario en el sistema ERP"
                  />
                   <p className="text-xs text-muted-foreground">Este alias se usará para filtrar órdenes y solicitudes por tu usuario del ERP.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={formData.phone || ''}
                      onChange={handleProfileChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={formData.whatsapp || ''}
                      onChange={handleProfileChange}
                    />
                  </div>
                </div>
                <Separator className="my-6" />
                <div className="space-y-4">
                    <h3 className="text-lg font-medium">Pregunta de Seguridad</h3>
                     <p className="text-sm text-muted-foreground">
                        Esto te ayudará a recuperar el acceso si olvidas tu contraseña.
                    </p>
                    <div className="space-y-2">
                        <Label htmlFor="securityQuestion">Pregunta</Label>
                        <Input 
                            id="securityQuestion" 
                            placeholder="Ej: ¿Cuál es el nombre de mi primera mascota?"
                            value={formData.securityQuestion || ''}
                            onChange={handleProfileChange}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="securityAnswer">Respuesta</Label>
                        <Input 
                            id="securityAnswer"
                            placeholder="Tu respuesta secreta"
                            value={formData.securityAnswer || ''}
                            onChange={handleProfileChange}
                        />
                    </div>
                </div>
                <Separator className="my-6" />
                <div className="space-y-4">
                    <h3 className="text-lg font-medium">Cambiar Contraseña</h3>
                    <div className="space-y-2">
                        <Label htmlFor="current">Contraseña Actual</Label>
                        <Input id="current" type="password" value={passwords.current} onChange={handlePasswordChange} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new">Nueva Contraseña</Label>
                        <Input id="new" type="password" value={passwords.new} onChange={handlePasswordChange}/>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="confirm">Confirmar Nueva Contraseña</Label>
                        <Input id="confirm" type="password" value={passwords.confirm} onChange={handlePasswordChange}/>
                    </div>
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button>Guardar Cambios</Button>
              </CardFooter>
            </Card>
          </form>
        </div>
      </main>
  );
}
