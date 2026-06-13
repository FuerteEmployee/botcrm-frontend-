import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse animate-shimmer rounded-md bg-muted-foreground/10 dark:bg-muted-foreground/20 border border-border/40", className)} {...props} />;
}

export { Skeleton };
