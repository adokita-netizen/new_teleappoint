import React from "react";
import { createRoot } from "react-dom/client";
import { Route, Router, Switch, useLocation } from "wouter";
function SignupPage() {
  const [, setLocation] = useLocation();
  const [token, setToken] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [email, setEmail] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<string | null>(null);

  const verify = async () => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("token") || token;
    if (!t) return;
    const res = await fetch(`/api/trpc/auth.verifyInvite?input=${encodeURIComponent(JSON.stringify({ token: t }))}`);
    const payload = await res.json();
    const data = (payload as any)?.result?.data ?? null;
    setEmail(data?.email ?? null);
    setRole(data?.role ?? null);
  };

  React.useEffect(() => {
    verify().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = new URL(window.location.href).searchParams.get("token") || token;
    const input = { token: t, name, password };
    const res = await fetch(`/api/trpc/auth.acceptInvite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const ok = res.ok;
    if (ok) setLocation("/login");
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <form onSubmit={submit} style={{ width: 360, display: "grid", gap: 12 }}>
        <h1>招待で新規登録</h1>
        <label>
          招待トークン
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="URLのtoken または 手入力" />
        </label>
        <button type="button" onClick={verify}>招待を確認</button>
        <div>メール: {email ?? "-"}</div>
        <div>ロール: {role ?? "-"}</div>
        <label>
          表示名
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          パスワード
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit">登録してログイン画面へ</button>
      </form>
    </div>
  );
}

function Redirect(props: { to: string }) {
  const [, setLocation] = useLocation();
  React.useEffect(() => setLocation(props.to), [props.to, setLocation]);
  return null;
}

function LoginPage() {
  const handleLogin = () => {
    window.location.href = "/api/oauth/login";
  };
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div style={{ width: 360, display: "grid", gap: 16 }}>
        <h1>ログイン</h1>
        <p>テレアポ管理にサインインしてください。</p>
        <button onClick={handleLogin} style={{ padding: "10px 14px" }}>
          OAuthでログイン
        </button>
        <a href="/signup" style={{ color: "#2563eb" }}>招待コードで新規登録</a>
      </div>
    </div>
  );
}

function useMe() {
  const [me, setMe] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setMe(data))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);
  return { me, loading } as const;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();
  if (loading) return <div />;
  if (!me) return <Redirect to="/login" />;
  return <>{children}</>;
}

function HomePage() {
  const [me, setMe] = React.useState<any | null>(null);
  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);
  return (
    <div style={{ padding: 24 }}>
      <h2>ダッシュボード</h2>
      <p>ようこそ {me?.name ?? ""}</p>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route>
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        </Route>
      </Switch>
    </Router>
  );
}

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(<App />);


