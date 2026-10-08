"use client";
import { useState } from "react";
import { browserDb } from "@/lib/supabase";
import { ArrowUpRight, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
export function Auth({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const db = browserDb();
      if (mode === "reset") {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback`,
        });
        if (error) throw error;
        setMessage(
          "Se o endereço estiver cadastrado, você receberá instruções para redefinir a senha.",
        );
      } else {
        const { data, error } =
          mode === "signup"
            ? await db.auth.signUp({ email, password })
            : await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session) onLogin();
        else setMessage("Verifique seu e-mail para confirmar o cadastro.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <section className="auth-story">
        <a className="brand" href="/">
          f<span>FINORA</span>
          <small>2.0</small>
        </a>
        <div>
          <span className="eyebrow">SUAS FINANÇAS. SUA LIBERDADE.</span>
          <h1>
            Uma visão clara.
            <br />
            Infinitas possibilidades.
          </h1>
          <p>
            Organize o presente, acompanhe seus investimentos e construa o
            futuro que você imagina.
          </p>
          <div className="auth-orbit">
            <ChartNoAxesCombined size={72} />
            <span>Seu patrimônio, conectado.</span>
            <ArrowUpRight size={32} />
          </div>
        </div>
        <p>
          <ShieldCheck size={18} /> Seus dados financeiros pertencem a você.
        </p>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">BEM-VINDO À FINORA</span>
          <h2>
            {mode === "signup"
              ? "Seu próximo passo começa aqui"
              : mode === "reset"
                ? "Recupere seu acesso"
                : "Bom ter você por aqui."}
          </h2>
          <p>Entre para cuidar do seu dinheiro com mais tranquilidade.</p>
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            {mode !== "reset" && (
              <label>
                Senha
                <input
                  type="password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Aguarde…"
                : mode === "signup"
                  ? "Criar minha conta"
                  : mode === "reset"
                    ? "Enviar instruções"
                    : "Entrar na minha conta"}
              <ArrowUpRight size={18} />
            </button>
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
          </form>
          <div className="auth-links">
            <button
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setMessage("");
              }}
            >
              {mode === "signup" ? "Já tenho uma conta" : "Criar conta"}
            </button>
            <button
              onClick={() => setMode(mode === "reset" ? "login" : "reset")}
            >
              {mode === "reset" ? "Voltar para login" : "Esqueci minha senha"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
