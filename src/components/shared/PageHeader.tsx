export function PageHeader({ title }: { title: string }) {
  return <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>;
}
