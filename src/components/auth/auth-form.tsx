
/**
 * @fileoverview Client component for handling the authentication form,
 * including login and password recovery.
 */
"use client";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import type { User } from "@/modules/core/types";
import { useToast } from "@/modules/core/hooks/use-toast";
import { login, getAllUsers, saveAllUsers, sendRecoveryEmail } from "@/modules/core/lib/auth-client";
import { logInfo, logWarn, logError } from "@/modules/core/lib/logger";
import { useAuth } from "@/modules/core/hooks/useAuth";

interface AuthFormProps {
  clientInfo: {
    ip: string;
    host: string;
  };
}

/**
 * Renders the login form and handles the password recovery flow.
 * Receives clientInfo from a server component to use in logging.
 */
export function AuthForm({ clientInfo }: AuthFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { refreshAuthAndRedirect } = useAuth();
  
  // State for the main auth flow
  const [authStep, setAuthStep] = useState<'login' | 'force_change' | 'recovery_success'>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [userForPasswordChange, setUserForPasswordChange] = useState<User | null>(null);

  // State for password recovery dialog
  const [isRecoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  
  // State for new password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const loginResult = await login(email, password, clientInfo);

      if (loginResult.user) {
        if (loginResult.forcePasswordChange) {
          setUserForPasswordChange(loginResult.user);
          setAuthStep('force_change');
        } else {
          await refreshAuthAndRedirect('/dashboard');
        }
      } else {
        toast({
          title: "Credenciales Incorrectas",
          description: "El correo o la contraseña no son correctos. Inténtalo de nuevo.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({ title: "Error de Inicio de Sesión", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetNewPassword = async () => {
    if (!userForPasswordChange) return;

    if (newPassword.length < 6) {
        toast({ title: "Contraseña Débil", description: "La nueva contraseña debe tener al menos 6 caracteres.", variant: "destructive"});
        return;
    }

    if (newPassword !== confirmNewPassword) {
        toast({ title: "Error", description: "Las contraseñas no coinciden.", variant: "destructive"});
        return;
    }

    setIsProcessing(true);
    try {
        const allUsers = await getAllUsers();
        const updatedUsers = allUsers.map(u => {
            if (u.id === userForPasswordChange.id) {
                return { ...u, password: newPassword, forcePasswordChange: false };
            }
            return u;
        });

        await saveAllUsers(updatedUsers); 
        
        await logInfo(`Password for user ${userForPasswordChange.name} was changed successfully (forced).`);
        setAuthStep('recovery_success');

    } catch (error: any) {
        logError('Failed to set new password', { error: error.message });
        toast({ title: "Error", description: "No se pudo actualizar la contraseña.", variant: "destructive"});
    } finally {
        setIsProcessing(false);
    }
  };

  const handleRecoveryStart = async () => {
    if (!recoveryEmail) return;
    setIsProcessing(true);
    try {
        await sendRecoveryEmail(recoveryEmail, clientInfo);
        toast({
            title: "Correo de Recuperación Enviado",
            description: "Si el correo está registrado, recibirás una contraseña temporal. Revisa tu bandeja de entrada.",
        });
        setRecoveryDialogOpen(false);
        resetRecovery();
    } catch (error: any) {
        logError("Password recovery process failed", { error: error.message, email: recoveryEmail });
        toast({ title: "Error de Recuperación", description: error.message, variant: "destructive" });
    } finally {
        setIsProcessing(false);
    }
  }

  const resetRecovery = () => {
    setRecoveryEmail("");
  }
  
  const returnToLogin = () => {
    setEmail("");
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setUserForPasswordChange(null);
    setAuthStep('login');
  };

  return (
    <div className="space-y-4">
      {authStep === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input id="email" type="email" placeholder="usuario@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required suppressHydrationWarning />
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="password">Contraseña</Label>
                    <Dialog open={isRecoveryDialogOpen} onOpenChange={(open) => { setRecoveryDialogOpen(open); if(!open) resetRecovery(); }}>
                        <DialogTrigger asChild>
                            <button type="button" className="text-sm font-medium text-primary hover:underline">¿Olvidaste tu contraseña?</button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Recuperación de Contraseña</DialogTitle>
                                <DialogDescription>Ingresa tu correo. Si existe, te enviaremos una contraseña temporal.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="recovery-email">Correo Electrónico</Label>
                                    <Input id="recovery-email" type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} placeholder="tu@correo.com" />
                                </div>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button variant="ghost" type="button">Cancelar</Button></DialogClose>
                                <Button onClick={handleRecoveryStart} type="button" disabled={isProcessing}>
                                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    Enviar Correo
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required suppressHydrationWarning />
            </div>
            <CardFooter className="p-0 pt-4">
                <Button type="submit" className="w-full" disabled={isProcessing}>
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Iniciar Sesión
                </Button>
            </CardFooter>
        </form>
      )}
      
      {authStep === 'force_change' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">Por seguridad, debes establecer una nueva contraseña.</p>
          <div className="space-y-2">
              <Label htmlFor="new-password">Nueva Contraseña</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
          </div>
           <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirmar Nueva Contraseña</Label>
              <Input id="confirm-new-password" type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required />
          </div>
           <CardFooter className="p-0 pt-4">
              <Button onClick={handleSetNewPassword} className="w-full" disabled={isProcessing}>
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Establecer Nueva Contraseña
              </Button>
          </CardFooter>
        </div>
      )}

      {authStep === 'recovery_success' && (
        <div className="space-y-4 text-center">
            <p className="text-green-600 font-medium">¡Contraseña actualizada!</p>
            <p className="text-sm text-muted-foreground">Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <CardFooter className="p-0 pt-4">
                <Button onClick={returnToLogin} className="w-full">Regresar a Inicio</Button>
            </CardFooter>
        </div>
      )}
    </div>
  );
}
