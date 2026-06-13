import { SkeletonLoader } from "./skeleton-loader";
import { PageHeader } from "./page-header";

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-2">
        <PageHeader 
          title="Loading..." 
          description="Please wait while we fetch the latest data for you." 
        />
      </div>

      <SkeletonLoader type="stats" count={4} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonLoader type="table" count={5} />
        </div>
        <div className="space-y-6">
          <div className="p-5 border border-border/40 rounded-xl bg-white/50 space-y-4">
             <div className="h-4 w-32 bg-muted rounded animate-pulse" />
             <SkeletonLoader type="list" count={4} />
          </div>
        </div>
      </div>
    </div>
  );
}
