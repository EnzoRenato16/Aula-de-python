import { cn } from "@/lib/utils";

/** A titled block of a page: the app's unit of layout. */
export function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}
