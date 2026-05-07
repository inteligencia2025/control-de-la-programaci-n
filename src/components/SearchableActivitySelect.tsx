import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ActivityOption {
  id: string;
  name: string;
}

interface SearchableActivitySelectProps {
  activities: ActivityOption[];
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchableActivitySelect({
  activities,
  value,
  onChange,
  placeholder = "Seleccionar actividad...",
}: SearchableActivitySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = activities.find((a) => a.id === value);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return activities;
    const q = query.toLowerCase();
    return activities.filter((a) => a.name.toLowerCase().includes(q));
  }, [activities, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-7 w-full justify-between text-xs px-2 py-1 font-normal"
        >
          <span className="truncate">
            {selected ? selected.name : placeholder}
          </span>
          <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2">
        <Input
          placeholder="Buscar actividad..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-xs mb-2"
          autoFocus
        />
        <div className="max-h-[200px] overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
              setQuery("");
            }}
            className={cn(
              "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
              !value && "bg-accent text-accent-foreground"
            )}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                !value ? "opacity-100" : "opacity-0"
              )}
            />
            Sin predecesora
          </button>
          {filtered.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => {
                onChange(activity.id);
                setOpen(false);
                setQuery("");
              }}
              className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                value === activity.id && "bg-accent text-accent-foreground"
              )}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  value === activity.id ? "opacity-100" : "opacity-0"
                )}
              />
              {activity.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-2 text-center text-sm text-muted-foreground">
              No se encontró la actividad.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
