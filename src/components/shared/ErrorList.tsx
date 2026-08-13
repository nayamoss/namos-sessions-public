export function ErrorList({ errors, className = "mt-4" }: { errors: string[]; className?: string }) {
  return (
    <div role="alert" className={`${className} rounded-md bg-destructive/10 p-3 text-sm text-destructive`}>
      <ul className="list-disc space-y-1 pl-5">
        {errors.map((error) => <li key={error}>{error}</li>)}
      </ul>
    </div>
  );
}
