import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import type { Lobby, LobbyPlayer } from "../types";

type Props = {
  lobby: Lobby;
  selfPlayer: LobbyPlayer;
  onGameStart: (lobby: Lobby, selfPlayer: LobbyPlayer) => void;
};

export default function LobbyView({ lobby, selfPlayer, onGameStart }: Props) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [currentLobby, setCurrentLobby] = useState<Lobby>(lobby);

  useEffect(() => {
    // Initial laden
    supabase
      .from("lobby_players")
      .select("*")
      .eq("lobby_id", lobby.id)
      .order("turn_order", { ascending: true })
      .then(({ data }) => {
        if (data) setPlayers(data as LobbyPlayer[]);
      });

    // Realtime: neue Spieler
    const subPlayers = supabase
      .channel(`lobby_players:${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lobby_players", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => {
          setPlayers((prev) => {
            if (payload.eventType === "INSERT") {
              return [...prev, payload.new as LobbyPlayer].sort(
                (a, b) => a.turn_order - b.turn_order
              );
            }
            if (payload.eventType === "UPDATE") {
              return prev
                .map((p) => (p.id === payload.new.id ? (payload.new as LobbyPlayer) : p))
                .sort((a, b) => a.turn_order - b.turn_order);
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((p) => p.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    // Realtime: Lobby Status (z.B. wenn Auto-Start)
    const subLobby = supabase
      .channel(`lobbies:${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobby.id}` },
        (payload) => {
          const updated = payload.new as Lobby;
          setCurrentLobby(updated);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subPlayers);
      supabase.removeChannel(subLobby);
    };
  }, [lobby.id]);

  useEffect(() => {
    // Auto-Start: wenn status auf "running" geht → Game
    if (currentLobby.status === "running") {
      onGameStart(currentLobby, selfPlayer);
    }
  }, [currentLobby.status, onGameStart, selfPlayer]);

  const isHost = selfPlayer.is_host;

  const handleStart = async () => {
    if (!isHost) return;
    await supabase
      .from("lobbies")
      .update({ status: "running" })
      .eq("id", lobby.id);
  };

  const playersJoined = players.length;
  const maxPlayers = currentLobby.max_players;

  return (
    <div className="flex flex-col gap-4 items-center">
      <h2 className="text-2xl font-semibold text-center">
        Lobby: {currentLobby.name}
      </h2>
      <p className="text-sm text-slate-300">
        Beitrittscode:{" "}
        <span className="font-mono tracking-[0.25em] bg-slate-900 px-3 py-1 rounded-lg">
          {currentLobby.join_code}
        </span>
      </p>

      <p className="text-sm text-slate-300">
        Spieler: {playersJoined} / {maxPlayers}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-3/4">
        {players.map((p) => (
          <div
            key={p.id}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex items-center justify-between"
          >
            <span className="font-semibold truncate">{p.name}</span>
            <span className="text-xs text-slate-400">
              {p.is_host ? "Host" : `Spieler ${p.turn_order + 1}`}
            </span>
          </div>
        ))}
      </div>

      {isHost && (
        <button
          onClick={handleStart}
          disabled={playersJoined < 2 || playersJoined < maxPlayers}
          className="mt-4 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 font-semibold"
        >
          {playersJoined < maxPlayers
            ? "Warten auf weitere Spieler..."
            : "Spiel starten"}
        </button>
      )}

      {!isHost && (
        <p className="text-xs text-slate-400 mt-4">
          Warte darauf, dass der Host das Spiel startet.
        </p>
      )}
    </div>
  );
}
