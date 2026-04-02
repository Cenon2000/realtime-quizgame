import { useState } from "react";
import { supabase } from "../supabaseClient";
import type { Lobby, LobbyPlayer } from "../types";

type Props = {
  onBack: () => void;
  onLobbyReady: (lobby: Lobby, selfPlayer: LobbyPlayer) => void;
};

type LobbyPlayerLite = {
  id: string;
  is_host: boolean;
};

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

export default function JoinGamePage({ onBack, onLobbyReady }: Props) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const fetchConnectedPlayers = async (lobbyId: string) => {
    const connectedQuery = await supabase
      .from("lobby_players")
      .select("id, is_host")
      .eq("lobby_id", lobbyId)
      .eq("is_host", false)
      .eq("is_connected", true);

    if (!connectedQuery.error) {
      return {
        data: (connectedQuery.data as LobbyPlayerLite[] | null) ?? [],
        error: null,
      };
    }

    if (!isMissingColumnError(connectedQuery.error)) {
      return { data: [], error: connectedQuery.error };
    }

    const fallbackQuery = await supabase
      .from("lobby_players")
      .select("id, is_host")
      .eq("lobby_id", lobbyId)
      .eq("is_host", false);

    return {
      data: (fallbackQuery.data as LobbyPlayerLite[] | null) ?? [],
      error: fallbackQuery.error,
    };
  };

  const reconnectExistingPlayer = async (playerId: string, nextName: string) => {
    const fullUpdate = await supabase
      .from("lobby_players")
      .update({
        name: nextName,
        is_connected: true,
        last_seen: new Date().toISOString(),
      })
      .eq("id", playerId)
      .select()
      .single();

    if (!fullUpdate.error) return fullUpdate;
    if (!isMissingColumnError(fullUpdate.error)) return fullUpdate;

    return supabase
      .from("lobby_players")
      .update({
        name: nextName,
      })
      .eq("id", playerId)
      .select()
      .single();
  };

  const insertPlayer = async (
    lobbyId: string,
    nextName: string,
    turnOrder: number,
    userId: string | null
  ) => {
    const fullInsert = await supabase
      .from("lobby_players")
      .insert({
        lobby_id: lobbyId,
        name: nextName,
        is_host: false,
        turn_order: turnOrder,
        user_id: userId,
        is_connected: true,
        last_seen: new Date().toISOString(),
      })
      .select()
      .single();

    if (!fullInsert.error) return fullInsert;
    if (!isMissingColumnError(fullInsert.error)) return fullInsert;

    return supabase
      .from("lobby_players")
      .insert({
        lobby_id: lobbyId,
        name: nextName,
        is_host: false,
        turn_order: turnOrder,
        user_id: userId,
      })
      .select()
      .single();
  };

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
      const { data: lobby, error: lobbyError } = await supabase
        .from("lobbies")
        .select("*")
        .eq("join_code", joinCode.trim().toUpperCase())
        .limit(1)
        .maybeSingle();

      if (lobbyError || !lobby) {
        setInfo("Lobby nicht gefunden.");
        return;
      }

      if (lobby.status !== "waiting") {
        setInfo("Diese Lobby laeuft bereits oder ist beendet.");
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) console.warn("getUser Fehler:", userErr.message);
      const user = userData?.user ?? null;

      if (user) {
        const { data: asHost, error: asHostErr } = await supabase
          .from("lobby_players")
          .select("id")
          .eq("lobby_id", lobby.id)
          .eq("user_id", user.id)
          .eq("is_host", true)
          .limit(1)
          .maybeSingle();

        if (asHostErr) throw asHostErr;
        if (asHost) {
          setInfo(
            "Du bist in dieser Lobby bereits als Host eingeloggt. Bitte mit anderem Account oder im privaten Fenster beitreten."
          );
          return;
        }

        const { data: existing, error: existingErr } = await supabase
          .from("lobby_players")
          .select("*")
          .eq("lobby_id", lobby.id)
          .eq("user_id", user.id)
          .eq("is_host", false)
          .limit(1)
          .maybeSingle();

        if (existingErr) throw existingErr;

        if (existing) {
          const updatedResult = await reconnectExistingPlayer(existing.id, name.trim());
          if (updatedResult.error) throw updatedResult.error;
          onLobbyReady(
            lobby as Lobby,
            ((updatedResult.data ?? existing) as LobbyPlayer | null) as LobbyPlayer
          );
          return;
        }
      }

      const playersResult = await fetchConnectedPlayers(lobby.id);
      if (playersResult.error) throw playersResult.error;

      const realPlayers = (playersResult.data ?? []).filter((p) => !p.is_host);

      if (realPlayers.length >= lobby.max_players) {
        setInfo("Diese Lobby ist bereits voll.");
        return;
      }

      const turnOrder = realPlayers.length;
      const playerResult = await insertPlayer(
        lobby.id,
        name.trim(),
        turnOrder,
        user?.id ?? null
      );

      if (playerResult.error || !playerResult.data) throw playerResult.error;

      onLobbyReady(lobby as Lobby, playerResult.data as LobbyPlayer);
    } catch (err) {
      console.error(err);
      setInfo(`Fehler beim Beitreten: ${errorToMessage(err)}`);
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
          Zurueck
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
