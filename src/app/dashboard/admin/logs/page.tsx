

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLogs, clearLogs } from "@/modules/core/lib/logger";
import type { LogEntry, DateRange } from "@/modules/core/types";
import { RefreshCw, Trash2, Calendar as CalendarIcon, FilterX, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDebounce } from "use-debounce";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/modules/core/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type LogTypeFilter = 'operational' | 'system' | 'all';
type LogTypeToDelete = 'operational' | 'system' | 'all';

export default function LogViewerPage() {
  const { isAuthorized, hasPermission } = useAuthorization(['admin:logs:read']);
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const { setTitle } = usePageTitle();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter state
  const [logTypeFilter, setLogTypeFilter] = useState<LogTypeFilter>('operational');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);

  // Clear logs dialog state
  const [isClearLogDialogOpen, setClearLogDialogOpen] = useState(false);
  const [logTypeToDelete, setLogTypeToDelete] = useState<LogTypeToDelete>('operational');
  const [deleteAllTime, setDeleteAllTime] = useState(false);


  const fetchLogs = async (isRefreshAction = false) => {
    if (isRefreshAction) {
        setIsRefreshing(true);
    } else {
        setIsLoading(true);
    }
    
    try {
        const fetchedLogs = await getLogs({
            type: logTypeFilter,
            search: debouncedSearchTerm,
            dateRange: dateFilter
        });
        setLogs(fetchedLogs);
    } catch (error) {
        console.error("Failed to fetch logs:", error);
    } finally {
        if (isRefreshAction) {
            setIsRefreshing(false);
        } else {
            setIsLoading(false);
        }
    }
  };

  useEffect(() => {
    setTitle("Visor de Eventos");
    if (isAuthorized) {
        fetchLogs(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTitle, isAuthorized, logTypeFilter, debouncedSearchTerm, dateFilter]);

  const handleClearLogs = async () => {
    if (!user) return;
    await clearLogs(user.name, logTypeToDelete, deleteAllTime);
    setClearLogDialogOpen(false); // Close dialog after action
    await fetchLogs(true); // Refresh logs to show the result
  };
  
  const handleClearFilters = () => {
    setSearchTerm('');
    setDateFilter({ from: new Date(), to: new Date() });
    setLogTypeFilter('operational');
  };

  const handleDownloadLogs = () => {
    const logContent = logs
      .map(log => {
        const detailsString = log.details ? `\nDETAILS: ${JSON.stringify(log.details, null, 2)}` : '';
        return `[${log.type}] ${format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss', { locale: es })} - ${log.message}${detailsString}`;
      })
      .join('\n\n' + '-'.repeat(80) + '\n\n');
    
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getBadgeVariant = (type: LogEntry['type']) => {
    switch (type) {
      case 'ERROR': return 'destructive';
      case 'WARN': return 'secondary';
      default: return 'outline';
    }
  };
  
  if (!isAuthorized) {
    return null; // or a skeleton loader
  }

  return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Registros del Sistema</CardTitle>
                <CardDescription>
                  Eventos, advertencias y errores registrados en la aplicación.
                </CardDescription>
              </div>
               <div className="flex w-full sm:w-auto gap-2">
                <Button variant="outline" onClick={() => fetchLogs(true)} className="flex-1 sm:flex-initial" disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refrescar
                </Button>
                {hasPermission('admin:logs:clear') && (
                     <AlertDialog open={isClearLogDialogOpen} onOpenChange={setClearLogDialogOpen}>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="flex-1 sm:flex-initial">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Limpiar
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Limpieza de Registros</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Selecciona qué tipo de logs deseas eliminar. Por defecto, se conservarán los últimos 30 días.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="py-4 space-y-6">
                                <RadioGroup defaultValue="operational" value={logTypeToDelete} onValueChange={(value) => setLogTypeToDelete(value as LogTypeToDelete)}>
                                    <Label className="font-semibold">Tipo de Logs a Eliminar</Label>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="operational" id="r-op" />
                                        <Label htmlFor="r-op">Operativos (INFO)</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="system" id="r-sys" />
                                        <Label htmlFor="r-sys">Sistema (WARN, ERROR)</Label>
                                    </div>
                                     <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="all" id="r-all" />
                                        <Label htmlFor="r-all">Todos</Label>
                                    </div>
                                </RadioGroup>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="delete-all-time" checked={deleteAllTime} onCheckedChange={(checked) => setDeleteAllTime(checked as boolean)} />
                                    <Label htmlFor="delete-all-time" className="font-medium text-destructive">
                                        Borrar todos los registros (incluyendo los últimos 30 días)
                                    </Label>
                                </div>
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleClearLogs}>Confirmar Limpieza</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex flex-col gap-4">
                <Tabs value={logTypeFilter} onValueChange={(value) => setLogTypeFilter(value as LogTypeFilter)}>
                    <TabsList className="flex flex-wrap md:grid md:grid-cols-3 w-full">
                        <TabsTrigger value="operational">Operativo</TabsTrigger>
                        <TabsTrigger value="system">Sistema</TabsTrigger>
                        <TabsTrigger value="all">Todos</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex flex-col md:flex-row flex-wrap gap-4">
                    <Input 
                        placeholder="Buscar por mensaje o detalles..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm"
                    />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                "w-full md:w-[300px] justify-start text-left font-normal",
                                !dateFilter && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateFilter?.from ? (
                                dateFilter.to ? (
                                    <>
                                    {format(dateFilter.from, "LLL dd, y", { locale: es })} -{" "}
                                    {format(dateFilter.to, "LLL dd, y", { locale: es })}
                                    </>
                                ) : (
                                    format(dateFilter.from, "LLL dd, y", { locale: es })
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
                                defaultMonth={dateFilter?.from}
                                selected={dateFilter}
                                onSelect={setDateFilter}
                                numberOfMonths={2}
                                locale={es}
                            />
                        </PopoverContent>
                    </Popover>
                    <Button variant="outline" onClick={handleDownloadLogs} disabled={logs.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Descargar
                    </Button>
                    <Button variant="ghost" onClick={handleClearFilters}>
                        <FilterX className="mr-2 h-4 w-4" />
                        Limpiar Filtros
                    </Button>
                </div>
            </div>
            <ScrollArea className="h-[60vh] rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Fecha y Hora</TableHead>
                    <TableHead className="w-[100px]">Tipo</TableHead>
                    <TableHead>Mensaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && !isRefreshing ? (
                     <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center">
                           <div className="flex justify-center items-center gap-2">
                             <Loader2 className="h-5 w-5 animate-spin"/>
                             <span>Cargando registros...</span>
                           </div>
                        </TableCell>
                    </TableRow>
                  ) : logs.length > 0 ? (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {log.timestamp ? format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss", { locale: es }) : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getBadgeVariant(log.type)}>{log.type}</Badge>
                        </TableCell>
                        <TableCell>
                            <span className="font-medium">{log.message}</span>
                            {log.details && (
                                <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded-md overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.details, null, 2)}
                                </pre>
                            )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center">
                        No hay registros para mostrar con los filtros actuales.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
  );
}
