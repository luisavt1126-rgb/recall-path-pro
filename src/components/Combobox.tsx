import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type ComboboxOption = { value: string; label: string };

/** Busca fuzzy simples: substring ou prefixo de palavras. */
function fuzzyMatch(query: string, label: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const l = label.toLowerCase();
  if (l.includes(q)) return true;
  const words = q.split(/\s+/);
  const labelWords = l.split(/\s+/);
  return words.every((w) => labelWords.some((lw) => lw.startsWith(w)));
}

/**
 * Combobox/Autocomplete com busca fuzzy e digitação livre.
 * `value` pode ser um valor existente em `options` ou um texto novo (quando
 * `allowCreate` está ativo).
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Buscar ou digitar...",
  emptyText = "Nenhum resultado.",
  allowCreate = false,
  createLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  allowCreate?: boolean;
  createLabel?: (query: string) => string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = options.filter((o) => fuzzyMatch(query, o.label));
  const selected = options.find((o) => o.value === value);
  const showCreate =
    allowCreate &&
    query.trim().length > 0 &&
    !filtered.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selected ? selected.label : value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
            )}
            {filtered.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <Check className={cn("h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{o.label}</span>
              </CommandItem>
            ))}
            {showCreate && (
              <CommandItem
                value={`__create__${query}`}
                onSelect={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
              >
                <span className="font-medium text-brand">
                  {createLabel ? createLabel(query.trim()) : `Criar "${query.trim()}"`}
                </span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
