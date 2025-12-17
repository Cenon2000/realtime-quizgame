import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // optional: kleine Info, falls jemand die Seite “normal” öffnet
  useEffect(() => {
    supabase.auth.getSession().then(() => {});
  }, []);

  const handleUpdatePassword = async () => {
    setError(null);
    setInfo(null);

    if (!password) {
      setError("Bitte gib ein neues Passwort ein.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      return;
    }

    setInfo("Passwort wurde geändert. Du kannst dich jetzt anmelden.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-amber-300 mb-2">
          Passwort zurücksetzen
        </h1>

        <p className="text-sm text-slate-300 mb-4">
          Gib ein neues Passwort ein und bestätige es.
        </p>

        {error && <p className="text-xs text-rose-300 mb-3">{error}</p>}
        {info && <p className="text-xs text-emerald-300 mb-3">{info}</p>}

        <div className="flex flex-col gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Neues Passwort"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="Neues Passwort wiederholen"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />

          <button
            onClick={handleUpdatePassword}
            className="mt-2 w-full px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold"
          >
            Passwort speichern
          </button>
        </div>
      </div>
    </div>
  );
}
