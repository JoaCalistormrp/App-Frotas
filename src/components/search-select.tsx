import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type SearchOption = { value: string; label: string; hint?: string | null };

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
};

export function SearchSelect({
  value, onChange, options, placeholder = "Selecione…", searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.", clearable = true, disabled, id,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  const pick = (v: string | null) => { onChange(v); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm flex items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
            {selected?.hint && <span className="text-muted-foreground"> · {selected.hint}</span>}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-64" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearable && value && (
                <CommandItem value="nenhum limpar" onSelect={() => pick(null)} className="text-muted-foreground">
                  — Nenhum —
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ""} ${o.value}`} onSelect={() => pick(o.value)}>
                  <Check className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto pl-2 text-xs text-muted-foreground truncate">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
