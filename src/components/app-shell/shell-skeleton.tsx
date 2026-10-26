/** Oturum okunurken gösterilen iskelet (statik kabuğun parçası). */
export function ShellSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh" aria-busy="true">
      <div className="hidden w-64 shrink-0 border-r bg-sidebar lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="h-14 border-b lg:hidden" />
        <div className="flex-1 px-4 py-6 lg:px-10 lg:py-10">
          <span className="sr-only">{label}</span>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="mt-6 h-24 max-w-xl animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
