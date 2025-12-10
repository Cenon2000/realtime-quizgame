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

/* ===========================
   AUTH-MODAL (Login + Register)
   =========================== */

function AuthBox({
  onDone,
  initialMode = "login",
}: {
  onDone?: () => void;
  initialMode?: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
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

        // Profil anlegen (falls "profiles"-Tabelle existiert)
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
    // Overlay über der ganzen App
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-[90%] max-w-sm p-5 space-y-3 shadow-2xl">
        {/* schließen */}
        <button
          onClick={onDone}
          className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-slate-800 border border-slate-600 text-xs flex items-center justify-center hover:bg-slate-700"
        >
          ✕
        </button>

        <h2 className="text-lg font-semibold text-center mb-1">
          {mode === "register" ? "Account erstellen" : "Anmelden"}
        </h2>

        {/* Modus wählen */}
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

/* ===========================
   STATISTIK-MODAL – liest NUR aus profiles
   =========================== */

function StatsModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalPoints: number;
    questionsCorrect: number;
    questionsWrong: number;
    gamesPlayed: number;
    gamesWon: number;
  } | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setError(null);

      // 🔍 Stats direkt aus der profiles-Tabelle lesen
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          "total_points, questions_correct, questions_wrong, games_played, games_won"
        )
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("Fehler beim Laden aus profiles:", profileError.message);
        setError("Fehler beim Laden deiner Statistiken.");
        setLoading(false);
        return;
      }

      setStats({
        totalPoints: data?.total_points ?? 0,
        questionsCorrect: data?.questions_correct ?? 0,
        questionsWrong: data?.questions_wrong ?? 0,
        gamesPlayed: data?.games_played ?? 0,
        gamesWon: data?.games_won ?? 0,
      });

      setLoading(false);
    };

    loadStats();
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-[90%] max-w-md p-6 space-y-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-slate-800 border border-slate-600 text-xs flex items-center justify-center hover:bg-slate-700"
        >
          ✕
        </button>

        <h2 className="text-xl font-semibold text-center mb-2">
          Deine Statistiken
        </h2>

        {loading && (
          <p className="text-xs text-slate-300 text-center">Lade...</p>
        )}

        {error && (
          <p className="text-xs text-rose-300 text-center">{error}</p>
        )}

        {!loading && !error && stats && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-800/80 rounded-xl p-3 flex flex-col items-start">
              <span className="text-[11px] text-slate-400">Gesamtpunkte</span>
              <span className="text-lg font-mono">{stats.totalPoints}</span>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 flex flex-col items-start">
              <span className="text-[11px] text-slate-400">
                Runden gespielt
              </span>
              <span className="text-lg font-mono">{stats.gamesPlayed}</span>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 flex flex-col items-start">
              <span className="text-[11px] text-slate-400">
                Runden gewonnen
              </span>
              <span className="text-lg font-mono">{stats.gamesWon}</span>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 flex flex-col items-start">
              <span className="text-[11px] text-slate-400">
                Antworten richtig
              </span>
              <span className="text-lg font-mono">
                {stats.questionsCorrect}
              </span>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 flex flex-col items-start">
              <span className="text-[11px] text-slate-400">
                Antworten falsch
              </span>
              <span className="text-lg font-mono">
                {stats.questionsWrong}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================
   APP
   =========================== */

function App() {
  const [view, setView] = useState<View>({ name: "landing" });

  // Auth-Status
  const [authUser, setAuthUser] = useState<
    null | { id: string; email?: string | null }
  >(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Profil-Menü + Modals
  const [profileOpen, setProfileOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<null | "login" | "register">(null);
  const [showStats, setShowStats] = useState(false);

  // Supabase-User laden
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

  // Anfangsbuchstabe für Profil-Button
  const profileInitial = authUser?.email?.[0]?.toUpperCase() ?? "P";

  return (
    <div className="min-h-screen bg-slate-900 flex relative">
      {/* Haupt-Container */}
      <div className="m-auto w-full max-w-5xl bg-slate-800/80 rounded-2xl shadow-xl border border-slate-700 p-6 md:p-8">
        {/* Titel */}
        <div className="flex items-center justify-center mb-4">
          <div className="font-semibold tracking-wide uppercase text-[11px] text-slate-300">
            Aaron's
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
      </div>

      {/* Profil-Button (innen, oben rechts) */}
      <div className="absolute top-3 right-4 z-40">
        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="
              w-10 h-10 rounded-full
              bg-slate-800 border border-slate-600
              flex items-center justify-center
              text-sm font-semibold text-slate-100
              hover:bg-slate-700
            "
          >
            {profileInitial}
          </button>

          {profileOpen && (
            <div
              className="
                absolute right-0 mt-2
                w-40 bg-slate-900 border border-slate-700
                rounded-xl shadow-lg p-2
                flex flex-col gap-1 text-xs
              "
            >
              {!authUser ? (
                <>
                  <button
                    onClick={() => {
                      setAuthModalMode("login");
                      setProfileOpen(false);
                    }}
                    className="w-full px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-left"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalMode("register");
                      setProfileOpen(false);
                    }}
                    className="w-full px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-left"
                  >
                    Create Account
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setShowStats(true);
                      setProfileOpen(false);
                    }}
                    className="w-full px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-left"
                  >
                    Statistiken
                  </button>
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setShowStats(false);
                      setAuthModalMode(null);
                      setProfileOpen(false);
                    }}
                    className="w-full px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-left"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AUTH-MODAL */}
      {authModalMode && !authUser && (
        <AuthBox
          initialMode={authModalMode}
          onDone={() => setAuthModalMode(null)}
        />
      )}

      {/* STATISTIK-MODAL */}
      {showStats && authUser && (
        <StatsModal userId={authUser.id} onClose={() => setShowStats(false)} />
      )}
    </div>
  );
}

export default App;
