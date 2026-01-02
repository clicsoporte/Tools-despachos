
/**
 * @fileoverview Client component for handling the authentication form,
 * now also responsible for determining whether to show the login form or the setup wizard.
 */
"use client";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Network, UserPlus, AlertTriangle } from "lucide-react";
import React, { useState, useEffect } from "react";
import type { User } from "@/modules/core/types";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
  login,
  getAllUsers,
  saveAllUsers,
  sendRecoveryEmail,
} from "@/modules/core/lib/auth-client";
import { getInitialPageData } from "@/app/actions";
import { logInfo, logWarn, logError } from "@/modules/core/lib/logger";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { SetupWizard } from "./setup-wizard";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AuthFormProps {
  clientInfo: {
    ip: string;
    host: string;
  };
}

/**
 * Renders the login form, setup wizard, or password recovery flow.
 * This component is now the entry point for authentication logic on the client.
 */
export function AuthForm({ clientInfo }: AuthFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isReady, refreshAuth, redirectAfterLogin } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initial page state
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [companyName, setCompanyName] = useState<string>("Clic-Tools");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth flow state
  const [authStep, setAuthStep] = useState<"login" | "force_change" | "recovery_success">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [userForPasswordChange, setUserForPasswordChange] = useState<User | null>(null);

  // Recovery dialog state
  const [isRecoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");

  // New password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  
  useEffect(() => {
    // If the user is already logged in, redirect them to the dashboard.
    if (isReady && user) {
      redirectAfterLogin("/dashboard");
    }
  }, [isReady, user, redirectAfterLogin]);

  useEffect(() => {
    async function checkUserStatus() {
      // Only run this check if the user is not logged in.
      if (!user) {
        try {
          const { hasUsers, companyName } = await getInitialPageData();
          setHasUsers(hasUsers);
          setCompanyName(companyName);
        } catch (err: any) {
          console.error("Critical error on initial page data fetch:", err);
          setError("No se pudo conectar con la base de datos. Revisa la consola del servidor.");
        } finally {
          setIsLoading(false);
        }
      } else {
        // If user is already loaded, we don't need to fetch initial data.
        setIsLoading(false);
      }
    }
    checkUserStatus();
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const loginResult = await login(email, password, clientInfo);

      if (loginResult.user) {
        if (loginResult.forcePasswordChange) {
          setUserForPasswordChange(loginResult.user);
          setAuthStep("force_change");
        } else {
          // Pass the user object directly to refreshAuth to avoid race conditions
          const refreshedUser = await refreshAuth(loginResult.user);
          if (refreshedUser) {
            redirectAfterLogin();
          } else {
             throw new Error("La sesión no se pudo establecer después del login.");
          }
        }
      } else {
        toast({ title: "Credenciales Incorrectas", variant: "destructive" });
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
      toast({ title: "Contraseña Débil", description: "Debe tener al menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const allUsers = await getAllUsers();
      const updatedUsers = allUsers.map((u) => u.id === userForPasswordChange.id ? { ...u, password: newPassword, forcePasswordChange: false } : u);
      await saveAllUsers(updatedUsers);
      await logInfo(`Password for user ${userForPasswordChange.name} was changed successfully (forced).`);
      setAuthStep("recovery_success");
    } catch (error: any) {
      logError("Failed to set new password", { error: error.message });
      toast({ title: "Error", description: "No se pudo actualizar la contraseña.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecoveryStart = async () => {
    if (!recoveryEmail) return;
    setIsProcessing(true);
    try {
      await sendRecoveryEmail(recoveryEmail, clientInfo);
      toast({ title: "Correo de Recuperación Enviado", description: "Si el correo existe, recibirás una contraseña temporal." });
      setRecoveryDialogOpen(false);
      setRecoveryEmail("");
    } catch (error: any) {
      logError("Password recovery failed", { error: error.message, email: recoveryEmail });
      toast({ title: "Error de Recuperación", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const returnToLogin = () => {
    setEmail("");
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setUserForPasswordChange(null);
    setAuthStep("login");
  };
  
  const getHeaderIcon = () => {
    if (isLoading) return <Loader2 className="h-8 w-8 animate-spin" />;
    if (error) return <AlertTriangle className="h-8 w-8" />;
    return hasUsers ? <Network className="h-8 w-8" /> : <UserPlus className="h-8 w-8" />;
  };

  const getHeaderTitle = () => {
    if (isLoading) return "Cargando...";
    if (error) return "Error";
    return hasUsers ? companyName : "Bienvenido a Clic-Tools";
  };

  const getHeaderDescription = () => {
    if (isLoading) return "Verificando el estado del sistema...";
    if (error) return "Ocurrió un error al inicializar.";
    if (authStep === 'force_change') return "Por seguridad, debes establecer una nueva contraseña.";
    if (authStep === 'recovery_success') return "Tu contraseña ha sido actualizada.";
    return hasUsers ? "Inicia sesión para acceder a tus herramientas" : "Completa la configuración para crear tu cuenta de administrador";
  };

  const renderContent = () => {
    if (isLoading || (isReady && user)) return <div className="flex justify-center items-center h-48"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    if (error) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><CardTitle>Error Crítico</CardTitle><AlertDescription>{error}</AlertDescription></Alert>;
    
    if (hasUsers === false) return <SetupWizard clientInfo={clientInfo} />;

    switch (authStep) {
      case 'force_change':
        return (
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="new-password">Nueva Contraseña</Label><Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="confirm-new-password">Confirmar Nueva Contraseña</Label><Input id="confirm-new-password" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required /></div>
            <CardFooter className="p-0 pt-4"><Button onClick={handleSetNewPassword} className="w-full" disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Establecer Nueva Contraseña</Button></CardFooter>
          </div>
        );
      case 'recovery_success':
        return (
          <div className="space-y-4 text-center">
            <p className="text-green-600 font-medium">¡Contraseña actualizada!</p>
            <p className="text-sm text-muted-foreground">Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <CardFooter className="p-0 pt-4"><Button onClick={returnToLogin} className="w-full">Regresar a Inicio</Button></CardFooter>
          </div>
        );
      case 'login':
      default:
        return (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="email">Correo Electrónico</Label><Input id="email" type="email" placeholder="usuario@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label htmlFor="password">Contraseña</Label>
                <Dialog open={isRecoveryDialogOpen} onOpenChange={setRecoveryDialogOpen}>
                  <DialogTrigger asChild><button type="button" className="text-sm font-medium text-primary hover:underline">¿Olvidaste tu contraseña?</button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>Recuperación de Contraseña</DialogTitle><DialogDescription>Ingresa tu correo. Si existe, te enviaremos una contraseña temporal.</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4"><div className="space-y-2"><Label htmlFor="recovery-email">Correo Electrónico</Label><Input id="recovery-email" type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="tu@correo.com" /></div></div>
                    <DialogFooter><DialogClose asChild><Button variant="ghost" type="button">Cancelar</Button></DialogClose><Button onClick={handleRecoveryStart} type="button" disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar Correo</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <CardFooter className="p-0 pt-4"><Button type="submit" className="w-full" disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Iniciar Sesión</Button></CardFooter>
          </form>
        );
    }
  };

  return (
    <>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">{getHeaderIcon()}</div>
        <CardTitle className="text-3xl font-bold">{getHeaderTitle()}</CardTitle>
        <CardDescription>{getHeaderDescription()}</CardDescription>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </>
  );
}
