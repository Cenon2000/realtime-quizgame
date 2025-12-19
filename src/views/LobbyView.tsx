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

  const isHost = selfPlayer.is_host;

  const fetchPlayers = async () => {
    const { data, error } = await supabase
      .from("lobby_players")
      .select("*")
      .eq("lobby_id", lobby.id)
      // ✅ NEU: nur verbundene Spieler anzeigen/zählen
      .eq("is_connected", true)
      .order("turn_order", { ascending: true });

    if (error) {
      console.warn("fetchPlayers error:", error.message);
      return;
    }

    if (data) {
      setPlayers(data as LobbyPlayer[]);
    }
  };

  const fetchLobby = async () => {
    const { data, error } = await supabase
      .from("lobbies")
      .select("*")
      .eq("id", lobby.id)
      .single();

    if (error) {
      console.warn("fetchLobby error:", error.message);
      return;
    }

    if (data) setCurrentLobby(data as Lobby);
  };

  useEffect(() => {
    fetchPlayers();
    fetchLobby();

    const interval = setInterval(() => {
      fetchPlayers();
      fetchLobby();
    }, 1500);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id]);

  // ✅ nur "normale" UND verbundene Spieler zählen (ohne Host)
  const nonHostPlayers = players.filter((p) => !p.is_host);
  const playersJoined = nonHostPlayers.length;
  const maxPlayers = currentLobby.max_players;

  // wenn alle Spieler drin sind → Spiel automatisch starten (nur Host macht das)
  useEffect(() => {
    if (!isHost) return;
    if (currentLobby.status !== "waiting") return;

    if (playersJoined === maxPlayers && maxPlayers > 0) {
      supabase
        .from("lobbies")
        .update({ status: "running" })
        .eq("id", currentLobby.id);
    }
  }, [isHost, playersJoined, maxPlayers, currentLobby]);

  // wenn Lobby-Status auf running geht → in Game wechseln
  useEffect(() => {
    if (currentLobby.status === "running") {
      onGameStart(currentLobby, selfPlayer);
    }
  }, [currentLobby.status, onGameStart, selfPlayer, currentLobby]);

  const handleStart = async () => {
    if (!isHost) return;
    await supabase.from("lobbies").update({ status: "running" }).eq("id", lobby.id);
  };

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
          disabled={playersJoined !== maxPlayers || maxPlayers === 0}
          className="mt-4 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 font-semibold"
        >
          {playersJoined === maxPlayers && maxPlayers > 0
            ? "Spiel starten"
            : "Warte auf Spieler..."}
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
