/**
 * @fileoverview A standardized, reusable search input component with debouncing and popover suggestions.
 * This component displays a text input. As the user types, it shows a popover with a list of
 * matching options that can be selected.
 */
"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollViewport } from "./scroll-area";

export interface SearchInputProps {
  options: { label: string; value: string; className?: string }[];
  onSelect: (value: string) => void;
  placeholder?: string;
  value: string;
  onValueChange: (search: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(({ 
    options,
    onSelect, 
    placeholder,
    value,
    onValueChange,
    onKeyDown,
    className,
    open,
    onOpenChange
  }, ref) => {
    
    const showPopover = open && options.length > 0;
    const scrollViewportRef = React.useRef<HTMLDivElement>(null);
    
    const handleSelect = (optionValue: string) => {
        onSelect(optionValue);
        onOpenChange(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onValueChange(e.target.value);
        if (!open) onOpenChange(true);
    };
    
    // This function handles the mouse wheel event to enable scrolling the list.
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      if (scrollViewportRef.current) {
        scrollViewportRef.current.scrollTop += e.deltaY;
      }
    };

    return (
        <Popover open={showPopover} onOpenChange={onOpenChange}>
            <div className={cn("relative w-full", className)}>
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <PopoverTrigger asChild>
                    <Input
                        ref={ref}
                        type="text"
                        placeholder={placeholder}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={onKeyDown}
                        className="pl-9"
                        autoComplete="off"
                    />
                </PopoverTrigger>
            </div>
            <PopoverContent 
                className="w-[var(--radix-popover-trigger-width)] p-0" 
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onWheel={handleWheel} // Attach wheel event here
            >
                <Command shouldFilter={false}>
                    <ScrollArea className="h-auto max-h-72">
                      <ScrollViewport ref={scrollViewportRef}>
                        <CommandList>
                            {options.length > 0 ? (
                                options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.label}
                                    onSelect={() => handleSelect(option.value)}
                                    className={cn("cursor-pointer", option.className)}
                                >
                                    {option.label}
                                </CommandItem>
                                ))
                            ) : null }
                        </CommandList>
                      </ScrollViewport>
                    </ScrollArea>
                </Command>
            </PopoverContent>
        </Popover>
    );
});

SearchInput.displayName = "SearchInput";

export { SearchInput };
