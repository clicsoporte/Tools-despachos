/**
 * @fileoverview A reusable multi-select filter component using a dialog modal.
 * This component provides a robust filtering experience with a search bar and checkboxes.
 */
"use client";

import * as React from "react";
import { Check, ChevronsUpDown, PlusCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "./badge";
import { ScrollArea } from "./scroll-area";
import { Input } from "./input";
import { Label } from "./label";
import { Checkbox } from "./checkbox";

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface MultiSelectFilterProps {
  options: (MultiSelectOption | string)[];
  selectedValues: string[];
  onSelectedChange: (selected: string[]) => void;
  title: string;
  className?: string;
}

export function MultiSelectFilter({
  options: rawOptions,
  selectedValues,
  onSelectedChange,
  title,
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  
  const [tempSelected, setTempSelected] = React.useState(selectedValues);
  
  React.useEffect(() => {
    if (open) {
      setTempSelected(selectedValues);
    }
  }, [open, selectedValues]);

  const options: MultiSelectOption[] = React.useMemo(() => (rawOptions || []).map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  ), [rawOptions]);

  const filteredOptions = React.useMemo(() =>
    options.filter(option =>
      option.label && option.label.toLowerCase().includes(searchTerm.toLowerCase())
    ), [options, searchTerm]
  );

  const handleToggle = (value: string) => {
    const newSelected = tempSelected.includes(value)
      ? tempSelected.filter((v) => v !== value)
      : [...tempSelected, value];
    setTempSelected(newSelected);
  };
  
  const handleToggleAll = () => {
    if (tempSelected.length === options.length) {
      setTempSelected([]);
    } else {
      setTempSelected(options.map(o => o.value));
    }
  };

  const handleApply = () => {
    onSelectedChange(tempSelected);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full md:w-[240px] justify-between", className)}
        >
          <div className="flex items-center gap-1 truncate">
            <PlusCircle className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{title}</span>
            {selectedValues.length > 0 && (
              <>
                <div className="mx-2 h-4 w-px bg-muted-foreground" />
                <div className="flex flex-nowrap gap-1">
                  {selectedValues.length > 2 ? (
                      <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                          {selectedValues.length} seleccionados
                      </Badge>
                  ) : (
                      options
                          .filter(option => selectedValues.includes(option.value))
                          .map(option => (
                              <Badge key={option.value} variant="secondary" className="rounded-sm px-1 font-normal truncate">
                                  {option.label}
                              </Badge>
                          ))
                  )}
                </div>
              </>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 sm:max-w-[425px]">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Seleccionar {title}</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-0 space-y-4">
          <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                  placeholder="Buscar..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
          <div className="flex items-center border-t pt-4">
              <Checkbox
                  id="select-all"
                  checked={tempSelected.length === options.length && options.length > 0}
                  onCheckedChange={handleToggleAll}
                  aria-label="Seleccionar todo"
              />
              <Label htmlFor="select-all" className="ml-2 text-sm font-medium">
                  Seleccionar todo
              </Label>
          </div>
          <ScrollArea className="h-60 rounded-md border">
            <div className="p-2 space-y-1">
              {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2 p-1 rounded-md hover:bg-accent">
                          <Checkbox
                              id={`check-${option.value}`}
                              checked={tempSelected.includes(option.value)}
                              onCheckedChange={() => handleToggle(option.value)}
                          />
                          <Label htmlFor={`check-${option.value}`} className="font-normal w-full cursor-pointer">
                              {option.label}
                          </Label>
                      </div>
                  ))
              ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                      No se encontraron resultados.
                  </div>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="p-6 pt-2 border-t">
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleApply}>Aplicar Filtros</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
