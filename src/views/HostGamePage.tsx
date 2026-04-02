import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import type { Lobby, LobbyPlayer, Quiz } from "../types";

type Props = {
  onBack: () => void;
  onLobbyReady: (lobby: Lobby, selfPlayer: LobbyPlayer) => void;
};

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function clampPlayers(n: number) {
  return Math.min(12, Math.max(1, n));
}

function errorToMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "Unbekannter Fehler";
}

function isMissingColumnError(err: unknown): boolean {
  const message = errorToMessage(err).toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

async function insertInitialGameState(lobbyId: string) {
  const withBoth = await supabase.from("game_states").insert({
    lobby_id: lobbyId,
    current_player_id: null,
    question_status: "idle",
    active_answering_player_id: null,
    current_question_id: null,
    current_board: 1,
    board: 1,
  });

  if (!withBoth.error) return;
  if (!isMissingColumnError(withBoth.error)) throw withBoth.error;

  const withCurrentBoard = await supabase.from("game_states").insert({
    lobby_id: lobbyId,
    current_player_id: null,
    question_status: "idle",
    active_answering_player_id: null,
    current_question_id: null,
    current_board: 1,
  });

  if (!withCurrentBoard.error) return;
  if (!isMissingColumnError(withCurrentBoard.error)) throw withCurrentBoard.error;

  const withLegacyBoard = await supabase.from("game_states").insert({
    lobby_id: lobbyId,
    current_player_id: null,
    question_status: "idle",
    active_answering_player_id: null,
    current_question_id: null,
    board: 1,
  });

  if (!withLegacyBoard.error) return;
  if (!isMissingColumnError(withLegacyBoard.error)) throw withLegacyBoard.error;

  const minimal = await supabase.from("game_states").insert({
    lobby_id: lobbyId,
    current_player_id: null,
    question_status: "idle",
    active_answering_player_id: null,
    current_question_id: null,
  });

  if (minimal.error) throw minimal.error;
}

export default function HostGamePage({ onBack, onLobbyReady }: Props) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(3); // Spieler OHNE Host
  const [maxPlayersInput, setMaxPlayersInput] = useState("3");
  const [hostName, setHostName] = useState("Host");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  function commitMaxPlayers(raw: string) {
    const n = raw.trim() === "" ? maxPlayers : Number(raw);
    const clamped = clampPlayers(Number.isFinite(n) ? n : maxPlayers);
    setMaxPlayers(clamped);
    setMaxPlayersInput(String(clamped));
  }

  useEffect(() => {
    supabase
      .from("quizzes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setQuizzes(data);
          if (data[0]) setQuizId(data[0].id);
        }
      });
  }, []);

  const handleHost = async () => {
    if (!quizId) {
      setInfo("Bitte ein Quiz auswaehlen.");
      return;
    }
    if (!lobbyName.trim()) {
      setInfo("Bitte einen Lobby-Namen eingeben.");
      return;
    }
    if (!hostName.trim()) {
      setInfo("Bitte einen Host-Namen eingeben.");
      return;
    }

    setLoading(true);
    setInfo(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.warn("Konnte aktuellen User nicht ermitteln:", authError.message);
      }
      const authUserId = authData.user?.id ?? null;

      const joinCode = generateJoinCode();

      const { data: lobbyData, error: lobbyError } = await supabase
        .from("lobbies")
        .insert({
          name: lobbyName.trim(),
          quiz_id: quizId,
          max_players: maxPlayers,
          join_code: joinCode,
        })
        .select()
        .single();

      if (lobbyError || !lobbyData) throw lobbyError;

      const fullPlayerInsert = await supabase
        .from("lobby_players")
        .insert({
          lobby_id: lobbyData.id,
          name: hostName.trim(),
          is_host: true,
          score: 0,
          turn_order: 0,
          user_id: authUserId,
          is_connected: true,
          last_seen: new Date().toISOString(),
        })
        .select()
        .single();

      let playerData = (fullPlayerInsert.data as LobbyPlayer | null) ?? null;
      let playerError: unknown = fullPlayerInsert.error;

      if (playerError && isMissingColumnError(playerError)) {
        const fallbackPlayerInsert = await supabase
          .from("lobby_players")
          .insert({
            lobby_id: lobbyData.id,
            name: hostName.trim(),
            is_host: true,
            score: 0,
            turn_order: 0,
            user_id: authUserId,
          })
          .select()
          .single();

        playerData = (fallbackPlayerInsert.data as LobbyPlayer | null) ?? null;
        playerError = fallbackPlayerInsert.error;
      }

      if (playerError || !playerData) throw playerError;

      await insertInitialGameState(lobbyData.id);

      onLobbyReady(lobbyData as Lobby, playerData as LobbyPlayer);
    } catch (err) {
      console.error(err);
      setInfo(`Fehler beim Erstellen der Lobby: ${errorToMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Spiel hosten</h2>
        <button
          className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          onClick={onBack}
        >
          Zurueck
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            Lobby-Name
            <input
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Anzahl Spieler (ohne Host)
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
                onClick={() => {
                  const next = clampPlayers(maxPlayers - 1);
                  setMaxPlayers(next);
                  setMaxPlayersInput(String(next));
                }}
                disabled={maxPlayers <= 1}
                aria-label="Spieleranzahl verringern"
                title="Verringern"
              >
                -
              </button>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-24 text-center px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
                value={maxPlayersInput}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/[^\d]/g, "");
                  setMaxPlayersInput(onlyDigits);
                }}
                onBlur={() => commitMaxPlayers(maxPlayersInput)}
                placeholder="1-12"
              />

              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
                onClick={() => {
                  const next = clampPlayers(maxPlayers + 1);
                  setMaxPlayers(next);
                  setMaxPlayersInput(String(next));
                }}
                disabled={maxPlayers >= 12}
                aria-label="Spieleranzahl erhoehen"
                title="Erhoehen"
              >
                +
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Dein Name (Host)
            <input
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            Quiz auswaehlen
            <select
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={quizId ?? ""}
              onChange={(e) => setQuizId(e.target.value)}
            >
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 font-semibold w-full"
            disabled={loading || !quizId}
            onClick={handleHost}
          >
            {loading ? "Lobby wird erstellt..." : "Hosten"}
          </button>

          {info && <p className="text-sm text-slate-300">{info}</p>}
        </div>
      </div>
    </div>
  );
}
