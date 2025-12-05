import { useState } from "react";
import { supabase } from "../supabaseClient";
import type { Lobby, LobbyPlayer } from "../types";

type Props = {
  onBack: () => void;
  onLobbyReady: (lobby: Lobby, selfPlayer: LobbyPlayer) => void;
};

export default function JoinGamePage({ onBack, onLobbyReady }: Props) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!name.trim()) {
      setInfo("Bitte einen Namen eingeben.");
      return;
    }
    if (!joinCode.trim()) {
      setInfo("Bitte einen Beitrittscode eingeben.");
      return;
    }

    setLoading(true);
    setInfo(null);

    try {
      // Lobby über Join-Code finden
      const { data: lobby, error: lobbyError } = await supabase
        .from("lobbies")
        .select("*")
        .eq("join_code", joinCode.trim().toUpperCase())
        .single();

      if (lobbyError || !lobby) {
        setInfo("Lobby nicht gefunden.");
        setLoading(false);
        return;
      }

      // Spieler in dieser Lobby laden – nur echte Spieler (ohne Host)
      const { data: players, error: playersError } = await supabase
        .from("lobby_players")
        .select("id, is_host")
        .eq("lobby_id", lobby.id)
        .eq("is_host", false); // Host NICHT mitzählen

      if (playersError) {
        console.error(playersError);
        setInfo("Fehler beim Laden der Spieler.");
        setLoading(false);
        return;
      }

      // Nur Spieler (ohne Host)
      const realPlayers = (players ?? []).filter(
        (p: { id: string; is_host: boolean }) => !p.is_host
      );

      if (realPlayers.length >= lobby.max_players) {
        setInfo("Diese Lobby ist bereits voll.");
        setLoading(false);
        return;
      }

      // turn_order basiert nur auf Anzahl der echten Spieler
      const turnOrder = realPlayers.length;

      // Neuen Spieler eintragen
      const { data: player, error: playerError } = await supabase
        .from("lobby_players")
        .insert({
          lobby_id: lobby.id,
          name: name.trim(),
          is_host: false,
          turn_order: turnOrder,
        })
        .select()
        .single();

      if (playerError || !player) throw playerError;

      onLobbyReady(lobby as Lobby, player as LobbyPlayer);
    } catch (err) {
      console.error(err);
      setInfo("Fehler beim Beitreten.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Spiel beitreten</h2>
        <button
          className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          onClick={onBack}
        >
          Zurück
        </button>
      </div>

      <div className="space-y-3 max-w-md">
        <label className="flex flex-col gap-1 text-sm">
          Dein Ingame-Name
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Beitrittscode
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 uppercase tracking-[0.25em]"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
        </label>

        <button
          className="mt-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 font-semibold w-full"
          disabled={loading}
          onClick={handleJoin}
        >
          {loading ? "Beitritt..." : "Beitreten"}
        </button>

        {info && <p className="text-sm text-slate-300">{info}</p>}
      </div>
    </div>
  );
}
