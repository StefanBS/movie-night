import React from "react";

/**
 * Toast — the confirmation card shown after a save ("Reminder set"). This is
 * the presentational card; timing/queueing lives in the app's ToastProvider.
 */
export function Toast({ title, body, style }) {
  return (
    <div role="status" style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", boxShadow: "var(--shadow-md), inset 0 0 0 1px var(--border-hairline)", ...style }}>
      <span aria-hidden="true" style={{ flex: "none", width: 22, height: 22, borderRadius: "50%", background: "var(--text-primary)", color: "var(--surface-page)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-base)", fontWeight: "var(--weight-bold)", color: "var(--text-primary)", lineHeight: 1.3 }}>{title}</div>
        {body ? <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>{body}</div> : null}
      </div>
    </div>
  );
}
