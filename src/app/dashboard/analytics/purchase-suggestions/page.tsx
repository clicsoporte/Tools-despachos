/**
 * @fileoverview Page for proactive purchase suggestions.
 * It analyzes ERP orders within a date range, compares them against current
 * inventory, and suggests items that need to be purchased, grouping them by item ID.
 */
'use client';

import React from 'react';
import { useRequestSuggestions, type PurchaseSuggestion, type SortKey } from '@/modules/requests/hooks/useRequestSuggestions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Loader2, CalendarIcon, FilePlus, Layers, AlertCircle, ShoppingCart, FilterX, Search, FileSpreadsheet, Columns3, ArrowUp, ArrowDown, Info, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


export default function PurchaseSuggestionsPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = useRequestSuggestions();

    const { isLoading, dateRange, selectedItems, isSubmitting, searchTerm, classificationFilter, visibleColumns, showOnlyMyOrders, sortKey, sortDirection, itemsToCreate, isDuplicateConfirmOpen, currentPage, rowsPerPage } = state;
    const { paginatedSuggestions } = selectors;

    if (isInitialLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-5 w-96 mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full max-w-sm" />
                        <Skeleton className="h-48 w-full" />
                    </CardContent>
                </Card>
            </main>
        );
    }
    
    if (isAuthorized === false) {
        return null;
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <Layers className="h-8 w-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Sugerencias de Compra Proactivas</h1>
                        <p className="text-muted-foreground">Analiza los pedidos del ERP con faltantes de inventario y genera solicitudes.</p>
                    </div>
                </div>
                 <Button asChild variant="outline">
                    <Link href="/dashboard/analytics">
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Volver a Analíticas
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Filtros de Análisis</CardTitle>
                            <CardDescription>Selecciona los filtros para analizar los pedidos del ERP.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={actions.savePreferences} disabled={isSubmitting}><Save className="mr-2 h-4 w-4"/> Guardar Preferencias</Button>
                            <Button onClick={actions.handleAnalyze} disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                                Analizar Pedidos
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn(
                                    "w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal",
                                    !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                        {format(dateRange.from, "LLL dd, y", { locale: es })} -{" "}
                                        {format(dateRange.to, "LLL dd, y", { locale: es })}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y", { locale: es })
                                    )
                                    ) : (
                                    <span>Seleccionar fecha</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={actions.setDateRange}
                                    numberOfMonths={2}
                                    locale={es}
                                />
                            </PopoverContent>
                        </Popover>
                        <div className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por artículo, cliente, pedido..." value={searchTerm} onChange={(e) => actions.setSearchTerm(e.target.value)} className="pl-8 w-full" />
                        </div>
                        <MultiSelectFilter
                            title="Clasificación"
                            options={selectors.classifications.map((c: string) => ({ value: c, label: c }))}
                            selectedValues={classificationFilter}
                            onSelectedChange={actions.setClassificationFilter}
                            className="w-full sm:w-auto"
                        />
                        <Button variant="ghost" onClick={actions.handleClearFilters} className="flex-shrink-0"><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                    </div>
                    <div className="flex items-center space-x-2 pt-4">
                        <Checkbox
                            id="show-only-my-orders"
                            checked={showOnlyMyOrders}
                            onCheckedChange={(checked) => actions.setShowOnlyMyOrders(checked as boolean)}
                        />
                        <Label htmlFor="show-only-my-orders" className="font-normal">Mostrar solo mis pedidos del ERP</Label>
                    </div>
                </CardContent>
            </Card>
            
            <TooltipProvider>
                <Card className="mt-6">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Artículos con Faltantes ({selectors.filteredSuggestions.length})</CardTitle>
                                <CardDescription>
                                    Esta es una lista consolidada de todos los artículos necesarios para cumplir con los pedidos seleccionados, que no tienen suficiente stock.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline"><Columns3 className="mr-2 h-4 w-4"/> Columnas</Button>
                                    </DialogTrigger>
                                     <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Seleccionar Columnas Visibles</DialogTitle>
                                        </DialogHeader>
                                        <ScrollArea className="max-h-80">
                                            <div className="space-y-2 p-1">
                                                {selectors.availableColumns.map((column: { id: string; label: string }) => (
                                                    <div key={column.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                                                        <Checkbox
                                                            id={`col-${column.id}`}
                                                            checked={visibleColumns.includes(column.id)}
                                                            onCheckedChange={(checked) => actions.handleColumnVisibilityChange(column.id, !!checked)}
                                                        />
                                                        <Label htmlFor={`col-${column.id}`} className="font-normal flex-1 cursor-pointer">{column.label}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </DialogContent>
                                </Dialog>
                                <Button onClick={actions.handleExportExcel} variant="outline" disabled={isLoading || selectors.filteredSuggestions.length === 0}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                                    Exportar a Excel
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[60vh] border rounded-md">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow>
                                        <TableHead className="w-12">
                                            <Checkbox
                                                checked={selectors.areAllSelected}
                                                onCheckedChange={(checked) => actions.toggleSelectAll(checked as boolean)}
                                                disabled={isLoading || selectors.filteredSuggestions.length === 0}
                                            />
                                        </TableHead>
                                        {selectors.visibleColumnsData.map((col: { id: string; label: string; tooltip: string; sortable?: boolean; sortKey?: string; align?: string }) => (
                                            <TableHead key={col.id} className={cn(col.align === 'right' && 'text-right', col.sortable && 'cursor-pointer hover:bg-muted')} onClick={() => col.sortable && actions.handleSort((col.sortKey || col.id) as SortKey)}>
                                                <Tooltip><TooltipTrigger className='flex items-center gap-2'>
                                                    {col.label}
                                                    {sortKey === (col.sortKey || col.id) && (
                                                        sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                                                    )}
                                                </TooltipTrigger><TooltipContent>{col.tooltip}</TooltipContent></Tooltip>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={selectors.visibleColumnsData.length + 1}><Skeleton className="h-8 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : paginatedSuggestions.length > 0 ? (
                                        paginatedSuggestions.map((item: PurchaseSuggestion) => (
                                            <TableRow key={item.itemId}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedItems.has(item.itemId)}
                                                        onCheckedChange={() => actions.toggleItemSelection(item.itemId)}
                                                    />
                                                </TableCell>
                                                {visibleColumns.map((colId: string) => {
                                                    const colData = selectors.getColumnContent(item, colId);
                                                    return (
                                                        <TableCell key={colId} className={cn(colData.className)}>
                                                            {colData.content}
                                                        </TableCell>
                                                    )
                                                })}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={selectors.visibleColumnsData.length + 1} className="h-32 text-center">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                                                    <p className="text-muted-foreground">No se encontraron faltantes para los filtros seleccionados.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                    <CardFooter className="flex flex-col items-end gap-4 pt-4">
                        <div className="flex w-full items-center justify-between">
                            <Button onClick={() => actions.handleCreateRequests()} disabled={isSubmitting || selectors.selectedSuggestions.length === 0}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <FilePlus className="mr-2 h-4 w-4" />
                                Crear {selectors.selectedSuggestions.length > 0 ? `${selectors.selectedSuggestions.length} Solicitud(es)` : 'Solicitudes'}
                            </Button>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="rows-per-page">Filas por página:</Label>
                                    <Select value={String(rowsPerPage)} onValueChange={(value) => actions.setRowsPerPage(Number(value))}>
                                        <SelectTrigger id="rows-per-page" className="w-20"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[5, 10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <span className="text-sm text-muted-foreground">Página {currentPage + 1} de {selectors.totalPages}</span>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => actions.setCurrentPage(currentPage - 1)} disabled={currentPage === 0}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => actions.setCurrentPage(currentPage + 1)} disabled={currentPage >= selectors.totalPages - 1}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardFooter>
                </Card>
            </TooltipProvider>

            <AlertDialog open={isDuplicateConfirmOpen} onOpenChange={actions.setDuplicateConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Creación de Duplicados</AlertDialogTitle>
                        <AlertDialogDescription>
                            <p>Uno o más artículos que seleccionaste ya tienen solicitudes de compra activas. ¿Estás seguro de que quieres crear solicitudes adicionales?</p>
                            <div className="mt-4 max-h-40 overflow-y-auto space-y-2 border p-2 rounded-md">
                                {itemsToCreate.filter(item => item.existingActiveRequests.length > 0).map(item => (
                                    <div key={item.itemId}>
                                        <p className="font-semibold">{item.itemDescription}</p>
                                        <ul className="list-disc list-inside text-xs text-muted-foreground">
                                            {item.existingActiveRequests.map(req => (
                                                <li key={req.id}>{req.consecutive} ({req.status}) - Cant: {req.quantity} {req.purchaseOrder && `(OC: ${req.purchaseOrder})`} {req.erpOrderNumber && `(PE: ${req.erpOrderNumber})`}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => actions.handleCreateRequests(itemsToCreate)}>Sí, crear duplicados</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}
