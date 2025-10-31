

/**
 * @fileoverview The main Quoter page.
 * This component provides the user interface for creating, managing, and generating quotes.
 * It uses the `useQuoter` hook to manage its complex state and logic, keeping the
 * component focused on rendering the UI.
 */
"use client";

import { useQuoter } from "@/modules/quoter/hooks/useQuoter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PlusCircle,
  Trash2,
  DollarSign,
  Repeat,
  Loader2,
  FileDown,
  FilePlus,
  FolderClock,
  Save,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Info,
  Columns3,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/modules/core/hooks/useAuth";
import type { HaciendaExemptionApiResponse } from "@/modules/core/types";

const taxes = [
  { name: "IVA 13%", value: 0.13 },
  { name: "IVA Reducido 4%", value: 0.04 },
  { name: "IVA Reducido 2%", value: 0.02 },
  { name: "IVA Reducido 1%", value: 0.01 },
  { name: "Exento", value: 0 },
];

function isApiSuccess(data: any): data is HaciendaExemptionApiResponse {
    return data && typeof data === 'object' && !data.error && 'fechaVencimiento' in data;
}

export default function QuoterPage() {
  const {
    state,
    actions,
    refs,
    selectors,
  } = useQuoter();

  const { isReady } = useAuth();


  if (!isReady) {
    return (
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
            <div className="flex justify-end">
              <Skeleton className="h-24 w-64" />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t pt-6">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-6 lg:p-8">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">Nueva Cotización</CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                      <Label htmlFor="quote-number" className="whitespace-nowrap">
                      Nº Cotización:
                      </Label>
                      <Input
                      id="quote-number"
                      value={state.quoteNumber}
                      readOnly
                      className="w-40 bg-muted"
                      />
                  </div>
                  <div className="flex items-center gap-2">
                      <Label htmlFor="purchase-order-number" className="whitespace-nowrap">
                      Nº OC:
                      </Label>
                      <Input
                      id="purchase-order-number"
                      value={state.purchaseOrderNumber}
                      onChange={(e) => actions.setPurchaseOrderNumber(e.target.value)}
                      className="w-40"
                      />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={actions.handleCurrencyToggle}
                  disabled={!state.exchangeRateLoaded || !state.exchangeRate}
                >
                  {!state.exchangeRateLoaded ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : state.currency === "CRC" ? (
                    <DollarSign className="h-4 w-4" />
                  ) : (
                    <Repeat className="h-4 w-4" />
                  )}
                </Button>
                <span className="font-semibold">{state.currency}</span>
                <div className="w-32">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="exchange-rate">Tipo Cambio</Label>
                    <span className="text-xs text-muted-foreground">{state.exchangeRateDate || ''}</span>
                  </div>
                  <Input
                    id="exchange-rate"
                    type="number"
                    value={state.exchangeRate || ""}
                    onChange={(e) =>
                      actions.setExchangeRate(Number(e.target.value))
                    }
                    disabled={!state.exchangeRateLoaded}
                    className="hide-number-arrows"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="customer-search">Buscar Cliente</Label>
                  <Button variant="ghost" size="sm" onClick={() => actions.loadInitialData(true)} disabled={state.isRefreshing} className="text-xs">
                      <RefreshCw className={cn("mr-2 h-3 w-3", state.isRefreshing && "animate-spin")}/>
                      Refrescar Datos
                  </Button>
                </div>
                <SearchInput
                  ref={refs.customerInputRef}
                  options={selectors.customerOptions}
                  onSelect={actions.handleSelectCustomer}
                  value={state.customerSearchTerm}
                  onValueChange={actions.setCustomerSearchTerm}
                  placeholder="Buscar cliente por código, nombre o cédula..."
                  onKeyDown={actions.handleCustomerInputKeyDown}
                  open={state.isCustomerSearchOpen}
                  onOpenChange={actions.setCustomerSearchOpen}
                />
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="show-inactive-customers"
                    checked={state.showInactiveCustomers}
                    onCheckedChange={(checked) =>
                      actions.setShowInactiveCustomers(checked === true)
                    }
                  />
                  <Label
                    htmlFor="show-inactive-customers"
                    className="text-sm font-normal"
                  >
                    Mostrar clientes inactivos
                  </Label>
                </div>
                <Textarea
                  placeholder="Detalles del cliente (o ingrese un nuevo cliente)"
                  rows={4}
                  value={state.customerDetails}
                  onChange={(e) => actions.handleCustomerDetailsChange(e.target.value)}
                />
                <Label htmlFor="delivery-address">Dirección de Entrega</Label>
                <Textarea
                  id="delivery-address"
                  placeholder="Especifique la dirección de entrega"
                  rows={2}
                  value={state.deliveryAddress}
                  onChange={(e) => actions.setDeliveryAddress(e.target.value)}
                />
                {state.selectedCustomer && (
                  <Card className="bg-muted/50 text-sm">
                    <CardHeader className="p-3">
                      <CardTitle className="text-base">
                        Info de Cliente desde ERP
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                      <div>
                        Cédula:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedCustomer.taxId}
                        </span>
                      </div>
                      <div>
                        Límite Crédito:{" "}
                        <span className="font-medium text-foreground">
                          {actions.formatCurrency(
                            state.selectedCustomer.creditLimit
                          )}
                        </span>
                      </div>
                      <div>
                        Condición Pago:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedCustomer.paymentCondition} días
                        </span>
                      </div>
                      <div>
                        Vendedor:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedCustomer.salesperson}
                        </span>
                      </div>
                      <div>
                        Moneda:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedCustomer.currency}
                        </span>
                      </div>
                      <div>
                        Estado:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedCustomer.active === "S"
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              <div className="space-y-2">
                <Label>Vendedor</Label>
                <RadioGroup
                  value={state.sellerType}
                  onValueChange={actions.setSellerType}
                  className="flex items-center gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="user" id="r-user" />
                    <Label htmlFor="r-user">Usuario Actual</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manual" id="r-manual" />
                    <Label htmlFor="r-manual">Manual</Label>
                  </div>
                </RadioGroup>
                <Input
                  id="seller-name"
                  placeholder="Ingrese el nombre del vendedor"
                  value={state.sellerName}
                  onChange={(e) => actions.setSellerName(e.target.value)}
                  disabled={state.sellerType === "user"}
                />
                <Label htmlFor="quote-date">Fecha</Label>
                <Input
                  id="quote-date"
                  type="date"
                  value={state.quoteDate}
                  onChange={(e) => actions.setQuoteDate(e.target.value)}
                />
                <Label htmlFor="delivery-date">Fecha y Hora de Entrega</Label>
                <Input
                  id="delivery-date"
                  type="datetime-local"
                  value={state.deliveryDate}
                  onChange={(e) => actions.setDeliveryDate(e.target.value)}
                />
                <Label htmlFor="valid-until-date">Válida Hasta</Label>
                <Input
                  id="valid-until-date"
                  type="date"
                  value={state.validUntilDate}
                  onChange={(e) => actions.setValidUntilDate(e.target.value)}
                />
                {state.exemptionInfo && (
                  <Card className="bg-muted/50 text-sm mt-2">
                      <CardHeader className="p-3">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-base">Información de Exoneración</CardTitle>
                          {!state.exemptionInfo.isSpecialLaw && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => actions.checkExemptionStatus(state.exemptionInfo?.erpExemption.authNumber)}>
                                {state.exemptionInfo.isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        <CardDescription>Nº de Autorización: {state.exemptionInfo.erpExemption.authNumber}</CardDescription>
                      </CardHeader>
                      <CardContent className="p-3 pt-0 grid grid-cols-2 gap-x-4 gap-y-2">
                          <div>
                              <p className="font-semibold text-muted-foreground">Estado en ERP:</p>
                              <div className={cn("flex items-center gap-1 font-medium", state.exemptionInfo.isErpValid ? 'text-green-600' : 'text-red-600')}>
                                  {state.exemptionInfo.isErpValid ? <ShieldCheck className="h-4 w-4"/> : <ShieldX className="h-4 w-4"/>}
                                  <span>{state.exemptionInfo.isErpValid ? 'Vigente' : 'Vencida'}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                  Vence: {isValid(new Date(state.exemptionInfo.erpExemption.endDate)) ? format(parseISO(state.exemptionInfo.erpExemption.endDate), 'dd/MM/yyyy') : 'N/A'}
                              </p>
                          </div>
                          <div>
                              <p className="font-semibold text-muted-foreground">Estado en Hacienda:</p>
                              {state.exemptionInfo.isSpecialLaw ? (
                                    <div className="text-blue-600">
                                        <div className="flex items-center gap-1 font-medium">
                                            <Info className="h-4 w-4" />
                                            <span>Ley Especial (No requiere consulta API)</span>
                                        </div>
                                        <p className="text-xs text-blue-600/80 mt-1">
                                            {state.exemptionInfo.erpExemption.institutionName} (Nº {state.exemptionInfo.erpExemption.authNumber})
                                        </p>
                                    </div>
                              ) : state.exemptionInfo.isLoading ? (
                                  <Skeleton className="h-10 w-24 mt-1" />
                              ) : state.exemptionInfo.apiError ? (
                                  <div className="flex items-center gap-1 text-red-600 font-medium">
                                      <AlertTriangle className="h-4 w-4"/>
                                      <span>Error de API o no encontrado</span>
                                  </div>
                              ) : state.exemptionInfo.haciendaExemption && isApiSuccess(state.exemptionInfo.haciendaExemption) ? (
                                  <>
                                      <div className={cn("flex items-center gap-1 font-medium", state.exemptionInfo.isHaciendaValid ? 'text-green-600' : 'text-red-600')}>
                                          {state.exemptionInfo.isHaciendaValid ? <ShieldCheck className="h-4 w-4"/> : <ShieldX className="h-4 w-4"/>}
                                          <span>{state.exemptionInfo.isHaciendaValid ? 'Vigente' : 'Vencida'}</span>
                                      </div>
                                      <p className="text-xs text-muted-foreground">Vence: {isValid(parseISO(state.exemptionInfo.haciendaExemption.fechaVencimiento)) ? format(parseISO(state.exemptionInfo.haciendaExemption.fechaVencimiento), 'dd/MM/yyyy') : 'N/A'}</p>
                                  </>
                              ) : null}
                          </div>
                      </CardContent>
                  </Card>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Agregar Producto</Label>
                <SearchInput
                    ref={refs.productInputRef}
                    options={selectors.productOptions}
                    onSelect={actions.handleSelectProduct}
                    value={state.productSearchTerm}
                    onValueChange={actions.setProductSearchTerm}
                    onKeyDown={actions.handleProductInputKeyDown}
                    placeholder="Buscar producto por código o descripción..."
                    open={state.isProductSearchOpen}
                    onOpenChange={actions.setProductSearchOpen}
                  />
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="show-inactive-products"
                    checked={state.showInactiveProducts}
                    onCheckedChange={(checked) =>
                      actions.setShowInactiveProducts(checked === true)
                    }
                  />
                  <Label
                    htmlFor="show-inactive-products"
                    className="text-sm font-normal"
                  >
                    Mostrar artículos inactivos
                  </Label>
                </div>
              </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
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
                            {selectors.availableColumns.map((column: { id: string; label: string; }) => (
                                <div key={column.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                                    <Checkbox
                                        id={`col-${column.id}`}
                                        checked={state.columnVisibility[column.id as keyof typeof state.columnVisibility]}
                                        onCheckedChange={(checked) => actions.handleColumnVisibilityChange(column.id, !!checked)}
                                    />
                                    <Label htmlFor={`col-${column.id}`} className="font-normal flex-1 cursor-pointer">{column.label}</Label>
                                </div>
                            ))}
                            </div>
                        </ScrollArea>
                        <Button onClick={actions.handleSaveColumnVisibility}><Save className="mr-2 h-4 w-4"/> Guardar Preferencias</Button>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectors.visibleColumnsData.map((col: { id: string; label: string; className: string; }) => (
                        <TableHead key={col.id} className={cn(col.className)}>{col.label}</TableHead>
                    ))}
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.lines.map((line) => (
                    <TableRow
                      key={line.id}
                      onClick={() => actions.setSelectedLineForInfo(line)}
                      className="cursor-pointer"
                    >
                      {state.columnVisibility.code && (
                        <TableCell className={cn(selectors.availableColumns.find((c: {id: string}) => c.id === 'code')?.className)}>
                            <Input
                            placeholder="Código"
                            value={line.product.id}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => actions.updateLineProductDetail(line.id, { id: e.target.value })}
                            className={cn("h-auto p-1 border-0", line.product.active === "N" ? "text-red-500" : "")}
                            />
                        </TableCell>
                      )}
                      {state.columnVisibility.description && (
                         <TableCell className={cn(selectors.availableColumns.find((c: {id: string}) => c.id === 'description')?.className)}>
                            <Input
                            placeholder="Descripción del artículo"
                            value={line.product.description}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => actions.updateLineProductDetail(line.id, { description: e.target.value })}
                             className="h-auto p-1 border-0"
                            />
                        </TableCell>
                      )}
                      {state.columnVisibility.quantity && (
                         <TableCell className={cn(selectors.availableColumns.find((c: {id: string}) => c.id === 'quantity')?.className)}>
                            <Input
                            ref={(el) => actions.setLineRef(line.id, 'qty', el)}
                            type="text"
                            value={line.displayQuantity}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => actions.updateLine(line.id, { displayQuantity: e.target.value })}
                            onBlur={(e) => actions.handleNumericInputBlur(line.id, "quantity", e.target.value)}
                            onKeyDown={(e) => actions.handleLineInputKeyDown(e, line.id, 'qty')}
                            className="text-right h-auto p-1 border-0"
                            />
                        </TableCell>
                      )}
                      {state.columnVisibility.unit && (
                         <TableCell className={cn(selectors.availableColumns.find((c: {id: string}) => c.id === 'unit')?.className)}>
                            <Input
                            placeholder="Unidad"
                            value={line.product.unit}
                             onFocus={(e) => e.target.select()}
                            onChange={(e) => actions.updateLineProductDetail(line.id, { unit: e.target.value })}
                             className="h-auto p-1 border-0"
                            />
                        </TableCell>
                      )}
                      {state.columnVisibility.cabys && (
                        <TableCell className={cn(selectors.availableColumns.find((c: {id: string}) => c.id === 'cabys')?.className)}>
                            <Input
                            placeholder="Cabys"
                            value={line.product.cabys}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => actions.updateLineProductDetail(line.id, { cabys: e.target.value })}
                             className="h-auto p-1 border-0"
                            />
                        </TableCell>
                      )}
                      {state.columnVisibility.price && (
                        <TableCell className={cn(selectors.availableColumns.find((c: {id: string}) => c.id === 'price')?.className)}>
                            <Input
                            ref={(el) => actions.setLineRef(line.id, 'price', el)}
                            type="text"
                            value={line.displayPrice}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => actions.updateLine(line.id, { displayPrice: e.target.value })}
                            onBlur={(e) => actions.handleNumericInputBlur(line.id, "price", e.target.value)}
                            onKeyDown={(e) => actions.handleLineInputKeyDown(e, line.id, 'price')}
                            className="text-right h-auto p-1 border-0"
                            />
                        </TableCell>
                      )}
                      {state.columnVisibility.tax && (
                        <TableCell className={cn(selectors.availableColumns.find((c: {id: string}) => c.id === 'tax')?.className)}>
                            <Select
                            value={String(line.tax)}
                            onValueChange={(value) =>
                                actions.updateLine(line.id, { tax: Number(value) })
                            }
                            >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                {taxes.map((tax) => (
                                <SelectItem
                                    key={tax.name}
                                    value={String(tax.value)}
                                >
                                    {tax.name}
                                </SelectItem>
                                ))}
                            </SelectContent>
                            </Select>
                        </TableCell>
                      )}
                      {state.columnVisibility.total && (
                        <TableCell className={cn("text-right font-medium", selectors.availableColumns.find((c: {id: string}) => c.id === 'total')?.className)}>
                            {actions.formatCurrency(
                            line.quantity * line.price * (1 + line.tax)
                            )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            actions.removeLine(line.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              variant="outline"
              onClick={actions.addManualLine}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Añadir Línea Manual
            </Button>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                {state.selectedLineForInfo && (
                  <Card className="bg-muted/50 text-sm">
                    <CardHeader className="p-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-base">
                        Info de Artículo desde ERP
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => actions.setSelectedLineForInfo(null)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                      <div>
                        Clasificación:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedLineForInfo.product.classification}
                        </span>
                      </div>
                      <div>
                        Último Ingreso:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedLineForInfo.product.lastEntry
                            ? new Date(
                                state.selectedLineForInfo.product.lastEntry
                              ).toLocaleDateString()
                            : "N/A"}
                        </span>
                      </div>
                      <div>
                        Estado:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedLineForInfo.product.active === "S"
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </div>
                      <div>
                        Canasta Básica:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedLineForInfo.product.isBasicGood === "S"
                            ? "Sí"
                            : "No"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        Notas:{" "}
                        <span className="font-medium text-foreground">
                          {state.selectedLineForInfo.product.notes || "N/A"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  rows={5}
                  value={state.notes}
                  onChange={(e) => actions.setNotes(e.target.value)}
                  placeholder="Agregue notas, términos o condiciones aquí..."
                />
                <div className="flex items-end gap-2 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="decimal-places">Precisión Decimal</Label>
                    <Input
                      id="decimal-places"
                      type="number"
                      value={state.decimalPlaces}
                      onChange={(e) =>
                        actions.setDecimalPlaces(Math.max(0, Number(e.target.value)))
                      }
                      className="w-20 hide-number-arrows"
                    />
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Save className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Guardar Precisión como Predeterminada
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          ¿Desea guardar la precisión de {state.decimalPlaces}{" "}
                          decimales como el valor predeterminado para todas las
                          futuras cotizaciones? Este cambio se puede modificar
                          más tarde en la configuración general.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={actions.handleSaveDecimalPlaces}
                        >
                          Guardar como Predeterminado
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <div className="w-full space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{actions.formatCurrency(selectors.totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Impuestos:</span>
                    <span>{actions.formatCurrency(selectors.totals.totalTaxes)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold">
                    <span>Total:</span>
                    <span>{actions.formatCurrency(selectors.totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-wrap justify-end gap-2 border-t pt-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <FilePlus className="mr-2 h-4 w-4" />
                  Nueva Cotización
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción limpiará todos los campos del formulario.
                    Perderá todos los datos no guardados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={actions.resetQuote}>
                    Continuar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Sheet onOpenChange={(open) => open && actions.loadDrafts()}>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <FolderClock className="mr-2 h-4 w-4" />
                  Ver Borradores
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-2xl">
                <SheetHeader>
                  <SheetTitle>Mis Borradores Guardados</SheetTitle>
                  <SheetDescription>
                    Aquí puedes ver, cargar o eliminar las cotizaciones que has
                    guardado.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 py-4">
                  {state.savedDrafts.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nº Cotización</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.savedDrafts.map((draft) => (
                          <TableRow key={draft.id}>
                            <TableCell className="font-medium">
                              {draft.id}
                            </TableCell>
                            <TableCell>{draft.customer?.name || "N/A"}</TableCell>
                            <TableCell>
                              {format(new Date(draft.createdAt), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell className="text-right">
                              <SheetClose asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => actions.handleLoadDraft(draft)}
                                >
                                  Cargar
                                </Button>
                              </SheetClose>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="ml-2"
                                onClick={() => actions.handleDeleteDraft(draft.id)}
                              >
                                Eliminar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No hay borradores guardados.
                    </p>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="secondary" onClick={actions.saveDraft} disabled={state.isProcessing}>
                {state.isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
              Guardar Borrador
            </Button>
            <Button onClick={actions.generatePDF} disabled={state.isProcessing}>
                {state.isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
              <FileDown className="mr-2 h-4 w-4" />
              Generar Cotización
            </Button>
          </CardFooter>
        </Card>
      </div>
       {(state.isProcessing || state.isRefreshing) && (
            <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Procesando...</span>
            </div>
        )}
    </main>
  );
}
