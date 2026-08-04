import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="ui-page-header">
      <div>
        <h1 className="crm-page-title">{title}</h1>
        {subtitle ? <p className="crm-page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-page-actions">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
}) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`crm-panel${className ? ` ${className}` : ""}`}>
      {(title || actions) && (
        <div className="crm-panel-head">
          <div>
            {title ? <div className="crm-panel-title">{title}</div> : null}
            {subtitle ? <div className="crm-panel-sub">{subtitle}</div> : null}
          </div>
          {actions}
        </div>
      )}
      <div className="crm-panel-body">{children}</div>
    </section>
  );
}
