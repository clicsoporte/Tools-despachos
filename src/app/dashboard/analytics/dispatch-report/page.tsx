/**
 * @fileoverview Page for the Dispatch Report.
 * This component visualizes verifications recorded via the dispatch check wizard.
 */
'use client';

import React from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getDispatchLogs } from '@/modules/warehouse/lib/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
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
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import type { DateRange, DispatchLog, VerificationItem, Company } from '@/modules/core/types';
import { useDebounce } from 'use-debounce';
import { useAuth } from '@/modules/core/hooks/useAuth';
import type { HAlignType, FontStyle } from 'jspdf-autotable';

const availableColumns = [
    { id: 'documentId', label: 'Documento' },
    { id: 'documentType', label: 'Tipo' },
    { id: 'verifiedAt', label: 'Fecha Verificación' },
    { id: 'verifiedByUserName', label: 'Verificado por' },
    { id: 'actions', label: 'Acciones' },
];

export default function DispatchReportPage() {
    const { isAuthorized } = useAuthorization(['analytics:dispatch-report:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { companyData } = useAuth();
    
    const [isInitialLoading, setIsInitialLoading(true);
    const [isLoading, setIsLoading(false);
    const [logs, setLogs([]: DispatchLog[]);
    const [dateRange, setDateRange<DateRange | undefined>(undefined);
    const [searchTerm, setSearchTerm('');
    const [visibleColumns, setVisibleColumns(availableColumns.map(c => c.id));

    const [debouncedSearchTerm] = useDebounce(searchTerm, 500);

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getDispatchLogs();
            setLogs(data);
        } catch (error: any) {
            toast({ title: 'Error', description: 'No se pudieron cargar los registros de despacho.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
            if (isInitialLoading) setIsInitialLoading(false);
        }
    }, [toast, isInitialLoading]);

    React.useEffect(() => {
        setTitle('Reporte de Despachos');
        if (isAuthorized) {
            fetchData();
        } else if (isAuthorized === false) {
            setIsInitialLoading(false);
        }
    }, [setTitle, isAuthorized, fetchData]);

    const filteredData = React.useMemo(() => {
        return logs.filter(log => {
            if (dateRange?.from && parseISO(log.verifiedAt) < dateRange.from) return false;
            if (dateRange?.to) {
                const toDate = new Date(dateRange.to);
                toDate.setHours(23, 59, 59, 999);
                if (parseISO(log.verifiedAt) > toDate) return false;
            }
            if (debouncedSearchTerm) {
                const search = debouncedSearchTerm.toLowerCase();
                return (
                    log.documentId.toLowerCase().includes(search) ||
                    log.verifiedByUserName.toLowerCase().includes(search) ||
                    (Array.isArray(log.items) && JSON.stringify(log.items).toLowerCase().includes(search))
                );
            }
            return true;
        });
    }, [logs, dateRange, debouncedSearchTerm]);
    
    const handlePrintPdf = (log: DispatchLog) => {
        if (!companyData || !Array.isArray(log.items)) return;
        
        const styledRows = log.items.map((item: VerificationItem) => {
            let textColor: [number, number, number] = [0, 0, 0];
            let fontStyle: FontStyle = 'normal';
            if (item.verifiedQuantity > item.requiredQuantity) {
                 textColor = [220, 53, 69]; // Red
                 fontStyle = 'bold';
            }
            else if (item.verifiedQuantity === item.requiredQuantity) textColor = [25, 135, 84]; // Green
            else if (item.verifiedQuantity < item.requiredQuantity && item.verifiedQuantity > 0) {
                 textColor = [255, 193, 7]; // Amber
                 fontStyle = 'bold';
            }
             else if (item.verifiedQuantity === 0) {
                textColor = [220, 53, 69]; // Red
                fontStyle = 'bold';
            }

            return [
                item.itemCode,
                item.description,
                { content: item.requiredQuantity.toString(), styles: { halign: 'right' as HAlignType } },
                { content: item.verifiedQuantity.toString(), styles: { halign: 'right' as HAlignType, textColor, fontStyle } }
            ];
        });

        const doc = generateDocument({
            docTitle: 'Comprobante de Despacho',
            docId: log.documentId,
            companyData,
            meta: [{ label: 'Verificado por', value: log.verifiedByUserName }, { label: 'Fecha', value: format(parseISO(log.verifiedAt), 'dd/MM/yyyy HH:mm') }],
            blocks: [],
            table: {
                columns: ['Código', 'Descripción', { content: 'Req.', styles: { halign: 'right' as HAlignType } }, { content: 'Verif.', styles: { halign: 'right' as HAlignType } }],
                rows: styledRows,
                columnStyles: {},
            },
            totals: []
        });
        doc.save(`Comprobante-${log.documentId}.pdf`);
    };

    const handleExportExcel = () => {
        const dataToExport = filteredData.flatMap(log => {
            if (!Array.isArray(log.items)) return [];
            return log.items.map(item => ({
                'Documento': log.documentId,
                'Tipo': log.documentType,
                'Fecha': format(parseISO(log.verifiedAt), 'dd/MM/yyyy HH:mm'),
                'Usuario': log.verifiedByUserName,
                'Código Artículo': item.itemCode,
                'Descripción': item.description,
                'Cant. Requerida': item.requiredQuantity,
                'Cant. Verificada': item.verifiedQuantity,
                'Diferencia': item.verifiedQuantity - item.requiredQuantity,
            }));
        });
        exportToExcel({
            fileName: 'reporte_despachos',
            sheetName: 'Despachos',
            headers: ['Documento', 'Tipo', 'Fecha', 'Usuario', 'Código Artículo', 'Descripción', 'Cant. Requerida', 'Cant. Verificada', 'Diferencia'],
            data: dataToExport.map(item => Object.values(item as any)),
        });
    };

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
                    <CardTitle>Reporte de Despachos</CardTitle>
                    <CardDescription>Audita las verificaciones de despacho registradas en el sistema.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button id="date" variant={'outline'} className={cn('w-full sm:w-auto sm:min-w-[260px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, 'LLL dd, y', { locale: es })} - ${format(dateRange.to, 'LLL dd, y', { locale: es })}`) : format(dateRange.from, 'LLL dd, y', { locale: es })) : (<span>Rango de Fechas</span>)}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} /></PopoverContent>
                    </Popover>
                    <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><SearchInput options={[]} value={searchTerm} onValueChange={setSearchTerm} placeholder="Buscar por documento, usuario..." open={false} onOpenChange={()=>{}} onSelect={()=>{}} className="pl-8 w-full" /></div>
                    <Button variant="ghost" onClick(() => { setSearchTerm(''); setDateRange(undefined); }}><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>Resultados</CardTitle>
                        <div className="flex items-center gap-2">
                             <DialogColumnSelector allColumns={availableColumns} visibleColumns={visibleColumns} onColumnChange={(colId, checked) => setVisibleColumns(prev => checked ? [...prev, colId] : prev.filter(id => id !== colId))} onSave={() => {}} />
                            <Button variant="outline" onClick={handleExportExcel} disabled={isLoading || filteredData.length === 0}><FileSpreadsheet className="mr-2"/>Exportar Excel</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[60vh] border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {availableColumns.filter(c => visibleColumns.includes(c.id)).map(col => <TableHead key={col.id}>{col.label}</TableHead>)}
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
                                                                <DialogDescription>Verificado por {log.verifiedByUserName} el {format(parseISO(log.verifiedAt), 'dd/MM/yyyy HH:mm')}</DialogDescription>
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
                                                                <Button onClick={() => handlePrintPdf(log)}><Printer className="mr-2 h-4 w-4"/>Reimprimir Comprobante</Button>
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
