"use client";

import { useState } from "react";
import { api } from "./api";
import { ErrorNotice } from "./ui";

export function ChangePassword() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (newPassword !== confirm) return setError("The new passwords don’t match");
    try {
      await api("/api/auth/password", { method: "POST", body: { currentPassword, newPassword } });
      setError(null);
      setSaved(true);
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    }
  };

  return (
    <form className="panel" style={{ maxWidth: 480 }} onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h1>Change password</h1>
          <p>Replace the default password after the first login.</p>
        </div>
      </div>
      <div className="modal body" style={{ boxShadow: "none", maxWidth: "none" }}>
        <ErrorNotice message={error} />
        {saved && <div className="notice info" style={{ margin: 0 }}>Password changed.</div>}
        <label className="field">
          <span>Current password</span>
          <input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>New password <span className="hint">(at least 10 characters)</span></span>
          <input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </label>
        <label className="field">
          <span>Repeat new password</span>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!currentPassword || !newPassword}>
          Save password
        </button>
      </div>
    </form>
  );
}
