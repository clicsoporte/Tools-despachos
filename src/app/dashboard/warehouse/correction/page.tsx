/**
 * @fileoverview New page for correcting warehouse receiving errors.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getInventoryUnitById, correctInventoryUnit } from '@/modules/warehouse/lib/actions';
import type { InventoryUnit, Product } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, Save, Search, RotateCcw, Package, AlertTriangle } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function CorrectionPage() {
    const { isAuthorized } = useAuthorization(['warehouse:correction:use']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, products: authProducts } = useAuth();
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [unitSearchTerm, setUnitSearchTerm] = useState('');
    const [unitToCorrect, setUnitToCorrect] = useState<InventoryUnit | null>(null);
    
    const [newProductSearchTerm, setNewProductSearchTerm] = useState('');
    const [newProductId, setNewProductId] = useState<string | null>(null);
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    
    const [debouncedProductSearch] = useDebounce(newProductSearchTerm, 300);

    const originalProduct = useMemo(() => 
        unitToCorrect ? authProducts.find(p => p.id === unitToCorrect.productId) : null, 
    [unitToCorrect, authProducts]);

    useEffect(() => {
        setTitle("Corrección de Ingresos");
    }, [setTitle]);

    const handleSearchUnit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!unitSearchTerm) return;
        setIsLoading(true);
        setUnitToCorrect(null);
        setNewProductId(null);
        setNewProductSearchTerm('');
        try {
            const unit = await getInventoryUnitById(unitSearchTerm);
            if (!unit) {
                toast({ title: 'No Encontrado', description: `No se encontró ninguna unidad con el código "${unitSearchTerm}".`, variant: 'destructive' });
            }
            setUnitToCorrect(unit);
        } catch (error: any) {
            logError('Failed to search inventory unit for correction', { error: error.message });
            toast({ title: 'Error', description: 'No se pudo buscar la unidad.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSelectNewProduct = (productId: string) => {
        const product = authProducts.find(p => p.id === productId);
        if (product) {
            setNewProductId(productId);
            setNewProductSearchTerm(`[${product.id}] ${product.description}`);
            setIsProductSearchOpen(false);
        }
    };

    const handleCorrection = async () => {
        if (!unitToCorrect || !newProductId || !user) {
            toast({ title: 'Datos Incompletos', description: 'Se requiere una unidad y un nuevo producto para la corrección.', variant: 'destructive'});
            return;
        }

        setIsSubmitting(true);
        try {
            await correctInventoryUnit(unitToCorrect, newProductId, user.id);
            toast({ title: 'Corrección Exitosa', description: `La unidad ${unitToCorrect.unitCode} ha sido anulada y reemplazada con el nuevo producto.` });
            logInfo('Inventory unit corrected', { oldUnit: unitToCorrect.unitCode, newProduct: newProductId, user: user.name });
            handleReset();
        } catch (error: any) {
            logError('Failed to correct inventory unit', { error: error.message });
            toast({ title: 'Error al Corregir', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReset = () => {
        setUnitSearchTerm('');
        setUnitToCorrect(null);
        setNewProductId(null);
        setNewProductSearchTerm('');
        setIsLoading(false);
    };
    
    const productOptions = useMemo(() => {
        if (debouncedProductSearch.length < 2) return [];
        return authProducts
            .filter(p => p.id.toLowerCase().includes(debouncedProductSearch.toLowerCase()) || p.description.toLowerCase().includes(debouncedProductSearch.toLowerCase()))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch]);


    if (isAuthorized === false) return null;

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-2xl space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><RotateCcw className="h-6 w-6"/>Corrección de Ingresos de Almacén</CardTitle>
                        <CardDescription>Busca una unidad de inventario por su código para anularla y crear una nueva con el producto correcto.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSearchUnit} className="flex items-end gap-2">
                             <div className="flex-1 space-y-2">
                                <Label htmlFor="unit-code-search">Código de Unidad (Lote/Tarima)</Label>
                                <Input 
                                    id="unit-code-search"
                                    placeholder="Escanear o escribir código U-XXXXX"
                                    value={unitSearchTerm}
                                    onChange={(e) => setUnitSearchTerm(e.target.value)}
                                />
                            </div>
                            <Button type="submit" disabled={isLoading || !unitSearchTerm}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4"/>}
                                Buscar
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>}

                {unitToCorrect && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5"/>Detalles del Ingreso Original</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div><p className="font-semibold text-muted-foreground">ID Unidad:</p><p className="font-mono">{unitToCorrect.unitCode}</p></div>
                                <div><p className="font-semibold text-muted-foreground">Producto Original:</p><p>{originalProduct?.description || unitToCorrect.productId}</p></div>
                                <div><p className="font-semibold text-muted-foreground">Cantidad:</p><p>{unitToCorrect.quantity}</p></div>
                                <div><p className="font-semibold text-muted-foreground">ID Físico/Lote:</p><p>{unitToCorrect.humanReadableId || 'N/A'}</p></div>
                                <div className="col-span-2"><p className="font-semibold text-muted-foreground">Creado:</p><p>{unitToCorrect.createdBy} el {format(parseISO(unitToCorrect.createdAt), 'dd/MM/yyyy HH:mm')}</p></div>
                            </div>

                            <Separator />

                            <div className="space-y-2">
                                <Label htmlFor="new-product" className="font-semibold">Seleccionar Producto Correcto</Label>
                                <SearchInput
                                    options={productOptions}
                                    onSelect={handleSelectNewProduct}
                                    value={newProductSearchTerm}
                                    onValueChange={setNewProductSearchTerm}
                                    placeholder="Buscar por código o descripción..."
                                    open={isProductSearchOpen}
                                    onOpenChange={setIsProductSearchOpen}
                                />
                            </div>
                             <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>¡Acción Irreversible!</AlertTitle>
                                <AlertDescription>
                                    Al continuar, la unidad original será anulada (su cantidad se pondrá en cero) y se creará una nueva unidad con el producto correcto. Esta acción quedará registrada en el historial de movimientos.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                        <CardFooter className="justify-between">
                            <Button variant="ghost" onClick={handleReset}>Cancelar</Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button disabled={!newProductId || isSubmitting}>
                                        <Save className="mr-2 h-4 w-4"/>
                                        Aplicar Corrección
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>¿Confirmar Corrección?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Vas a anular el ingreso de <strong>{unitToCorrect.quantity}x {originalProduct?.description}</strong> y registrar un nuevo ingreso para <strong>{authProducts.find(p => p.id === newProductId)?.description}</strong>. ¿Estás seguro?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>No, cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleCorrection} disabled={isSubmitting}>
                                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                            Sí, Corregir
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </CardFooter>
                    </Card>
                )}
            </div>
        </main>
    );
}
