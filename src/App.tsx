import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import LandingPage from "./views/LandingPage";
import CreateQuizPage from "./views/CreateQuizPage";
import HostGamePage from "./views/HostGamePage";
import JoinGamePage from "./views/JoinGamePage";
import LobbyView from "./views/LobbyView";
import GameBoardView from "./views/GameBoardView";
import type { Lobby, LobbyPlayer } from "./types";

type View =
  | { name: "landing" }
  | { name: "createQuiz" }
  | { name: "hostGame" }
  | { name: "joinGame" }
  | { name: "lobby"; lobby: Lobby; selfPlayer: LobbyPlayer }
  | { name: "game"; lobby: Lobby; selfPlayer: LobbyPlayer };

// Auth als MODAL über allem mit Blur-Hintergrund
function AuthBox({
  onDone,
}: {
  onDone?: () => void;
}) {
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

        // Profil anlegen (falls du die Tabelle "profiles" wie besprochen erstellt hast)
        if (data.user) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            username,
          });
        }

        setInfo("Registrierung erfolgreich. Du bist jetzt eingeloggt.");
        if (onDone) onDone();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setInfo("Login erfolgreich.");
        if (onDone) onDone();
      }
    } catch (err: any) {
      setInfo(err.message ?? "Fehler bei Anmeldung/Registrierung.");
    } finally {
      setLoading(false);
    }
  };

  return (
    // OVERLAY über der kompletten App
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Modal-Box */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-[90%] max-w-sm p-5 space-y-3 shadow-2xl">
        {/* Schließen-Button oben rechts */}
        <button
          onClick={onDone}
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
                : "bg-slate-800 text-slate-300"
            }`}
            onClick={() => setMode("register")}
          >
            Registrieren
          </button>
          <button
            className={`px-3 py-1 rounded-full ${
              mode === "login"
                ? "bg-indigo-500 text-white"
                : "bg-slate-800 text-slate-300"
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

function App() {
  const [view, setView] = useState<View>({ name: "landing" });

  // 🔐 Auth-Status (Supabase)
  const [authUser, setAuthUser] = useState<null | { id: string; email?: string | null }>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthBox, setShowAuthBox] = useState(false);

  // Supabase-User einmal beim Start holen + bei Änderungen updaten
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      setAuthUser(data.user ?? null);
      setAuthLoading(false);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-200 text-sm">
        Lade...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex">
      <div className="m-auto w-full max-w-5xl bg-slate-800/80 rounded-2xl shadow-xl border border-slate-700 p-6 md:p-8 relative">
        {/* Obere Leiste: Titel + Auth-Info */}
        <div className="flex items-center justify-between mb-4 text-xs text-slate-200">
          <div className="font-semibold tracking-wide uppercase text-[11px] text-slate-300">
            Realtime Quizgame
          </div>

          <div className="flex items-center gap-2">
            {authUser ? (
              <>
                <span className="hidden sm:inline text-slate-300">
                  Eingeloggt als{" "}
                  <span className="font-semibold">
                    {authUser.email ?? "User"}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setShowAuthBox(false);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-[11px]"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAuthBox(true)}
                className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-[11px] font-semibold"
              >
                Login / Registrieren
              </button>
            )}
          </div>
        </div>

        {/* Haupt-Views */}
        {view.name === "landing" && (
          <LandingPage
            onCreateQuiz={() => setView({ name: "createQuiz" })}
            onHostGame={() => setView({ name: "hostGame" })}
            onJoinGame={() => setView({ name: "joinGame" })}
          />
        )}
        {view.name === "createQuiz" && (
          <CreateQuizPage onBack={() => setView({ name: "landing" })} />
        )}
        {view.name === "hostGame" && (
          <HostGamePage
            onBack={() => setView({ name: "landing" })}
            onLobbyReady={(lobby, selfPlayer) =>
              setView({ name: "lobby", lobby, selfPlayer })
            }
          />
        )}
        {view.name === "joinGame" && (
          <JoinGamePage
            onBack={() => setView({ name: "landing" })}
            onLobbyReady={(lobby, selfPlayer) =>
              setView({ name: "lobby", lobby, selfPlayer })
            }
          />
        )}
        {view.name === "lobby" && (
          <LobbyView
            lobby={view.lobby}
            selfPlayer={view.selfPlayer}
            onGameStart={(lobby, selfPlayer) =>
              setView({ name: "game", lobby, selfPlayer })
            }
          />
        )}
        {view.name === "game" && (
          <GameBoardView lobby={view.lobby} selfPlayer={view.selfPlayer} />
        )}

        {/* AUTH-MODAL */}
        {!authUser && showAuthBox && (
          <AuthBox onDone={() => setShowAuthBox(false)} />
        )}
      </div>
    </div>
  );
}

export default App;
