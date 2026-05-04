import { DynamicIcon } from "@/components/ui/DynamicIcon";

interface Props {
  title?: string;
  description?: string;
}

export function AccessDenied({
  title = "Access denied",
  description = "You don't have permission to view this page. Contact your workspace admin if you need access.",
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-20 text-center">
      <DynamicIcon name="Lock" className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
