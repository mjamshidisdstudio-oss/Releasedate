"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/dates";
import type { ApiTokenDTO } from "@/server/access";
import { api } from "./api";
import { ErrorNotice, Modal } from "./ui";

/** Personal API tokens for the MCP endpoint (Claude and other MCP clients). */
export function ApiTokens() {
  const [tokens, setTokens] = useState<ApiTokenDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "created"; token: string; name: string } | { kind: "revoke"; token: ApiTokenDTO } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<ApiTokenDTO[]>("/api/tokens")
      .then((rows) => {
        setTokens(rows);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const close = useCallback(() => setDialog(null), []);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h1>API tokens (MCP)</h1>
          <p>Connect Claude to the calendar: read, analyze and edit it from chat. A token acts as you; revoke it any time.</p>
        </div>
        <button className="btn primary" onClick={() => setDialog({ kind: "create" })}>
          + New Token
        </button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {tokens === null && !error ? (
        <div className="empty">Loading…</div>
      ) : tokens?.length === 0 ? (
        <div className="empty">No tokens yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Token</th>
                <th>Created</th>
                <th>Last used</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens?.map((t) => (
                <tr key={t.id} className={t.revokedAt ? "muted" : undefined}>
                  <td className="title">{t.name}</td>
                  <td>
                    <code>{t.prefix}…</code>
                  </td>
                  <td>{formatTimestamp(t.createdAt)}</td>
                  <td>{t.lastUsedAt ? formatTimestamp(t.lastUsedAt) : "Never"}</td>
                  <td>{t.revokedAt ? <span className="pill archived">Revoked</span> : <span className="pill released">Active</span>}</td>
                  <td>
                    {!t.revokedAt && (
                      <button className="btn small danger" onClick={() => setDialog({ kind: "revoke", token: t })}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog?.kind === "create" && (
        <CreateTokenDialog
          onClose={close}
          onCreated={(token, name) => {
            setDialog({ kind: "created", token, name });
            reload();
          }}
        />
      )}
      {dialog?.kind === "created" && <TokenCreatedDialog token={dialog.token} name={dialog.name} onClose={close} />}
      {dialog?.kind === "revoke" && (
        <RevokeDialog
          token={dialog.token}
          onClose={close}
          onDone={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function CreateTokenDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (token: string, name: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; apiToken: ApiTokenDTO }>("/api/tokens", { method: "POST", body: { name } });
      onCreated(res.token, res.apiToken.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the token");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New API token"
      subtitle="Name it after where it will be used, e.g. “Claude Code – work laptop”."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={busy || !name.trim()} onClick={submit}>
            Create token
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      <label className="field">
        <span>Token name</span>
        <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </label>
    </Modal>
  );
}

/** Copies text; falls back to execCommand because the Clipboard API needs HTTPS, and the app may be served over plain HTTP. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string, el: HTMLTextAreaElement | null) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      el?.select();
      document.execCommand("copy");
    }
    setCopied(key);
  };
  return { copied, copy };
}

function TokenCreatedDialog({ token, name, onClose }: { token: string; name: string; onClose: () => void }) {
  const endpoint = `${window.location.origin}/api/mcp`;
  const command = `claude mcp add --scope user --transport http releasedate ${endpoint} --header "Authorization: Bearer ${token}"`;
  const tokenRef = useRef<HTMLTextAreaElement>(null);
  const commandRef = useRef<HTMLTextAreaElement>(null);
  const { copied, copy } = useCopy();

  return (
    <Modal
      title={`Token created: ${name}`}
      subtitle="Copy it now. It is shown only once; if you lose it, revoke it and create a new one."
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="field">
        <span>Token</span>
        <textarea ref={tokenRef} className="textarea code" readOnly rows={2} value={token} onFocus={(e) => e.target.select()} />
        <button className="btn small" onClick={() => copy("token", token, tokenRef.current)}>
          {copied === "token" ? "Copied ✓" : "Copy token"}
        </button>
      </div>
      <div className="field">
        <span>Add it to Claude Code (run once in a terminal)</span>
        <textarea ref={commandRef} className="textarea code" readOnly rows={4} value={command} onFocus={(e) => e.target.select()} />
        <button className="btn small" onClick={() => copy("command", command, commandRef.current)}>
          {copied === "command" ? "Copied ✓" : "Copy command"}
        </button>
      </div>
      <p className="hint">
        Other MCP clients: endpoint <code>{endpoint}</code> (Streamable HTTP) with the header <code>Authorization: Bearer &lt;token&gt;</code>.
      </p>
    </Modal>
  );
}

function RevokeDialog({ token, onClose, onDone }: { token: ApiTokenDTO; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revoke = async () => {
    setBusy(true);
    try {
      await api(`/api/tokens/${token.id}`, { method: "PATCH", body: { revoked: true } });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke the token");
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Revoke token"
      subtitle={token.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Back
          </button>
          <button className="btn danger" disabled={busy} onClick={revoke}>
            Revoke token
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      <p style={{ margin: 0, fontSize: 14 }}>Anything using this token stops working immediately. This cannot be undone.</p>
    </Modal>
  );
}
