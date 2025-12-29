/**
 * @fileoverview New page for the receiving wizard.
 * Allows warehouse staff to register incoming products and assign them to locations.
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, PackageCheck, Search, CheckCircle, ArrowRight, List, ArrowLeft } from 'lucide-react';
import { useReceivingWizard } from '@/modules/warehouse/hooks/useReceivingWizard';
import { SearchInput } from '@/components/ui/search-input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function ReceivingWizardPage() {
    const {
        state,
        actions,
        selectors,
    } = useReceivingWizard();

    const {
        isLoading,
        step,
        selectedProduct,
        suggestedLocations,
        isSubmitting,
        lastReceipt,
        productSearchTerm,
        isProductSearchOpen,
        locationSearchTerm,
        isLocationSearchOpen,
        newLocationId,
        quantity,
        humanReadableId,
        documentId
    } = state;

    if (isLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Skeleton className="h-96 w-full max-w-xl" />
            </main>
        )
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
            <Card className="w-full max-w-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PackageCheck className="h-6 w-6 text-primary"/>
                        Asistente de Recepción de Mercadería
                    </CardTitle>
                    <CardDescription>
                        Registra el ingreso de producto terminado o compras a una ubicación de bodega.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {step === 'select_product' && (
                        <div className="space-y-2">
                            <Label htmlFor="product-search" className="text-lg font-semibold">1. Buscar o escanear el Producto</Label>
                            <SearchInput
                                options={selectors.productOptions}
                                onSelect={actions.handleSelectProduct}
                                value={productSearchTerm}
                                onValueChange={actions.setProductSearchTerm}
                                onKeyDown={actions.handleProductSearchKeyDown}
                                open={isProductSearchOpen}
                                onOpenChange={actions.setProductSearchOpen}
                                placeholder="Buscar por código o descripción..."
                                className="h-12 text-base"
                            />
                        </div>
                    )}
                    {step === 'select_location' && selectedProduct && (
                        <div className="space-y-4">
                            <Alert>
                                <AlertTitle className="flex items-center gap-2">
                                    <Search className="h-4 w-4" /> Producto Seleccionado
                                </AlertTitle>
                                <AlertDescription>
                                    <strong>{selectedProduct.description}</strong> ({selectedProduct.id})
                                </AlertDescription>
                            </Alert>
                             <div className="space-y-3">
                                <h3 className="font-semibold">2. Elige una Ubicación</h3>
                                {suggestedLocations.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">Ubicaciones sugeridas para este producto:</p>
                                        {suggestedLocations.map(loc => (
                                            <Button key={loc.id} variant="outline" className="w-full justify-start" onClick={() => actions.handleUseSuggestedLocation(loc.id)}>
                                                {selectors.renderLocationPath(loc.id)}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                                <Button className="w-full" onClick={actions.handleAssignNewLocation}>
                                    <ArrowRight className="mr-2 h-4 w-4" />
                                    Asignar a una Nueva Ubicación
                                </Button>
                            </div>
                        </div>
                    )}
                    {(step === 'confirm_suggested' || step === 'confirm_new') && selectedProduct && (
                        <div className="space-y-4">
                            <Alert>
                                <AlertTitle className="flex items-center gap-2">
                                    <Search className="h-4 w-4" /> Producto Seleccionado
                                </AlertTitle>
                                <AlertDescription>
                                    <strong>{selectedProduct.description}</strong> ({selectedProduct.id})
                                </AlertDescription>
                            </Alert>
                             <div className="space-y-2">
                                <Label className="text-lg font-semibold">
                                    {step === 'confirm_new' ? '3. Buscar o escanear NUEVA Ubicación' : '3. Confirmar Datos de Ingreso'}
                                </Label>
                                {step === 'confirm_new' ? (
                                    <div className="flex items-center gap-2">
                                        <SearchInput
                                            options={selectors.locationOptions}
                                            onSelect={actions.handleSelectLocation}
                                            value={locationSearchTerm}
                                            onValueChange={actions.setLocationSearchTerm}
                                            placeholder="Buscar ubicación por código o nombre..."
                                            open={isLocationSearchOpen}
                                            onOpenChange={actions.setLocationSearchOpen}
                                        />
                                        <Button type="button" variant="outline" size="icon" onClick={() => { actions.setLocationSearchTerm('*'); actions.setLocationSearchOpen(true); }}>
                                            <List className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="p-3 border rounded-md bg-muted">
                                        {selectors.renderLocationPath(state.selectedLocationId!)}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="quantity">Cantidad Recibida</Label>
                                    <Input id="quantity" type="number" value={quantity} onChange={e => actions.setQuantity(e.target.value)} placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="humanReadableId">Nº Lote / ID Físico (Opcional)</Label>
                                    <Input id="humanReadableId" value={humanReadableId} onChange={e => actions.setHumanReadableId(e.target.value)} placeholder="Ej: LOTE-A123" />
                                </div>
                                 <div className="space-y-2 col-span-2">
                                    <Label htmlFor="documentId">Documento (Boleta, etc. Opcional)</Label>
                                    <Input id="documentId" value={documentId} onChange={e => actions.setDocumentId(e.target.value)} placeholder="Ej: Boleta de entrega #5543" />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'finished' && (
                        <div className="text-center space-y-4 py-8">
                            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                            <h2 className="text-2xl font-bold">¡Recepción Registrada!</h2>
                            {lastReceipt && (
                                <p className="text-muted-foreground">
                                    Se registró la unidad <strong>{lastReceipt.unitCode}</strong> para el producto <strong>{lastReceipt.productDescription}</strong> en la ubicación <strong>{lastReceipt.locationPath}</strong>.
                                </p>
                            )}
                            <Button onClick={actions.handleReset} className="w-full">
                                <PackageCheck className="mr-2 h-4 w-4" />
                                Registrar Otro Producto
                            </Button>
                        </div>
                    )}
                </CardContent>
                 {step !== 'finished' && (
                    <CardFooter className="flex-col items-start gap-4">
                        {(step === 'confirm_new' || step === 'confirm_suggested') && (
                            <Button className="w-full" onClick={actions.handleConfirmAndRegister} disabled={isSubmitting || !newLocationId || !quantity}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Confirmar y Registrar Unidad
                            </Button>
                        )}
                        {step !== 'select_product' && (
                            <Button variant="outline" className="w-full" onClick={actions.handleGoBack}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Volver al Paso Anterior
                            </Button>
                        )}
                    </CardFooter>
                 )}
            </Card>
        </main>
    );
}
