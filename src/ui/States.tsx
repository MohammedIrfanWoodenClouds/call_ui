import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, icon, action }: Props) {
  return (
    <div className="ui-empty" role="status">
      {icon ? <div className="ui-empty-icon" aria-hidden>{icon}</div> : null}
      <h3 className="ui-empty-title">{title}</h3>
      {description ? <p className="ui-empty-desc">{description}</p> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="crm-loading" role="status" aria-live="polite">
      <div className="spinner" />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ui-error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
