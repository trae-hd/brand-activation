type Variant = "blue" | "green" | "amber";

const variantClasses: Record<Variant, string> = {
  blue: "bg-blue-500 text-white",
  green: "bg-green-500 text-white",
  amber: "bg-amber-500 text-white",
};

interface Props {
  count: number;
  variant?: Variant;
}

export function SidebarBadge({ count, variant = "blue" }: Props) {
  if (count <= 0) return null;
  return (
    <span
      className={`ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${variantClasses[variant]}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
