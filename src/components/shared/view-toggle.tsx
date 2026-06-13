import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  view: "grid" | "list" | "employee";
  onViewChange: (view: any) => void;
  options?: {
    value: string;
    label: string;
    icon: any;
  }[];
}

export function ViewToggle({ view, onViewChange, options }: ViewToggleProps) {
  const defaultOptions = [
    { value: "grid", label: "Grid View", icon: LayoutGrid },
    { value: "list", label: "List View", icon: List },
  ];

  const activeOptions = options || defaultOptions;

  return (
    <div className="flex items-center p-1 bg-muted/40 rounded-xl border border-border/50">
      {activeOptions.map((option) => {
        const Icon = option.icon;
        const isActive = view === option.value;
        
        return (
          <Button
            key={option.value}
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 rounded-lg transition-all",
              isActive 
                ? "bg-white text-primary shadow-sm border border-border/10" 
                : "text-muted-foreground hover:text-foreground hover:bg-transparent"
            )}
            onClick={() => onViewChange(option.value)}
            title={option.label}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground/60")} />
          </Button>
        );
      })}
    </div>
  );
}
