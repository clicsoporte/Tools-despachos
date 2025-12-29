/**
 * @fileoverview A reusable component for a column visibility selector dialog.
 * It provides a standardized "Columnas" button that opens a dialog with a searchable
 * list of checkboxes and a button to save the user's preferences.
 */
"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Columns3, Save } from "lucide-react";
import React, { useState } from 'react';

interface ColumnOption {
  id: string;
  label: string;
}

interface DialogColumnSelectorProps {
  allColumns: ColumnOption[];
  visibleColumns: string[];
  onColumnChange: (columnId: string, checked: boolean) => void;
  onSave: () => void;
  onClose?: () => void; // Made optional
  className?: string;
}

export function DialogColumnSelector({
  allColumns,
  visibleColumns,
  onColumnChange,
  onSave,
  onClose,
  className
}: DialogColumnSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = () => {
    onSave();
    onClose?.(); // Call if provided
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={className}>
          <Columns3 className="mr-2 h-4 w-4" />
          Columnas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seleccionar Columnas Visibles</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          <div className="space-y-2 p-1">
            {allColumns.map((column) => (
              <div key={column.id} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                <Checkbox
                  id={`col-${column.id}`}
                  checked={visibleColumns.includes(column.id)}
                  onCheckedChange={(checked) => onColumnChange(column.id, !!checked)}
                />
                <Label htmlFor={`col-${column.id}`} className="font-normal flex-1 cursor-pointer">
                  {column.label}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
           <DialogClose asChild>
                <Button variant="ghost">Cancelar</Button>
           </DialogClose>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Guardar Preferencias
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
