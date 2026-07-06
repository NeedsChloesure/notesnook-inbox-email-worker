import { FormEvent, useState } from "react";

type ApiKeyGateProps = {
  onSubmit: (apiKey: string) => void;
  loading: boolean;
  error: string | null;
};

export function ApiKeyGate({ onSubmit, loading, error }: ApiKeyGateProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  }

  return (
    <div className="card">
      <p className="card-label">Set up</p>
      <form className="key-form" onSubmit={handleSubmit}>
        <div className="key-input-row">
          <input
            className={`key-input ${error ? "invalid" : ""}`}
            type="password"
            autoComplete="off"
            data-lpignore="true"
            data-bwignore
            data-1p-ignore
            data-form-type="other"
            spellCheck={false}
            placeholder="nn__..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
          />
          <button className="btn btn-primary" type="submit" disabled={loading || value.trim().length === 0}>
            {loading ? "Checking…" : "Log in"}
          </button>
        </div>
        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <p className="hint">Paste your Notesnook Inbox API key to manage your routing options.</p>
        )}
      </form>
    </div>
  );
}
