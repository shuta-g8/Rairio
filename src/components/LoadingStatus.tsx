export function LoadingSpinner() {
  return <span className="loading-spinner" aria-hidden="true" />;
}

export function LoadingStatus({ children, className }: { children: string; className?: string }) {
  return (
    <p className={className ? `loading-status ${className}` : 'loading-status'} role="status">
      <LoadingSpinner />
      {children}
    </p>
  );
}
