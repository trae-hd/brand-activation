import { DynamicIcon } from "../ui/DynamicIcon";
import { cn } from "../../lib/utils";

interface SettingsCardProps {
  icon: string;
  title: string;
  description: string;
  href: string;
  className?: string;
}

export function SettingsCard({
  icon,
  title,
  description,
  href,
  className,
}: SettingsCardProps) {
  return (
    <a
      href={href}
      className={cn(
        "flex items-center gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
        <DynamicIcon name={icon} className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-semibold leading-none">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <DynamicIcon
        name="ChevronRight"
        className="h-5 w-5 shrink-0 text-muted-foreground"
      />
    </a>
  );
}
