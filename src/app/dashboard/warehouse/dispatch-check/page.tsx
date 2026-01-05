/**
 * @fileoverview Page for the new Dispatch Check module.
 * This component allows users to verify invoice items against physical products before dispatch.
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Search, CheckCircle, XCircle, Info, ClipboardCheck, Circle, User, FileDown, Mail, ArrowRight, AlertTriangle, ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDispatchCheck } from '@/modules/warehouse/hooks/useDispatchCheck';
import { SearchInput } from '@/components/ui/search-input';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
    if (!highlight) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-200 text-black">
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </span>
    );
};


export default function DispatchCheckPage() {
    const { isReady, user } = useAuth();
    const {
        state,
        actions,
        selectors,
        isAuthorized,
    } = useDispatchCheck();
    
    if (!isReady || isAuthorized === null) {
        return (
             <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <Skeleton className="h-96 w-full max-w-4xl" />
            </main>
        )
    }

    if (isAuthorized === false) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <p>No tienes permiso para acceder a este módulo.</p>
            </main>
        );
    }

    if (state.step === 'initial') {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
                <div className="w-full max-w-2xl space-y-4 text-center">
                    <ClipboardCheck className="mx-auto h-16 w-16 text-primary" />
                    <h1 className="text-3xl font-bold">Chequeo de Despacho</h1>
                    <p className="text-muted-foreground">
                        Ingresa un número de factura o pedido para comenzar la verificación.
                    </p>
                    <div className="pt-4">
                         <SearchInput
                            options={selectors.documentOptions}
                            onSelect={actions.handleDocumentSelect}
                            value={state.documentSearchTerm}
                            onValueChange={actions.setDocumentSearchTerm}
                            placeholder="Buscar por Nº de Factura, Pedido o Remisión..."
                            open={state.isDocumentSearchOpen}
                            onOpenChange={actions.setIsDocumentSearchOpen}
                            onKeyDown={actions.handleDocumentSearchKeyDown}
                            className="h-14 text-lg"
                        />
                    </div>
                </div>
            </main>
        );
    }
    
    if (state.step === 'verifying' && state.currentDocument) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                <div className="flex-1">
                                    <CardTitle className="text-2xl">
                                        Verificando: {state.currentDocument.type} <span className="font-mono">{state.currentDocument.id}</span>
                                    </CardTitle>
                                    <CardDescription>
                                        Escanea cada artículo para confirmar que el despacho esté completo y correcto.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectors.canSwitchMode && (
                                        <div className="flex items-center space-x-2">
                                            <Label htmlFor="strict-mode-switch">Modo Estricto</Label>
                                            <Switch
                                                id="strict-mode-switch"
                                                checked={state.isStrictMode}
                                                onCheckedChange={actions.handleModeChange}
                                            />
                                        </div>
                                    )}
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="icon"><Info className="h-4 w-4"/></Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Detalles del Despacho</DialogTitle>
                                            </DialogHeader>
                                            <div className="text-sm space-y-2">
                                                <p><strong>Cliente:</strong> {state.currentDocument.clientName} ({state.currentDocument.clientId})</p>
                                                <p><strong>Dirección:</strong> {state.currentDocument.shippingAddress}</p>
                                                <p><strong>Fecha Doc:</strong> {format(parseISO(state.currentDocument.date), 'dd/MM/yyyy')}</p>
                                                <p><strong>Usuario ERP:</strong> {state.currentDocument.erpUser}</p>
                                                <p><strong>Verificando:</strong> {user?.name}</p>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                            <div className="pt-4 space-y-2">
                                <Progress value={selectors.progressPercentage} />
                                <p className="text-center text-sm text-muted-foreground">{selectors.progressText}</p>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                    <Input
                                        ref={state.scannerInputRef}
                                        placeholder="Escanear código de barras..."
                                        className="h-12 text-lg pl-10"
                                        value={state.scannedCode}
                                        onChange={(e) => actions.setScannedCode(e.target.value)}
                                        onKeyDown={actions.handleScan}
                                    />
                                </div>
                                <div className="h-[45vh] overflow-y-auto pr-2 space-y-2">
                                    {state.verificationItems.map(item => {
                                        const inputRef = (el: HTMLInputElement) => {
                                            if (el) state.quantityInputRefs.current.set(item.lineId, el);
                                            else state.quantityInputRefs.current.delete(item.lineId);
                                        };
                                        return (
                                            <div key={item.lineId} className="flex items-center gap-4 p-2 border rounded-md">
                                                <Button variant={'ghost'} size="icon" className="h-10 w-10 shrink-0" onClick={() => actions.handleIndicatorClick(item.lineId)}>
                                                    {item.verifiedQuantity > item.requiredQuantity ? <AlertTriangle className="h-6 w-6 text-orange-500"/> : item.verifiedQuantity === item.requiredQuantity ? <CheckCircle className="h-6 w-6 text-green-500"/> : item.verifiedQuantity > 0 ? <Loader2 className="h-6 w-6 text-yellow-500 animate-spin"/> : <Circle className="h-6 w-6 text-muted-foreground"/>}
                                                </Button>
                                                <div className="flex-1">
                                                    <p className="font-medium">
                                                        <HighlightedText text={`[${item.itemCode}] ${item.description}`} highlight={state.lastScannedProductCode ?? ''} />
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Cod. Barras: <span className="font-mono">{item.barcode || 'N/A'}</span>
                                                    </p>
                                                </div>
                                                <div className="w-40 text-right">
                                                    <Label>Cantidades</Label>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Badge variant="secondary" className="text-base">{item.requiredQuantity}</Badge>
                                                        <ArrowRight className="h-4 w-4"/>
                                                        <Input
                                                            ref={inputRef}
                                                            type="text"
                                                            className="w-24 h-8 text-lg text-center font-bold"
                                                            value={item.displayVerifiedQuantity}
                                                            onChange={(e) => actions.handleManualQuantityChange(item.lineId, e.target.value)}
                                                            onBlur={(e) => actions.handleManualQuantityBlur(item.lineId, e.target.value)}
                                                            disabled={!selectors.canManuallyOverride}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-between">
                            <Button variant="destructive" onClick={actions.reset}>Cancelar Verificación</Button>
                            {selectors.isVerificationComplete && (
                                <div className="flex gap-2">
                                     <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" disabled={state.isSubmitting}>
                                                <Mail className="mr-2 h-4 w-4" /> Finalizar y Enviar
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Enviar Comprobante por Correo</DialogTitle>
                                                <DialogDescription>
                                                    Busca a tus compañeros para enviarles una copia del comprobante de despacho.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="py-4 space-y-4">
                                                <div className="space-y-2">
                                                    <Label>Para:</Label>
                                                    <SearchInput 
                                                        options={selectors.userOptions}
                                                        onSelect={actions.handleUserSelect}
                                                        value={state.userSearchTerm}
                                                        onValueChange={actions.setUserSearchTerm}
                                                        placeholder="Buscar usuario..."
                                                        open={state.isUserSearchOpen}
                                                        onOpenChange={actions.setIsUserSearchOpen}
                                                    />
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {state.selectedUsers.map(u => (
                                                            <Badge key={u.id} variant="secondary">
                                                                {u.name}
                                                                <button onClick={() => actions.handleUserDeselect(u.id)} className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20">
                                                                    <XCircle className="h-3 w-3"/>
                                                                </button>
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                                {selectors.canSendExternalEmail && (
                                                     <div className="space-y-2">
                                                        <Label>CC (Opcional, separado por comas):</Label>
                                                        <Input value={state.externalEmail} onChange={e => actions.setExternalEmail(e.target.value)} placeholder="otro@correo.com"/>
                                                    </div>
                                                )}
                                                 <div className="space-y-2">
                                                        <Label>Mensaje Adicional (Opcional):</Label>
                                                        <Textarea value={state.emailBody} onChange={e => actions.setEmailBody(e.target.value)} />
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                                                <Button onClick={() => actions.handleFinalizeAndAction('email')} disabled={state.isSubmitting || state.selectedUsers.length === 0}>
                                                     {state.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                                    Enviar
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                    <Button onClick={() => actions.handleFinalizeAndAction('finish')} disabled={state.isSubmitting}>
                                        Finalizar Verificación
                                    </Button>
                                </div>
                            )}
                        </CardFooter>
                    </Card>
                    <AlertDialog open={!!state.errorState}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                    <XCircle className="h-6 w-6 text-destructive"/>
                                    {state.errorState?.title}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {state.errorState?.message}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <Button onClick={actions.clearError}>Entendido</Button>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog open={!!state.confirmationState}>
                        <AlertDialogContent>
                             <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                    <Info className="h-6 w-6 text-blue-500"/>
                                    {state.confirmationState?.title}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {state.confirmationState?.message}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={state.confirmationState?.onCancel}>
                                    {state.confirmationState?.cancelText || 'Cancelar'}
                                </AlertDialogCancel>
                                <AlertDialogAction onClick={state.confirmationState?.onConfirm}>
                                    {state.confirmationState?.confirmText || 'Confirmar'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                </div>
            </main>
        );
    }
    
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
             <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CheckCircle className="mx-auto h-16 w-16 text-green-500"/>
                    <CardTitle className="mt-4 text-2xl">¡Despacho Verificado!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">La verificación para el documento <strong>{state.currentDocument?.id}</strong> se ha completado y registrado.</p>
                </CardContent>
                <CardFooter className="justify-center">
                    <Button onClick={actions.reset}>Verificar Otro Documento</Button>
                </CardFooter>
            </Card>
        </main>
    );
}
