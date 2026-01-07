/**
 * @fileoverview Page for the Dispatch Report.
 * This component visualizes verifications recorded via the dispatch check wizard.
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, CalendarIcon, Search, FileDown, FileSpreadsheet, FilterX, Columns3, Printer, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SearchInput } from '@/components/ui/search-input';
import { DialogColumnSelector } from '@/components/ui/dialog-column-selector';
import type { VerificationItem, DispatchLog } from '@/modules/core/types';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDispatchReport } from '@/modules/analytics/hooks/useDispatchReport';

export default function DispatchReportPage() {
    const { 
        state, 
        actions, 
        selectors, 
        isAuthorized, 
        isInitialLoading 
    } = useDispatchReport();

    const { isLoading, dateRange, searchTerm, visibleColumns, logs } = state;
    const { filteredData, availableColumns, visibleColumnsData } = selectors;

    if (isInitialLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card><CardHeader><Skeleton className="h-8 w-64" /><Skeleton className="h-5 w-96 mt-2" /></CardHeader>
                    <CardContent className="space-y-4"><Skeleton className="h-10 w-full max-w-sm" /><Skeleton className="h-48 w-full" /></CardContent>
                </Card>
            </main>
        );
    }
    
    if (!isAuthorized) return null;

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Reporte de Despachos</CardTitle>
                            <CardDescription>Audita las verificaciones de despacho registradas en el sistema.</CardDescription>
                        </div>
                        <Button onClick={actions.fetchData} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Generar Reporte
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button id="date" variant={'outline'} className={cn('w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, 'LLL dd, y', { locale: es })} - ${format(dateRange.to, 'LLL dd, y', { locale: es })}`) : format(dateRange.from, 'LLL dd, y', { locale: es })) : (<span>Rango de Fechas</span>)}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={actions.setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                        </Popover>
                        <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><SearchInput options={[]} value={searchTerm} onValueChange={actions.setSearchTerm} placeholder="Buscar por documento, usuario..." open={false} onOpenChange={()=>{}} onSelect={()=>{}} className="pl-8 w-full" /></div>
                        <Button variant="ghost" onClick={actions.handleClearFilters}><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Resultados</CardTitle>
                        <div className="flex items-center gap-2">
                             <DialogColumnSelector allColumns={availableColumns} visibleColumns={visibleColumns} onColumnChange={actions.handleColumnVisibilityChange} onSave={actions.savePreferences} />
                            <Button variant="outline" onClick={actions.handleExportExcel} disabled={isLoading || filteredData.length === 0}><FileSpreadsheet className="mr-2"/>Exportar Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {visibleColumnsData.map(col => <TableHead key={col.id}>{col.label}</TableHead>)}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={visibleColumns.length} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : filteredData.length > 0 ? (
                                    filteredData.map(log => (
                                        <TableRow key={log.id}>
                                            {visibleColumns.includes('documentId') && <TableCell className="font-mono">{log.documentId}</TableCell>}
                                            {visibleColumns.includes('documentType') && <TableCell>{log.documentType}</TableCell>}
                                            {visibleColumns.includes('clientId') && <TableCell>{log.clientId}</TableCell>}
                                            {visibleColumns.includes('clientName') && <TableCell>{log.clientName}</TableCell>}
                                            {visibleColumns.includes('shippingAddress') && <TableCell className="text-xs">{log.shippingAddress}</TableCell>}
                                            {visibleColumns.includes('verifiedAt') && <TableCell>{format(parseISO(log.verifiedAt), 'dd/MM/yy HH:mm')}</TableCell>}
                                            {visibleColumns.includes('verifiedByUserName') && <TableCell>{log.verifiedByUserName}</TableCell>}
                                            {visibleColumns.includes('actions') &&
                                                <TableCell>
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button variant="outline" size="sm">Ver Detalles</Button>
                                                        </DialogTrigger>
                                                        <DialogContent className="max-w-3xl">
                                                            <DialogHeader>
                                                                <DialogTitle>Detalles del Despacho: {log.documentId}</DialogTitle>
                                                                <DialogDescription>
                                                                    Verificado por {log.verifiedByUserName} el {format(parseISO(log.verifiedAt), 'dd/MM/yyyy HH:mm')}. Esta es una auditoría de la verificación de despacho.
                                                                </DialogDescription>
                                                            </DialogHeader>
                                                            <ScrollArea className="h-96">
                                                                <Table>
                                                                    <TableHeader><TableRow><TableHead>Artículo</TableHead><TableHead>Descripción</TableHead><TableHead>Requerido</TableHead><TableHead>Verificado</TableHead></TableRow></TableHeader>
                                                                    <TableBody>
                                                                        {Array.isArray(log.items) && log.items.map((item: VerificationItem) => (
                                                                            <TableRow key={item.lineId} className={item.verifiedQuantity !== item.requiredQuantity ? 'bg-destructive/10' : ''}>
                                                                                <TableCell>{item.itemCode}</TableCell>
                                                                                <TableCell>{item.description}</TableCell>
                                                                                <TableCell>{item.requiredQuantity}</TableCell>
                                                                                <TableCell className={cn('font-bold', item.verifiedQuantity > item.requiredQuantity ? 'text-red-600' : item.verifiedQuantity < item.requiredQuantity ? 'text-yellow-600' : 'text-green-600')}>{item.verifiedQuantity}</TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </ScrollArea>
                                                            <DialogFooter>
                                                                <Button onClick={() => actions.handlePrintPdf(log)}><Printer className="mr-2 h-4 w-4"/>Reimprimir Comprobante</Button>
                                                            </DialogFooter>
                                                        </DialogContent>
                                                    </Dialog>
                                                </TableCell>
                                            }
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={visibleColumns.length} className="h-24 text-center">No hay registros para los filtros seleccionados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </main>
    );
}
