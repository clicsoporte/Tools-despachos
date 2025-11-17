
/**
 * @fileoverview Client component for the initial setup wizard.
 * This form is displayed only when no users exist in the database, allowing
 * the first administrator to be created.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError } from "@/modules/core/lib/logger";
import { createFirstUser } from "@/modules/core/lib/user-actions";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface SetupWizardProps {
  clientInfo: {
    ip: string;
    host: string;
  };
}

export function SetupWizard({ clientInfo }: SetupWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    whatsapp: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
        toast({ title: "Campos Incompletos", description: "Nombre, correo y contraseña son requeridos.", variant: "destructive" });
        return;
    }
    if (formData.password !== formData.confirmPassword) {
        toast({ title: "Contraseñas no coinciden", description: "La contraseña y su confirmación deben ser iguales.", variant: "destructive" });
        return;
    }
    if (formData.password.length < 6) {
        toast({ title: "Contraseña Débil", description: "La contraseña debe tener al menos 6 caracteres.", variant: "destructive" });
        return;
    }

    setIsProcessing(true);
    try {
        await createFirstUser(formData, clientInfo);
        toast({ title: "¡Configuración Completa!", description: "Tu cuenta de administrador ha sido creada. Ahora puedes iniciar sesión." });
        router.replace('/'); // Redirect to the login page
    } catch (error: any) {
        logError("Error during first user creation", { error: error.message });
        toast({ title: "Error en la Configuración", description: error.message, variant: "destructive" });
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre Completo</Label>
        <Input id="name" value={formData.name} onChange={handleChange} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo Electrónico</Label>
        <Input id="email" type="email" value={formData.email} onChange={handleChange} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" value={formData.password} onChange={handleChange} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
        <Input id="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required />
      </div>
      <CardFooter className="p-0 pt-4">
        <Button type="submit" className="w-full" disabled={isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear Administrador
        </Button>
      </CardFooter>
    </form>
  );
}
