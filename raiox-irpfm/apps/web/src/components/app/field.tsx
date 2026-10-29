import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Label, control and messages of one form field. The control must carry
 * `id={id}` and, when there is an error, `aria-invalid` and
 * `aria-describedby={errorId(id)}`.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={errorId(id)} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export const errorId = (id: string) => `${id}-erro`;

/** Accessibility props of a control for its error state. */
export function invalidProps(id: string, error: string | undefined) {
  return error
    ? { "aria-invalid": true as const, "aria-describedby": errorId(id) }
    : { "aria-invalid": false as const };
}
