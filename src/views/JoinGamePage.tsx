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
        return;
      }

      // ✅ User holen (kann null sein, wenn nicht eingeloggt)
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) console.warn("getUser Fehler:", userErr.message);
      const user = userData?.user ?? null;

      // ✅ REJOIN: wenn eingeloggt und Player existiert → reconnect statt neu anlegen
      if (user) {
        const { data: existing, error: existingErr } = await supabase
          .from("lobby_players")
          .select("*")
          .eq("lobby_id", lobby.id)
          .eq("user_id", user.id)
          .single();

        // Wenn es den Spieler gibt -> reconnect
        if (!existingErr && existing) {
          const { data: updated, error: updErr } = await supabase
            .from("lobby_players")
            .update({
              name: name.trim(),
              is_connected: true,
              last_seen: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();

          if (updErr) throw updErr;

          onLobbyReady(lobby as Lobby, (updated ?? existing) as LobbyPlayer);
          return;
        }
      }

      // Spieler in dieser Lobby laden – nur echte Spieler (ohne Host) UND nur connected
      const { data: players, error: playersError } = await supabase
        .from("lobby_players")
        .select("id, is_host")
        .eq("lobby_id", lobby.id)
        .eq("is_host", false)
        .eq("is_connected", true); // ✅ nur verbundene zählen

      if (playersError) {
        console.error(playersError);
        setInfo("Fehler beim Laden der Spieler.");
        return;
      }

      const realPlayers = (players ?? []).filter(
        (p: { id: string; is_host: boolean }) => !p.is_host
      );

      if (realPlayers.length >= lobby.max_players) {
        setInfo("Diese Lobby ist bereits voll.");
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
          user_id: user?.id ?? null, // Account verlinken wenn vorhanden
          is_connected: true,
          last_seen: new Date().toISOString(),
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
