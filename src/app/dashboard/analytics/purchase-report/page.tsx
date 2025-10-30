/**
 * @fileoverview Page for the read-only Purchase Report.
 * This component visualizes purchase suggestions without offering creation actions.
 */
'use client';

import React from 'react';
import { usePurchaseReport, type PurchaseSuggestion, type SortKey } from '@/modules/analytics/hooks/usePurchaseReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Loader2, CalendarIcon, Search, FileDown, FileSpreadsheet, FilterX, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Layers, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';

// New internal component to render cell content based on type
const CellRenderer: React.FC<{ cell: { type: string, data: any } }> = ({ cell }) => {
    switch (cell.type) {
        case 'item':
            return (
                <div>
                    <p className="font-medium">{cell.data.itemDescription}</p>
                    <p className="text-sm text-muted-foreground">{cell.data.itemId}</p>
                </div>
            );
        case 'date':
            return <>{cell.data ? new Date(cell.data).toLocaleDateString('es-CR') : 'N/A'}</>;
        case 'number':
            // Added check to prevent toLocaleString on undefined
            return <>{(cell.data ?? 0).toLocaleString()}</>;
        default:
            return <>{cell.data}</>;
    }
};

export default function PurchaseReportPage() {
    const {
        state,
        actions,
        selectors,
        isAuthorized,
        isInitialLoading,
    } = usePurchaseReport();

    const { isLoading, dateRange, searchTerm, classificationFilter, sortKey, sortDirection, showOnlyMyOrders, currentPage, rowsPerPage } = state;
    const { paginatedSuggestions } = selectors;

    if (isInitialLoading) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                <Card>
                    <CardHeader><Skeleton className="h-8 w-64" /><Skeleton className="h-5 w-96 mt-2" /></CardHeader>
                    <CardContent className="space-y-4"><Skeleton className="h-10 w-full max-w-sm" /><Skeleton className="h-48 w-full" /></CardContent>
                </Card>
            </main>
        );
    }
    
    if (isAuthorized === false) return null;
    
    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) return null;
        return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
    };

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-cyan-600 text-white"><Layers className="h-8 w-8" /></div>
                    <div>
                        <h1 className="text-2xl font-bold">Reporte de Compras</h1>
                        <p className="text-muted-foreground">Visualiza faltantes de inventario y artículos en tránsito desde el ERP.</p>
                    </div>
                </div>
                 <Button asChild variant="outline">
                    <Link href="/dashboard/analytics"><ShoppingCart className="mr-2 h-4 w-4" />Volver a Analíticas</Link>
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Filtros de Análisis</CardTitle>
                            <CardDescription>Selecciona los filtros para analizar los pedidos del ERP.</CardDescription>
                        </div>
                        <Button onClick={actions.handleAnalyze} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Analizar Pedidos
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y", { locale: es })} - ${format(dateRange.to, "LLL dd, y", { locale: es })}`) : format(dateRange.from, "LLL dd, y", { locale: es })) : (<span>Seleccionar fecha</span>)}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={actions.setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                        </Popover>
                        <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar por artículo, cliente, pedido..." value={searchTerm} onChange={(e) => actions.setSearchTerm(e.target.value)} className="pl-8 w-full" /></div>
                        <MultiSelectFilter title="Clasificación" options={selectors.classifications.map((c: string) => ({ value: c, label: c }))} selectedValues={classificationFilter} onSelectedChange={actions.setClassificationFilter} className="w-full sm:w-auto" />
                        <Button variant="ghost" onClick={actions.handleClearFilters} className="flex-shrink-0"><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                    </div>
                    <div className="flex items-center space-x-2 pt-4">
                        <Checkbox id="show-only-my-orders" checked={showOnlyMyOrders} onCheckedChange={(checked) => actions.setShowOnlyMyOrders(checked as boolean)} />
                        <Label htmlFor="show-only-my-orders" className="font-normal">Mostrar solo mis pedidos del ERP</Label>
                    </div>
                </CardContent>
            </Card>
            <TooltipProvider>
                <Card className="mt-6">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div><CardTitle>Resultados del Análisis ({selectors.filteredSuggestions.length})</CardTitle></div>
                            <div className="flex items-center gap-2">
                                <Button onClick={actions.handleExportExcel} variant="outline" disabled={isLoading || selectors.filteredSuggestions.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar a Excel</Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[60vh] border rounded-md">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow>
                                        {selectors.visibleColumnsData.map((col: { id: string; label: string; tooltip: string; sortable?: boolean; sortKey?: string; align?: string }) => (
                                            <TableHead key={col.id} className={cn(col.align === 'right' && 'text-right', col.sortable && 'cursor-pointer hover:bg-muted')} onClick={() => col.sortable && actions.handleSort((col.sortKey || col.id) as SortKey)}>
                                                <Tooltip><TooltipTrigger className='flex items-center gap-2'>{col.label}{renderSortIcon((col.sortKey || col.id) as SortKey)}</TooltipTrigger><TooltipContent>{col.tooltip}</TooltipContent></Tooltip>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell colSpan={selectors.visibleColumnsData.length + 1}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)) : paginatedSuggestions.length > 0 ? (
                                        paginatedSuggestions.map((item: PurchaseSuggestion) => (
                                            <TableRow key={item.itemId}>
                                                {state.visibleColumns.map((colId: string) => {
                                                    const colData = selectors.getColumnContent(item, colId);
                                                    return <TableCell key={colId} className={cn(colData.className)}><CellRenderer cell={colData} /></TableCell>;
                                                })}
                                            </TableRow>
                                        ))
                                    ) : (<TableRow><TableCell colSpan={selectors.visibleColumnsData.length + 1} className="h-32 text-center"><p className="text-muted-foreground">No se encontraron resultados para los filtros seleccionados.</p></TableCell></TableRow>)}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                    <CardFooter className="flex w-full items-center justify-end pt-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="rows-per-page">Filas por página:</Label>
                                <Select value={String(rowsPerPage)} onValueChange={(value) => actions.setRowsPerPage(Number(value))}>
                                    <SelectTrigger id="rows-per-page" className="w-20"><SelectValue /></SelectTrigger>
                                    <SelectContent>{[5, 10, 25, 50, 100].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <span className="text-sm text-muted-foreground">Página {currentPage + 1} de {selectors.totalPages}</span>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => actions.setCurrentPage(currentPage - 1)} disabled={currentPage === 0}><ChevronLeft className="h-4 w-4" /></Button>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => actions.setCurrentPage(currentPage + 1)} disabled={currentPage >= selectors.totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </CardFooter>
                </Card>
            </TooltipProvider>
        </main>
    );
}
