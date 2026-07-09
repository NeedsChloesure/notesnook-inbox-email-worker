import { useState } from "react";
import type { ReturnedUserDocument, UserOptions } from "../types";

type ToggleKey = "archived" | "favorited" | "readonly" | "pinned";

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: "archived", label: "Archived" },
  { key: "favorited", label: "Favorited" },
  { key: "readonly", label: "Read only" },
  { key: "pinned", label: "Pinned" },
];

type OptionsPanelProps = {
  user: ReturnedUserDocument;
  onSave: (options: UserOptions) => Promise<void>;
  onDisconnect: () => void;
};

function toCsv(list?: string[]): string {
  return (list ?? []).join(", ");
}

function fromCsv(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function OptionsPanel({ user, onSave, onDisconnect }: OptionsPanelProps) {
  const [options, setOptions] = useState<UserOptions>(user.options ?? {});
  const [tagsInput, setTagsInput] = useState(toCsv(user.options?.tags));
  const [notebooksInput, setNotebooksInput] = useState(toCsv(user.options?.notebooks));
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);

  const isDirty = 
    tagsInput !== toCsv(user.options?.tags) || 
    notebooksInput !== toCsv(user.options?.notebooks) ||
    TOGGLES.some(({key}) => Boolean(options[key]) !== Boolean(user.options?.[key]))

  function toggle(key: ToggleKey) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setStatus("saving");
    setStatusMessage(null);
    const payload: UserOptions = {
      ...options,
      tags: fromCsv(tagsInput),
      notebooks: fromCsv(notebooksInput),
    };
    try {
      await onSave(payload);
      setStatus("ok");
      setStatusMessage("Saved");
    } catch (err) {
      setStatus("err");
      setStatusMessage(err instanceof Error ? err.message : "Could not save options.");
    } finally {
      setTimeout(() => {setStatus("idle");setStatusMessage(null);}, 5000)
    }
  }

  async function copyEmail(){
    try {
      navigator.clipboard.writeText(user.email)
      setCopied(true)
      setTimeout(() => setCopied(null), 1500)
    } catch (error) {
      // if the copy fails, change button to red
      setCopied(false)
      setTimeout(() => setCopied(null), 1500)
    }
  }

  async function confirmDisconnect(){
    if (isDirty){
      const isSure = confirm("Are you sure you want to log out? You have unsaved settings.")
      if (isSure) {
        onDisconnect()
      }
    } else {
      onDisconnect()
    }
  }

  return (
    <div className="card">
      <p className="card-label">Routing options</p>

      <div className="identity-row">
        <button className="btn btn-ghost" style={copied === false ? { color: "var(--err)" } : undefined} onClick={copyEmail}>{copied === true ? "✓" : copied === false ? "✕" : "⧉"}</button>
        <div className="identity-email">
          <p>{user.email}</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={confirmDisconnect}>
          Log out
        </button>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="tags">
          Tags
        </label>
        <input
          id="tags"
          className="field-input"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="Copy tag IDs and paste them here"
        />
        <p className="field-hint">This field is comma-separated.</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="notebooks">
          Notebooks
        </label>
        <input
          id="notebooks"
          className="field-input"
          value={notebooksInput}
          onChange={(e) => setNotebooksInput(e.target.value)}
          placeholder="Copy notebook IDs and paste them here"
        />
        <p className="field-hint">This field is comma-separated.</p>
      </div>

      <div className="field">
        <span className="field-label">Flags</span>
        <div className="toggle-grid">
          {TOGGLES.map(({ key, label }) => (
            <div key={key} className="toggle" onClick={() => toggle(key)}>
              <span>{label}</span>
              <span className={`switch ${options[key] ? "on" : ""}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="panel-footer">
        <span className={`save-status ${status === "ok" ? "ok" : status === "err" ? "err" : ""}`}>
          {statusMessage ?? ""}
        </span>
        <button className="btn btn-primary" type="button" onClick={handleSave} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save options"}
        </button>
      </div>
    </div>
  );
}
