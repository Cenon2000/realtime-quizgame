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
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [username, setUsername] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const handleSubmit = async () => {
    resetMessages();
    setLoading(true);

    try {
      if (!email.trim()) {
        setError("Bitte gib eine E-Mail ein.");
        return;
      }
      if (!password) {
        setError("Bitte gib ein Passwort ein.");
        return;
      }

      if (mode === "register") {
        if (!username.trim()) {
          setError("Bitte gib einen Anzeigenamen ein.");
          return;
        }

        if (password !== passwordConfirm) {
          setError("Die Passwörter stimmen nicht überein.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: username.trim() },
            // Redirect für Bestätigungslink später (kannst du später aktiv nutzen)
            // emailRedirectTo: `${window.location.origin}/auth/confirmed`,
          },
        });
        if (error) throw error;

        // Optional: Profil in "profiles" anlegen
        if (data.user) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            username: username.trim(),
          });
        }

        setInfo(
          "Registrierung erfolgreich.\nBitte bestätige ggf. deine E-Mail, falls du eine Mail bekommen hast."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        setInfo("Login erfolgreich.");
      }
    } catch (err: any) {
      setError(err?.message ?? "Fehler bei Auth.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();
    setLoading(true);

    try {
      if (!email.trim()) {
        setError("Bitte gib zuerst deine E-Mail ein.");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // Diese Seite bauen wir später – der Link funktioniert trotzdem erst,
        // wenn die Redirect URL in Supabase erlaubt ist.
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setInfo("Wir haben dir eine E-Mail zum Zurücksetzen des Passworts geschickt.");
    } catch (err: any) {
      setError(err?.message ?? "Fehler beim Zurücksetzen des Passworts.");
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
            type="button"
            className={`px-3 py-1 rounded-full ${
              mode === "register"
                ? "bg-indigo-500 text-white"
                : "bg-slate-700 text-slate-200"
            }`}
            onClick={() => {
              setMode("register");
              resetMessages();
            }}
          >
            Registrieren
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-full ${
              mode === "login"
                ? "bg-indigo-500 text-white"
                : "bg-slate-700 text-slate-200"
            }`}
            onClick={() => {
              setMode("login");
              resetMessages();
            }}
          >
            Anmelden
          </button>
        </div>

        {mode === "register" && (
          <label className="flex flex-col text-xs gap-1">
            Anzeigename
            <input
              className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm text-slate-100"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="nickname"
            />
          </label>
        )}

        <label className="flex flex-col text-xs gap-1">
          E-Mail
          <input
            className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm text-slate-100"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={mode === "login" ? "email" : "email"}
          />
        </label>

        <label className="flex flex-col text-xs gap-1">
          Passwort
          <input
            type="password"
            className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm text-slate-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>

        {mode === "register" && (
          <label className="flex flex-col text-xs gap-1">
            Passwort wiederholen
            <input
              type="password"
              className="px-2 py-1 rounded bg-slate-800 border border-slate-600 text-sm text-slate-100"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}

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

        {/* Passwort vergessen nur im Login-Modus */}
        {mode === "login" && (
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            className="w-full text-xs text-slate-300 hover:text-slate-100 underline disabled:opacity-60"
          >
            Passwort vergessen?
          </button>
        )}

        {error && (
          <p className="text-xs text-rose-300 mt-1 text-center whitespace-pre-line">
            {error}
          </p>
        )}

        {info && (
          <p className="text-xs text-slate-300 mt-1 text-center whitespace-pre-line">
            {info}
          </p>
        )}
      </div>
    </div>
  );
}
