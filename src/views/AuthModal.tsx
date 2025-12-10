// src/components/AuthModal.tsx
import { useState } from "react";
import { supabase } from "../supabaseClient";

type Props = {
  onClose: () => void;
};

export default function AuthModal({ onClose }: Props) {
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
            data: { username },
          },
        });
        if (error) throw error;

        // Optional: Profil in "profiles" anlegen
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
    // OVERLAY über der gesamten Seite
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Modal-Box */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-[90%] max-w-sm p-5 space-y-3 shadow-2xl">
        {/* Schließen-Button oben rechts */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-slate-800 border border-slate-600 text-xs flex items-center justify-center hover:bg-slate-700"
        >
          ✕
        </button>

        <h2 className="text-lg font-semibold text-center mb-1">
          {mode === "register" ? "Account erstellen" : "Anmelden"}
        </h2>

        {/* Modus-Toggle */}
        <div className="flex justify-center gap-2 text-xs mb-1">
          <button
            className={`px-3 py-1 rounded-full ${
              mode === "register"
                ? "bg-indigo-500 text-white"
                : "bg-slate-700 text-slate-200"
            }`}
            onClick={() => setMode("register")}
          >
            Registrieren
          </button>
          <button
            className={`px-3 py-1 rounded-full ${
              mode === "login"
                ? "bg-indigo-500 text-white"
                : "bg-slate-700 text-slate-200"
            }`}
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
          {loading
            ? "Bitte warten..."
            : mode === "register"
            ? "Account erstellen"
            : "Einloggen"}
        </button>

        {info && (
          <p className="text-xs text-slate-300 mt-1 text-center whitespace-pre-line">
            {info}
          </p>
        )}
      </div>
    </div>
  );
}
