import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setInfo(null);
    setLoading(true);

    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
            },
          },
        });
        if (error) throw error;

        // Profil anlegen
        if (data.user) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            username,
          });
        }
        setInfo("Registrierung erfolgreich. Du bist jetzt eingeloggt.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setInfo("Login erfolgreich.");
      }
    } catch (err: any) {
      setInfo(err.message ?? "Fehler bei Auth.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-8 bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex justify-center gap-2 text-sm">
        <button
          className={`px-3 py-1 rounded-full ${mode === "register" ? "bg-indigo-500" : "bg-slate-700"}`}
          onClick={() => setMode("register")}
        >
          Registrieren
        </button>
        <button
          className={`px-3 py-1 rounded-full ${mode === "login" ? "bg-indigo-500" : "bg-slate-700"}`}
          onClick={() => setMode("login")}
        >
          Anmelden
        </button>
      </div>

      {mode === "register" && (
        <label className="flex flex-col text-xs gap-1">
          Anzeigename
          <input
            className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
      )}

      <label className="flex flex-col text-xs gap-1">
        E-Mail
        <input
          className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="flex flex-col text-xs gap-1">
        Passwort
        <input
          type="password"
          className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <button
        className="w-full mt-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold disabled:opacity-60"
        disabled={loading}
        onClick={handleSubmit}
      >
        {loading ? "Bitte warten..." : mode === "register" ? "Account erstellen" : "Einloggen"}
      </button>

      {info && <p className="text-xs text-slate-300 mt-1">{info}</p>}
    </div>
  );
}
