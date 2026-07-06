import { useEffect, useState } from "react";
import { ApiKeyGate } from "./ApiKeyGate";
import { MetaInfoPanel } from "./MetaInfoPanel";
import { OptionsPanel } from "./OptionsPanel";
import { ApiKeyError, getMeta, getUser, updateUser } from "../api";
import type { ReturnedUserDocument, ServerMeta, UserOptions } from "../types";

const STORAGE_KEY = "inbox_admin_api_key"; // used in SessionStorage

export function Dashboard() {
  const [apiKey, setApiKey] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<ReturnedUserDocument | null>(null);
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    void loadMeta();
    if (apiKey) void connect(apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(key: string) {
    setConnecting(true);
    setConnectError(null);
    try {
      const userDoc = await getUser(key);
      setUser(userDoc);
      sessionStorage.setItem(STORAGE_KEY, key);
      setApiKey(key);
    } catch (err) {
      setUser(null);
      setConnectError(err instanceof ApiKeyError ? err.message : "Could not reach the server.");
      sessionStorage.removeItem(STORAGE_KEY);
      setApiKey(null);
    } finally {
      setConnecting(false);
    }
  }

  async function loadMeta() {
    setMetaError(null);
    try {
      setMeta(await getMeta());
    } catch (err) {
      setMetaError(err instanceof ApiKeyError ? err.message : "Could not load server info.");
    }
  }

  function disconnect() {

    sessionStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setUser(null);
    setMetaError(null);
    setConnectError(null);
  }

  async function saveOptions(options: UserOptions) {
    if (!apiKey) return;
    await updateUser(apiKey, options);
    const refreshed = await getUser(apiKey);
    setUser(refreshed);
  }

  const connected = Boolean(user);

  return (
    <div className="screen">
      <div className="wordmark">
        <h1>Email to Notesnook Forwarder</h1>
      </div>
      <p className="tagline">
        A proxy for emails you wish to send to your notes.
      </p>

      <div className="stack">
        <MetaInfoPanel meta={meta} error={metaError} />
        {!connected ? (
          <ApiKeyGate onSubmit={connect} loading={connecting} error={connectError} />
        ) : (
          user && <OptionsPanel user={user} onSave={saveOptions} onDisconnect={disconnect} />
        )}
      </div>
      <div className="footer">
        <p>This service has no affiliation with Notesnook, Streetwriters Ltd., or any of their affiliates.</p>
        <p><a href="./terms">Terms of Service</a> | <a href="./privacy">Privacy Policy</a> | <a href="https://github.com/NeedsChloesure/notesnook-inbox-email-worker/">Host your own copy of this mess</a></p>
      </div>
    </div>
  );
}
