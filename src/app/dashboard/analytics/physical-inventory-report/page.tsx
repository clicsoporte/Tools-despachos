/**
 * @fileoverview Page for the Physical Inventory Comparison Report.
 * This component visualizes the differences between physically counted inventory
 * and the stock levels recorded in the ERP system.
 */
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, FileSpreadsheet, Search, FilterX, ArrowUp, ArrowDown } from 'lucide-react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getPhysicalInventoryReportData } from '@/modules/analytics/lib/actions';
import type { PhysicalInventoryComparisonItem } from '@/modules/core/types';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { useDebounce } from 'use-debounce';
import { cn } from '@/lib/utils';

type SortKey = 'productId' | 'physicalCount' | 'erpStock' | 'difference';

export default function PhysicalInventoryReportPage() {
    useAuthorization(['warehouse:access']);
    const { setTitle } = usePageTitle();
    const [isLoading, setIsLoading] = useState(true);
    const [reportData, setReportData] = useState<PhysicalInventoryComparisonItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
    const [sortKey, setSortKey] = useState<SortKey>('difference');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getPhysicalInventoryReportData();
            setReportData(data);
        } catch (error) {
            console.error("Failed to fetch physical inventory report data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        setTitle("Reporte de Inventario Físico");
        fetchData();
    }, [setTitle, fetchData]);

    const filteredAndSortedData = useMemo(() => {
        let data = [...reportData];

        if (debouncedSearchTerm) {
            const lowercasedFilter = debouncedSearchTerm.toLowerCase();
            data = data.filter(item =>
                item.productDescription.toLowerCase().includes(lowercasedFilter) ||
                item.productId.toLowerCase().includes(lowercasedFilter) ||
                item.locationName.toLowerCase().includes(lowercasedFilter)
            );
        }
        
        data.sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];
            const direction = sortDirection === 'asc' ? 1 : -1;
            if (typeof valA === 'string' && typeof valB === 'string') {
                return valA.localeCompare(valB) * direction;
            }
            return (valA - valB) * direction;
        });

        return data;
    }, [reportData, debouncedSearchTerm, sortKey, sortDirection]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) return null;
        return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
    };

    const handleExport = () => {
        const dataToExport = filteredAndSortedData.map(item => ({
            'Código Producto': item.productId,
            'Descripción': item.productDescription,
            'Ubicación': `${item.locationCode} (${item.locationName})`,
            'Conteo Físico': item.physicalCount,
            'Stock ERP': item.erpStock,
            'Diferencia': item.difference,
            'Fecha Conteo': format(parseISO(item.lastCountDate), 'dd/MM/yyyy HH:mm', { locale: es }),
        }));

        exportToExcel({
            fileName: 'reporte_conteo_inventario',
            sheetName: 'ConteoFisico',
            headers: Object.keys(dataToExport[0] || {}),
            data: dataToExport.map(Object.values),
            columnWidths: [20, 40, 25, 15, 15, 15, 20],
        });
    };

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle>Reporte de Comparación de Inventario</CardTitle>
                            <CardDescription>Compara las cantidades contadas físicamente con el stock registrado en el ERP.</CardDescription>
                        </div>
                        <Button onClick={fetchData} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refrescar Datos
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por producto o ubicación..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        <Button variant="ghost" onClick={() => setSearchTerm('')}><FilterX className="mr-2 h-4 w-4" />Limpiar</Button>
                        <Button onClick={handleExport} disabled={filteredAndSortedData.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar a Excel</Button>
                    </div>
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="cursor-pointer" onClick={() => handleSort('productId')}>
                                        <div className="flex items-center gap-2">Producto {renderSortIcon('productId')}</div>
                                    </TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead className="text-right cursor-pointer" onClick={() => handleSort('physicalCount')}>
                                        <div className="flex items-center justify-end gap-2">Conteo Físico {renderSortIcon('physicalCount')}</div>
                                    </TableHead>
                                    <TableHead className="text-right cursor-pointer" onClick={() => handleSort('erpStock')}>
                                        <div className="flex items-center justify-end gap-2">Stock ERP {renderSortIcon('erpStock')}</div>
                                    </TableHead>
                                    <TableHead className="text-right cursor-pointer" onClick={() => handleSort('difference')}>
                                        <div className="flex items-center justify-end gap-2">Diferencia {renderSortIcon('difference')}</div>
                                    </TableHead>
                                    <TableHead>Último Conteo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : filteredAndSortedData.length > 0 ? (
                                    filteredAndSortedData.map(item => (
                                        <TableRow key={`${item.productId}-${item.locationId}`}>
                                            <TableCell>
                                                <div className="font-medium">{item.productDescription}</div>
                                                <div className="text-sm text-muted-foreground">{item.productId}</div>
                                            </TableCell>
                                            <TableCell>{item.locationName} ({item.locationCode})</TableCell>
                                            <TableCell className="text-right font-medium">{item.physicalCount.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{item.erpStock.toLocaleString()}</TableCell>
                                            <TableCell className={cn("text-right font-bold", item.difference !== 0 && (item.difference > 0 ? "text-green-600" : "text-red-600"))}>
                                                {item.difference.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{format(parseISO(item.lastCountDate), 'dd/MM/yy HH:mm')}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay datos de conteo para mostrar.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
