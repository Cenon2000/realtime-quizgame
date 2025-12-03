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

export default function HostGamePage({ onBack, onLobbyReady }: Props) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [lobbyName, setLobbyName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(3);
  const [hostName, setHostName] = useState("Host");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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
      setInfo("Bitte ein Quiz auswählen.");
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

      const { data: playerData, error: playerError } = await supabase
        .from("lobby_players")
        .insert({
          lobby_id: lobbyData.id,
          name: hostName.trim(),
          is_host: true,
          score: 0,
          turn_order: 0,
        })
        .select()
        .single();

      if (playerError || !playerData) throw playerError;

      // Game State initialisieren
      const { error: gsError } = await supabase.from("game_states").insert({
        lobby_id: lobbyData.id,
        current_player_id: playerData.id,
        question_status: "idle",
        active_answering_player_id: null,
        current_question_id: null,
      });

      if (gsError) throw gsError;

      onLobbyReady(lobbyData as Lobby, playerData as LobbyPlayer);
    } catch (err) {
      console.error(err);
      setInfo("Fehler beim Erstellen der Lobby.");
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
          Zurück
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
            Dein Name (Host)
            <input
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Maximale Spieler
            <input
              type="number"
              min={2}
              max={12}
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value) || 2)}
            />
          </label>
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            Quiz auswählen
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
