"use client";

import { useState } from "react";
import { api } from "./api";
import { ErrorNotice } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { username, password } });
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <form className="panel login-card" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h1>Back Office login</h1>
          <p>Release Management</p>
        </div>
      </div>
      <div className="modal body" style={{ boxShadow: "none", maxWidth: "none" }}>
        <ErrorNotice message={error} />
        <label className="field">
          <span>Username</span>
          <input className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy || !username || !password}>
          Log in
        </button>
      </div>
    </form>
  );
}
