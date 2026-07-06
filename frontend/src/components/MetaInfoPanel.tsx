import type { ServerMeta } from "../types";

export function MetaInfoPanel({meta, error}: {meta: ServerMeta | null, error: string | null}) {
  //console.log(meta, error)
  return (
    <div className="card">
      <p className="card-label">Server stats</p>
      {error && <p className="error-text">{error}</p>}
      {!error && (
        <div className="meta-grid">
          <div className="meta-item">
            <p className="meta-item-label">Configured Instance</p>
            <p className="meta-item-value">{meta?.instance ?? "—"}</p>
          </div>
          <div className="meta-item">
            <p className="meta-item-label">Users</p>
            <p className="meta-item-value">{meta?.count ?? "—"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
