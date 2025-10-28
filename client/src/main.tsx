import React from "react";
import { createRoot } from "react-dom/client";
import { Link, Route, Router, Switch, useLocation } from "wouter";
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
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const handleLogin = () => {
    window.location.href = "/api/oauth/login";
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      const j = await res.json().catch(() => ({} as any));
      setError(j?.error ?? "ログインに失敗しました");
    }
  };
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div style={{ width: 360, display: "grid", gap: 16 }}>
        <h1>ログイン</h1>
        <p>テレアポ管理にサインインしてください。</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
          <label>
            メールアドレス
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            パスワード
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div style={{ color: "#dc2626" }}>{error}</div> : null}
          <button type="submit" style={{ padding: "10px 14px" }}>メール/パスワードでログイン</button>
        </form>
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
    <div>
      <div className="nav">
        <strong>Teleappoint</strong>
        <Link href="/">ホーム</Link>
        <Link href="/leads">顧客リスト</Link>
        <span className="spacer" />
        <span style={{ color: "#8a9ab5" }}>{me?.email ?? me?.name ?? ""}</span>
      </div>
      <div className="container">
        <h2 className="section-title">ダッシュボード</h2>
        <div className="card">ようこそ {me?.name ?? ""}</div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/leads" component={LeadsPage} />
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

function LeadsPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [form, setForm] = React.useState({ name: "", company: "", phone: "", email: "", prefecture: "", industry: "", memo: "" });
  const [error, setError] = React.useState<string | null>(null);

  const load = async () => {
    // 簡易: 既存の list API を流用（フィルタなし）
    const res = await fetch(`/api/trpc/leads.list`);
    const payload = await res.json();
    const data = (payload as any)?.result?.data ?? [];
    setItems(data);
  };

  React.useEffect(() => { load().catch(() => void 0); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const input = { ...form };
    const res = await fetch(`/api/trpc/leads.create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) });
    if (res.ok) {
      setForm({ name: "", company: "", phone: "", email: "", prefecture: "", industry: "", memo: "" });
      await load();
    } else {
      const j = await res.json().catch(() => ({} as any));
      setError(j?.error ?? "追加に失敗しました");
    }
  };

  return (
    <div>
      <div className="nav">
        <strong>Teleappoint</strong>
        <Link href="/">ホーム</Link>
        <Link href="/leads" className="active">顧客リスト</Link>
        <span className="spacer" />
        <a href="/api/auth/logout" className="btn secondary">Sign out</a>
      </div>
      <div className="container grid" style={{ gap: 16 }}>
        <div className="card">
          <h3 className="section-title">新規リード</h3>
          <form onSubmit={submit} className="grid cols-2">
            <label>氏名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>会社<input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
            <label>電話<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="例: 03-1234-5678" /></label>
            <label>メール<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.jp" /></label>
            <label>都道府県<input value={form.prefecture} onChange={(e) => setForm({ ...form, prefecture: e.target.value })} /></label>
            <label>業種<input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
            <label className="grid" style={{ gridColumn: "1 / -1" }}>メモ<textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></label>
            {error ? <div style={{ color: "#dc2626" }}>{error}</div> : null}
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">追加</button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3 className="section-title">リード一覧</h3>
          <table>
            <thead>
              <tr>
                <th>氏名</th>
                <th>会社</th>
                <th>電話</th>
                <th>メール</th>
                <th>ステータス</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.name}</td>
                  <td>{it.company}</td>
                  <td>{it.phone}</td>
                  <td>{it.email}</td>
                  <td>{it.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


