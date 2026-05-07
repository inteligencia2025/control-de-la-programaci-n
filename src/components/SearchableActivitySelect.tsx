import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  const selected = activities.find((a) => a.id === value);

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
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <div className="flex items-center border-b px-2">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Buscar actividad..."
              className="h-9 text-sm flex-1"
            />
          </div>
          <CommandList>
            <CommandEmpty>No se encontró la actividad.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="_none"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0"
                  )}
                />
                Sin predecesora
              </CommandItem>
              {activities.map((activity) => (
                <CommandItem
                  key={activity.id}
                  value={activity.name + " " + activity.id}
                  onSelect={() => {
                    onChange(activity.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === activity.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {activity.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
