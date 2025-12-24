/**
 * @fileoverview New page for the guided rack population wizard.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { getLocations, getChildLocations, lockEntity, releaseLock, assignItemToLocation } from '@/modules/warehouse/lib/actions';
import type { Product, WarehouseLocation, WizardSession } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { SearchInput } from '@/components/ui/search-input';
import { Loader2, CheckCircle, Play, ArrowRight, ArrowLeft, LogOut } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

type WizardStep = 'setup' | 'populating' | 'finished';

const renderLocationPathAsString = (locationId: number, locations: WarehouseLocation[]): string => {
    if (!locationId) return '';
    const path: WarehouseLocation[] = [];
    let current: WarehouseLocation | undefined = locations.find(l => l.id === locationId);
    
    while (current) {
        path.unshift(current);
        const parentId = current.parentId;
        current = parentId ? locations.find(l => l.id === parentId) : undefined;
    }
    return path.map(l => l.name).join(' > ');
};

export default function PopulationWizardPage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, companyData, products: authProducts } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [wizardStep, setWizardStep] = useState<WizardStep>('setup');
    const [allLocations, setAllLocations] = useState<WarehouseLocation[]>([]);
    
    // Setup state
    const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
    const [rackLevels, setRackLevels] = useState<WarehouseLocation[]>([]);
    const [selectedLevelIds, setSelectedLevelIds] = useState<Set<number>>(new Set());
    const [lockedLevels, setLockedLevels] = useState<any[]>([]);

    // Populating state
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [locationsToPopulate, setLocationsToPopulate] = useState<WarehouseLocation[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [productSearch, setProductSearch] = useState('');
    const [isProductSearchOpen, setProductSearchOpen] = useState(false);
    const [lastAssignment, setLastAssignment] = useState<{ location: string; product: string; code: string; } | null>(null);

    const [debouncedProductSearch] = useDebounce(productSearch, 300);

    const rackOptions = useMemo(() => 
        allLocations.filter(l => l.type === 'rack').map(r => ({ value: String(r.id), label: `${r.name} (${r.code})` })),
    [allLocations]);
    
    const productOptions = useMemo(() => {
        if (!debouncedProductSearch) return [];
        const searchLower = debouncedProductSearch.toLowerCase();
        if (searchLower.length < 2) return [];

        return authProducts
            .filter(p => p.id.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower))
            .map(p => ({ value: p.id, label: `[${p.id}] ${p.description}` }));
    }, [authProducts, debouncedProductSearch]);

    useEffect(() => {
        setTitle("Asistente de Poblado de Racks");
        const loadInitial = async () => {
            setIsLoading(true);
            try {
                const locs = await getLocations();
                setAllLocations(locs);
            } catch (err: any) {
                toast({ title: 'Error', description: 'No se pudieron cargar las ubicaciones.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };
        loadInitial();
    }, [setTitle, toast]);

    const handleSelectRack = (rackId: string) => {
        const id = Number(rackId);
        setSelectedRackId(id);
        const levels = allLocations.filter(l => l.parentId === id);
        setRackLevels(levels);
        setSelectedLevelIds(new Set()); // Reset selection
    };

    const handleToggleLevel = (levelId: number) => {
        setSelectedLevelIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(levelId)) {
                newSet.delete(levelId);
            } else {
                newSet.add(levelId);
            }
            return newSet;
        });
    };

    const handleStartWizard = async () => {
        if (!user || !selectedRackId || selectedLevelIds.size === 0) {
            toast({ title: 'Selección Incompleta', description: 'Por favor, selecciona un rack y al menos un nivel para continuar.', variant: 'destructive' });
            return;
        }
        setIsLoading(true);

        try {
            const levelNames = Array.from(selectedLevelIds).map(id => rackLevels.find(l => l.id === id)?.name || '').join(', ');
            const rackName = rackLevels[0]?.parentId ? renderLocationPathAsString(rackLevels[0].parentId, allLocations) : '';

            const { sessionId: newSessionId, locked } = await lockEntity({
                entityIds: Array.from(selectedLevelIds),
                entityName: `${rackName} > ${levelNames}`,
                userId: user.id,
                userName: user.name,
            });

            if (locked) {
                 toast({ title: 'Niveles ya en uso', description: 'Algunos de los niveles seleccionados están siendo poblados por otro usuario.', variant: 'destructive' });
                 setIsLoading(false);
                 return;
            }

            setSessionId(newSessionId);
            const childLocations = await getChildLocations(Array.from(selectedLevelIds));
            
            setLocationsToPopulate(childLocations.sort((a,b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
            setCurrentIndex(0);
            setWizardStep('populating');
            
        } catch (err: any) {
            toast({ title: 'Error al Iniciar', description: err.message, variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };
    
    const assignAndNext = async (productId?: string) => {
        const currentLocation = locationsToPopulate[currentIndex];
        if (productId && user) {
            try {
                await assignItemToLocation(productId, currentLocation.id, null, user.name);
                const product = authProducts.find(p => p.id === productId);
                const productName = product?.description || productId;
                const productCode = product?.id || productId;
                setLastAssignment({ 
                    location: renderLocationPathAsString(currentLocation.id, allLocations), 
                    product: productName,
                    code: productCode
                });
            } catch (err: any) {
                toast({ title: "Error al Asignar", description: err.message, variant: "destructive" });
                return; // Stop flow on error
            }
        }
        setProductSearch('');
        if (currentIndex < locationsToPopulate.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            await handleFinishWizard();
        }
    };
    
    const handleProductSelect = (productId: string) => {
        setProductSearch(productId);
        setProductSearchOpen(false);
        assignAndNext(productId);
    };

    const handleSkip = () => {
        assignAndNext(); // No product ID, just move to next
    };

    const handlePrevious = () => {
        setCurrentIndex(prev => Math.max(0, prev - 1));
    };

    const handleFinishWizard = async () => {
        if (sessionId) {
            await releaseLock(sessionId);
        }
        setWizardStep('finished');
    };
    
    const resetWizard = () => {
        setSelectedRackId(null);
        setRackLevels([]);
        setSelectedLevelIds(new Set());
        setLockedLevels([]);
        setSessionId(null);
        setLocationsToPopulate([]);
        setCurrentIndex(0);
        setLastAssignment(null);
        setWizardStep('setup');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && productOptions.length > 0) {
            e.preventDefault();
            handleProductSelect(productOptions[0].value);
        }
    };
    
    if (isLoading && wizardStep === 'setup') {
        return <main className="flex-1 p-4 md:p-6 lg:p-8"><Skeleton className="h-80 w-full max-w-2xl mx-auto"/></main>
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
            {wizardStep === 'setup' && (
                 <Card className="w-full max-w-2xl">
                    <CardHeader>
                        <CardTitle>Asistente de Poblado de Racks</CardTitle>
                        <CardDescription>Selecciona el rack y los niveles que deseas poblar de forma guiada.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label>1. Selecciona el Rack</Label>
                            <SearchInput
                                options={rackOptions}
                                onSelect={handleSelectRack}
                                placeholder="Busca un rack por nombre o código..."
                                value={selectedRackId ? rackOptions.find(r => r.value === String(selectedRackId))?.label || '' : ''}
                                onValueChange={(val) => {
                                    const rack = rackOptions.find(r => r.label.toLowerCase().includes(val.toLowerCase()));
                                    if(rack) handleSelectRack(rack.value);
                                }}
                                open={false}
                                onOpenChange={()=>{}}
                            />
                        </div>
                        {rackLevels.length > 0 && (
                            <div className="space-y-2">
                                <Label>2. Selecciona los Niveles a Poblar</Label>
                                <div className="p-4 border rounded-md max-h-60 overflow-y-auto space-y-2">
                                    {rackLevels.map(level => (
                                        <div key={level.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`level-${level.id}`}
                                                onCheckedChange={() => handleToggleLevel(level.id)}
                                                checked={selectedLevelIds.has(level.id)}
                                            />
                                            <Label htmlFor={`level-${level.id}`} className="font-normal">{level.name}</Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleStartWizard} disabled={selectedLevelIds.size === 0 || isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            <Play className="mr-2 h-4 w-4"/>
                            Comenzar Poblado Guiado
                        </Button>
                    </CardFooter>
                 </Card>
            )}

            {wizardStep === 'populating' && (
                <Card className="w-full max-w-lg">
                    <CardHeader>
                        <CardTitle>Poblando Ubicaciones...</CardTitle>
                        <Progress value={((currentIndex + 1) / locationsToPopulate.length) * 100} className="mt-2" />
                        <CardDescription className="text-center pt-2">
                            Ubicación {currentIndex + 1} de {locationsToPopulate.length}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 text-center">
                        <div>
                            <Label className="text-muted-foreground">Ubicación Actual</Label>
                            <p className="text-2xl font-bold">{renderLocationPathAsString(locationsToPopulate[currentIndex]?.id, allLocations)}</p>
                        </div>
                        <SearchInput
                            options={productOptions}
                            onSelect={handleProductSelect}
                            value={productSearch}
                            onValueChange={setProductSearch}
                            placeholder="Escanear o buscar producto..."
                            onKeyDown={handleKeyDown}
                            open={isProductSearchOpen}
                            onOpenChange={setProductSearchOpen}
                            className="text-lg h-14"
                        />
                        {lastAssignment && (
                             <Alert variant="default">
                                <AlertTitle className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500"/>Asignación Anterior</AlertTitle>
                                <AlertDescription className="text-xs text-left">
                                    <span className="font-semibold">[{lastAssignment.code}]</span> {lastAssignment.product} en <span className="italic">{lastAssignment.location}</span>
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="outline" onClick={handlePrevious} disabled={currentIndex === 0}><ArrowLeft className="mr-2"/> Anterior</Button>
                        <Button variant="secondary" onClick={handleSkip}>Omitir <ArrowRight className="ml-2"/></Button>
                        <Button variant="destructive" onClick={handleFinishWizard}>Finalizar Sesión</Button>
                    </CardFooter>
                </Card>
            )}
            
            {wizardStep === 'finished' && (
                 <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CheckCircle className="mx-auto h-16 w-16 text-green-500"/>
                        <CardTitle className="mt-4 text-2xl">Sesión Finalizada</CardTitle>
                        <CardDescription>
                            El poblado guiado ha terminado y el tramo ha sido liberado.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {lastAssignment && (
                             <p className="text-sm text-muted-foreground">Última asignación: [{lastAssignment.code}] {lastAssignment.product} en {lastAssignment.location}.</p>
                        )}
                    </CardContent>
                    <CardFooter className="justify-center">
                        <Button onClick={resetWizard}>Iniciar Nuevo Poblado</Button>
                    </CardFooter>
                </Card>
            )}
        </main>
    );
}
