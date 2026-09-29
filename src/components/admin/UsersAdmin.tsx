"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTimestamp } from "@/lib/dates";
import type { AdminUserDTO } from "@/server/access";
import { api } from "./api";
import { ErrorNotice, Modal } from "./ui";

/** Back Office users. Each person gets their own login, so history and MCP changes show who made them. */
export function UsersAdmin() {
  const [users, setUsers] = useState<AdminUserDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<AdminUserDTO[]>("/api/users")
      .then((rows) => {
        setUsers(rows);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [reloadKey]);

  const close = useCallback(() => setCreating(false), []);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h1>Users</h1>
          <p>Everyone gets their own login. Moves, new releases and MCP changes are recorded under the user who made them.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New User
        </button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {users === null && !error ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td className="title">{u.displayName}</td>
                  <td>{u.username}</td>
                  <td>{formatTimestamp(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <NewUserDialog
          onClose={close}
          onDone={() => {
            setCreating(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function NewUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password !== confirm) return setError("The passwords don’t match");
    setBusy(true);
    setError(null);
    try {
      await api("/api/users", { method: "POST", body: { displayName, username, password } });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the user");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New user"
      subtitle="Share the password with them privately; they can change it under Account."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={busy || !username || !password} onClick={submit}>
            Create user
          </button>
        </>
      }
    >
      <ErrorNotice message={error} />
      <label className="field">
        <span>Name</span>
        <input className="input" value={displayName} maxLength={100} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="field">
        <span>
          Username <span className="hint">(letters, digits, . _ -)</span>
        </span>
        <input className="input" value={username} maxLength={50} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>
            Password <span className="hint">(10+ characters)</span>
          </span>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>Repeat password</span>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
