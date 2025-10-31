"use client";

import { useState, useEffect } from "react";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { useToast } from "../../../../modules/core/hooks/use-toast";
import type { Company } from "../../../../modules/core/types";
import { Skeleton } from "../../../../components/ui/skeleton";
import { logInfo } from "../../../../modules/core/lib/logger";
import { getCompanySettings, saveCompanySettings } from "../../../../modules/core/lib/db";
import { usePageTitle } from "../../../../modules/core/hooks/usePageTitle";
import { useAuthorization } from "../../../../modules/core/hooks/useAuthorization";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "next/navigation";

export default function QuoterSettingsPage() {
  const { isAuthorized } = useAuthorization(['admin:settings:general']);
  const { toast } = useToast();
  const router = useRouter();
  const { setCompanyData: setAuthCompanyData } = useAuth();
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle("Configuración del Cotizador");
    const loadData = async () => {
        setIsLoading(true);
        const data = await getCompanySettings();
        if (data && data.quoterShowTaxId === undefined) {
            data.quoterShowTaxId = true;
        }
        setCompanyData(data);
        setIsLoading(false);
    }
    if (isAuthorized) {
        loadData();
    }
  }, [setTitle, isAuthorized]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!companyData) return;
    const { id, value, type } = e.target;
    const isNumber = type === 'number';
    setCompanyData(prev => prev ? ({...prev, [id]: isNumber ? parseInt(value, 10) : value}) : null);
  }

  const handleSubmit = async () => {
    if (!companyData) return;
    await saveCompanySettings(companyData);
    toast({
      title: "Configuración Guardada",
      description: "Los datos del cotizador han sido actualizados.",
    });
    await logInfo("Configuración del cotizador guardada", { companyName: companyData.name });
    router.refresh();
  };
  
  if (isAuthorized === null) {
    return null;
  }

  if (isLoading || !companyData) {
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
            <Skeleton className="h-64 w-full" />
        </div>
        </main>
    )
  }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <Card>
                <CardHeader>
                    <CardTitle>Ajustes del Cotizador</CardTitle>
                    <CardDescription>Configura los valores por defecto y consecutivos para el módulo de cotizaciones.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="quotePrefix">Prefijo de Cotización</Label>
                            <Input 
                                id="quotePrefix" 
                                value={companyData.quotePrefix || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="nextQuoteNumber">Próximo Número de Cotización</Label>
                            <Input 
                                id="nextQuoteNumber"
                                type="number"
                                value={companyData.nextQuoteNumber || 1}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="decimalPlaces">Decimales en Precios</Label>
                            <Input 
                                id="decimalPlaces"
                                type="number"
                                value={companyData.decimalPlaces ?? 2}
                                onChange={handleChange}
                            />
                        </div>
                    </div>
                     <div className="flex items-center space-x-2 pt-4">
                        <Switch
                            id="quoterShowTaxId"
                            checked={companyData.quoterShowTaxId}
                            onCheckedChange={(checked) => setCompanyData(prev => prev ? { ...prev, quoterShowTaxId: checked } : null)}
                        />
                        <Label htmlFor="quoterShowTaxId">Mostrar cédula del cliente en la tarjeta de información</Label>
                    </div>
                </CardContent>
            </Card>

            <Card className="mt-6">
                <CardFooter className="border-t px-6 py-4">
                  <Button>Guardar Cambios</Button>
                </CardFooter>
            </Card>
          </form>
        </div>
      </main>
  );
}
