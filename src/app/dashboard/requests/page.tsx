'use client';

import React from 'react';
import useRequests from '@/modules/requests/hooks/useRequests';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilePlus, Loader2, Check, MoreVertical, History, RefreshCcw, AlertTriangle, Undo2, PackageCheck, Truck, XCircle, Home, Pencil, FilterX, CalendarIcon, Users, User as UserIcon, ChevronLeft, ChevronRight, Layers, Lightbulb, FileDown, FileSpreadsheet, Info, Send, ShoppingBag, DollarSign, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { PurchaseRequest, PurchaseRequestHistoryEntry, RequestNotePayload, PurchaseRequestPriority, ErpOrderHeader, ErpOrderLine, User, ErpPurchaseOrderLine, ErpPurchaseOrderHeader as ErpPOHeader } from '@/modules/core/types';
import Link from 'next/link';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Separator } from '@/components/ui/separator';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';

const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
    if (!highlight) {
        return <span>{text}</span>;
    }
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="text-green-600 font-bold">
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </span>
    );
};

export default function PurchaseRequestPage() {
    const { state, actions, selectors, isAuthorized } = useRequests();
    const { isReady } = useAuth();

    const {
        isLoading, isSubmitting, isRefreshing, isNewRequestDialogOpen, isEditRequestDialogOpen, viewingArchived,
        currentPage, requestSettings, newRequest, requestToEdit,
        searchTerm, statusFilter, classificationFilter, dateFilter, showOnlyMyRequests,
        clientSearchTerm, isClientSearchOpen, itemSearchTerm, isItemSearchOpen,
        isStatusDialogOpen, requestToUpdate, newStatus, statusUpdateNotes, deliveredQuantity,
        isHistoryDialogOpen, historyRequest, history, isHistoryLoading,
        isReopenDialogOpen, reopenStep, reopenConfirmationText, arrivalDate,
        isActionDialogOpen, isErpOrderModalOpen, isErpItemsModalOpen, erpOrderNumber, erpOrderHeaders, selectedErpOrderHeader, erpOrderLines, isErpLoading,
        showOnlyShortageItems,
        isContextInfoOpen,
        contextInfoData,
        isAddNoteDialogOpen,
        notePayload,
        isTransitsDialogOpen,
        activeTransits,
        isCostAnalysisDialogOpen,
        analysisCost,
        analysisSalePrice,
        rowsPerPage,
        erpEntryNumber
    } = state;


    if (!isReady) {
        return (
            <main className="flex-1 p-4 md:p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Solicitudes de Compra</h1>
                    <Skeleton className="h-10 w-32" />
                </div>
                 <div className="space-y-4">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </main>
        )
    }

    if(isAuthorized === false) {
        return null;
    }

    const renderRequestCard = (request: PurchaseRequest) => {
        const permissions = selectors.getRequestPermissions(request);
        const daysRemaining = selectors.getDaysRemaining(request.requiredDate);
        
        const changeStatusActions = [
            // This part should be fully implemented inside the hook,
            // for now, it's a placeholder.
        ];

        return (
            <Card key={request.id} className="w-full">
                <CardHeader className="p-4">
                    <div className="flex justify-between items-start gap-2">
                        <div>
                            <CardTitle className="text-lg">{request.consecutive} - [{request.itemId}] {request.itemDescription}</CardTitle>
                            <CardDescription>Cliente: {request.clientName} {requestSettings?.showCustomerTaxId ? `(${request.clientTaxId})` : ''}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 text-sm">
                         {/* Content will be filled by the hook */}
                     </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
                    <span>Solicitado por: {request.requestedBy} el {format(parseISO(request.requestDate), 'dd/MM/yyyy')}</span>
                    {request.approvedBy && <span>Aprobado por: {request.approvedBy}</span>}
                </CardFooter>
            </Card>
        );
    }

    return (
        <main className="flex-1 flex flex-col p-4 md:p-6">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm -mx-4 -mt-4 px-4 pt-4 pb-4 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 md:pb-6 space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h1 className="text-lg font-semibold md:text-2xl">Solicitudes de Compra</h1>
                    <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                        {/* Placeholder for buttons */}
                    </div>
                </div>
                <Card className="hidden md:block">
                    <CardContent className="p-4">
                        {/* Placeholder for filters */}
                    </CardContent>
                </Card>
            </div>
            
            <div className="flex-1 overflow-auto pt-2 space-y-4">
                {(isLoading && !isRefreshing) ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
                ) : state.requests.length > 0 ? (
                    state.requests.map(renderRequestCard)
                ) : (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <h3 className="text-2xl font-bold tracking-tight">No se encontraron solicitudes.</h3>
                            <p className="text-sm text-muted-foreground">Intenta ajustar los filtros de búsqueda o crea una nueva solicitud.</p>
                        </div>
                    </div>
                )}
            </div>

             <div className="flex items-center justify-center space-x-2 py-4">
                <Button variant="outline" size="sm" onClick={() => actions.setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
                    <ChevronLeft className="mr-2 h-4 w-4" />Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                    Página {currentPage + 1} de {Math.ceil(state.totalActive / rowsPerPage)}
                </span>
                <Button variant="outline" size="sm" onClick={() => actions.setCurrentPage(p => p + 1)} disabled={(currentPage + 1) * rowsPerPage >= state.totalActive}>
                    Siguiente<ChevronRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </main>
    );
}
