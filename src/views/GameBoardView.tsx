import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import type {
  Lobby,
  LobbyPlayer,
  GameState,
  Quiz,
  QuizCategory,
  QuizQuestion,
} from "../types";

type Props = {
  lobby: Lobby;
  selfPlayer: LobbyPlayer;
};

export default function GameBoardView({ lobby, selfPlayer }: Props) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionUsage, setQuestionUsage] = useState<
    { question_id: string; used: boolean }[]
  >([]);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [buzzers, setBuzzers] = useState<LobbyPlayer[]>([]);
  const [isBuzzingAllowed, setIsBuzzingAllowed] = useState(false);

  const isHost = selfPlayer.is_host;

  // Daten laden
  useEffect(() => {
    const load = async () => {
      const [{ data: quizData }, { data: catData }, { data: questionData }] =
        await Promise.all([
          supabase.from("quizzes").select("*").eq("id", lobby.quiz_id).single(),
          supabase
            .from("quiz_categories")
            .select("*")
            .eq("quiz_id", lobby.quiz_id)
            .order("position", { ascending: true }),
          supabase
            .from("quiz_questions")
            .select("*")
            .in(
              "category_id",
              (
                await supabase
                  .from("quiz_categories")
                  .select("id")
                  .eq("quiz_id", lobby.quiz_id)
              ).data?.map((c) => c.id) ?? []
            ),
        ]);

      if (quizData) setQuiz(quizData as Quiz);
      if (catData) setCategories(catData as QuizCategory[]);
      if (questionData) setQuestions(questionData as QuizQuestion[]);

      const { data: usageData } = await supabase
        .from("question_status")
        .select("question_id, used")
        .eq("lobby_id", lobby.id);
      if (usageData) setQuestionUsage(usageData);

      const { data: playersData } = await supabase
        .from("lobby_players")
        .select("*")
        .eq("lobby_id", lobby.id)
        .order("turn_order", { ascending: true });

      if (playersData) setPlayers(playersData as LobbyPlayer[]);

      const { data: gsData } = await supabase
        .from("game_states")
        .select("*")
        .eq("lobby_id", lobby.id)
        .single();

      if (gsData) setGameState(gsData as GameState);
    };

    load();

    // Realtime Subscriptions
    const chGameState = supabase
      .channel(`game_states:${lobby.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_states",
          filter: `lobby_id=eq.${lobby.id}`,
        },
        (payload) => {
          setGameState(payload.new as GameState);
        }
      )
      .subscribe();

    const chPlayers = supabase
      .channel(`lobby_players_game:${lobby.id}`)
      .on(
        "postgres_changes"as any,
        {
          schema: "public",
          table: "lobby_players",
          filter: `lobby_id=eq.${lobby.id}`,
        }as any,
        (payload: any) => {
          setPlayers((prev) => {
            if (payload.eventType === "INSERT") {
              return [...prev, payload.new as LobbyPlayer].sort(
                (a, b) => a.turn_order - b.turn_order
              );
            }
            if (payload.eventType === "UPDATE") {
              return prev
                .map((p) =>
                  p.id === payload.new.id ? (payload.new as LobbyPlayer) : p
                )
                .sort((a, b) => a.turn_order - b.turn_order);
            }
            return prev;
          });
        }
      )
      .subscribe();

    const chUsage = supabase
      .channel(`question_status:${lobby.id}`)
      .on(
        "postgres_changes"as any,
        {
          schema: "public",
          table: "question_status",
          filter: `lobby_id=eq.${lobby.id}`,
        }as any,
        (payload: any) => {
          setQuestionUsage((prev) => {
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const newItem = {
                question_id: payload.new.question_id as string,
                used: payload.new.used as boolean,
              };
              const others = prev.filter(
                (p) => p.question_id !== newItem.question_id
              );
              return [...others, newItem];
            }
            return prev;
          });
        }
      )
      .subscribe();

    const chBuzzes = supabase
      .channel(`buzzes:${lobby.id}`)
      .on(
        "postgres_changes"as any,
        {
          schema: "public",
          table: "buzzes",
          filter: `lobby_id=eq.${lobby.id}`,
        }as any,
        async (payload: any) => {
          // Bei neuer Buzz-Zeile Liste der Buzzers neu laden
          if (payload.eventType === "INSERT") {
            const questionId = (payload.new as any).question_id;
            const { data: buzzData } = await supabase
              .from("buzzes")
              .select("player_id, created_at")
              .eq("lobby_id", lobby.id)
              .eq("question_id", questionId)
              .order("created_at", { ascending: true });
            if (!buzzData) return;
            const ids = buzzData.map((b) => b.player_id);
            const { data: buzzPlayers } = await supabase
              .from("lobby_players")
              .select("*")
              .in("id", ids);
            if (buzzPlayers) {
              // in der Reihenfolge aus buzzData sortieren
              const map = new Map(
                buzzPlayers.map((p) => [p.id, p] as [string, LobbyPlayer])
              );
              const ordered: LobbyPlayer[] = [];
              for (const b of buzzData) {
                const p = map.get(b.player_id);
                if (p) ordered.push(p as LobbyPlayer);
              }
              setBuzzers(ordered);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chGameState);
      supabase.removeChannel(chPlayers);
      supabase.removeChannel(chUsage);
      supabase.removeChannel(chBuzzes);
    };
  }, [lobby.id, lobby.quiz_id]);

  // Buzzer erlauben, wenn question_status === 'buzzing'
  useEffect(() => {
    if (!gameState) return;
    setIsBuzzingAllowed(gameState.question_status === "buzzing");
  }, [gameState]);

  const questionMap = useMemo(() => {
    const byCategory: Record<string, QuizQuestion[]> = {};
    for (const q of questions) {
      if (!byCategory[q.category_id]) byCategory[q.category_id] = [];
      byCategory[q.category_id].push(q);
    }
    return byCategory;
  }, [questions]);

  const usageMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const u of questionUsage) {
      map.set(u.question_id, u.used);
    }
    return map;
  }, [questionUsage]);

  const currentQuestion = useMemo(() => {
    if (!gameState?.current_question_id) return null;
    return questions.find((q) => q.id === gameState.current_question_id) ?? null;
  }, [gameState, questions]);

  const currentPlayer = useMemo(
    () => players.find((p) => p.id === gameState?.current_player_id),
    [players, gameState]
  );

  const activeAnsweringPlayer = useMemo(
    () => players.find((p) => p.id === gameState?.active_answering_player_id),
    [players, gameState]
  );

  const handleSelectQuestion = async (q: QuizQuestion) => {
    if (!isHost || !gameState) return;
    // Frage darf nur ausgewählt werden, wenn idle & nicht benutzt
    if (gameState.question_status !== "idle") return;
    if (usageMap.get(q.id)) return;

    await supabase.from("game_states").update({
      current_question_id: q.id,
      question_status: "answering",
      active_answering_player_id: gameState.current_player_id,
    }).eq("lobby_id", lobby.id);
  };

  const handleBuzz = async () => {
    if (!gameState || !gameState.current_question_id) return;
    // Host darf nicht buzzern, aktueller Spieler auch nicht
    if (selfPlayer.is_host) return;
    if (selfPlayer.id === gameState.current_player_id) return;
    if (!isBuzzingAllowed) return;

    await supabase.from("buzzes").insert({
      lobby_id: lobby.id,
      player_id: selfPlayer.id,
      question_id: gameState.current_question_id,
    });
  };

  const changeScore = async (playerId: string, delta: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    await supabase
      .from("lobby_players")
      .update({ score: player.score + delta })
      .eq("id", playerId);
  };

  const markQuestionUsed = async (questionId: string) => {
    const existing = questionUsage.find((u) => u.question_id === questionId);
    if (existing) {
      await supabase
        .from("question_status")
        .update({ used: true })
        .eq("id", (existing as any).id);
    } else {
      await supabase.from("question_status").insert({
        lobby_id: lobby.id,
        question_id: questionId,
        used: true,
      });
    }
  };

  const goToNextPlayer = async () => {
    if (!gameState) return;
    if (!players.length) return;
    const currentIndex = players.findIndex(
      (p) => p.id === gameState.current_player_id
    );
    const nextIndex = (currentIndex + 1) % players.length;
    await supabase
      .from("game_states")
      .update({
        current_player_id: players[nextIndex].id,
        current_question_id: null,
        active_answering_player_id: null,
        question_status: "idle",
      })
      .eq("lobby_id", lobby.id);
  };

  const handleHostCorrect = async () => {
    if (!isHost || !gameState || !currentQuestion) return;
    const points = currentQuestion.points;
    const targetPlayer =
      activeAnsweringPlayer ?? players.find((p) => p.id === gameState.current_player_id);
    if (!targetPlayer) return;

    await changeScore(targetPlayer.id, points);
    await markQuestionUsed(currentQuestion.id);
    // Buzzers leeren
    await supabase.from("buzzes").delete().eq("lobby_id", lobby.id);
    setBuzzers([]);
    await goToNextPlayer();
  };

  const handleHostWrong = async () => {
    if (!isHost || !gameState || !currentQuestion) return;
    const half = Math.floor(currentQuestion.points / 2);
    const targetPlayer =
      activeAnsweringPlayer ?? players.find((p) => p.id === gameState.current_player_id);
    if (!targetPlayer) return;

    // Punkte abziehen
    await changeScore(targetPlayer.id, -half);

    if (gameState.question_status === "answering") {
      // Nun Buzz-Phase starten
      await supabase
        .from("game_states")
        .update({ question_status: "buzzing", active_answering_player_id: null })
        .eq("lobby_id", lobby.id);

      // Buzzers werden über Realtime gesammelt, Timer kannst du im Frontend einbauen (z.B. useEffect mit setTimeout)
      // Hier vereinfachen wir und überlassen dem Host die Kontrolle
    } else if (gameState.question_status === "buzzing") {
      // Nächster Buzzer oder Frage beenden
      if (buzzers.length > 1) {
        const [, ...rest] = buzzers;
        setBuzzers(rest);
        await supabase
          .from("game_states")
          .update({
            active_answering_player_id: rest[0]?.id ?? null,
            question_status: rest[0] ? "answering" : "resolved",
          })
          .eq("lobby_id", lobby.id);
      } else {
        await markQuestionUsed(currentQuestion.id);
        await supabase.from("buzzes").delete().eq("lobby_id", lobby.id);
        setBuzzers([]);
        await goToNextPlayer();
      }
    }
  };

  const handleHostSelectBuzzer = async (player: LobbyPlayer) => {
    if (!isHost || !gameState) return;
    await supabase
      .from("game_states")
      .update({
        active_answering_player_id: player.id,
        question_status: "answering",
      })
      .eq("lobby_id", lobby.id);
  };

  const gridCategories = categories.slice(0, 6); // wie gefordert

  return (
    <div className="flex flex-col gap-4 h-[80vh]">
      {/* Titel */}
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold">
          {quiz?.name ?? "Quiz"}
        </h2>
        <p className="text-xs text-slate-400">
          Lobby: {lobby.name} • Du bist {selfPlayer.name}
          {selfPlayer.is_host ? " (Host)" : ""}
        </p>
      </div>

      {/* Board + Fragebereich */}
      <div className="flex-1 flex flex-col md:flex-row gap-4">
        {/* Board */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="grid grid-cols-6 gap-2 w-full max-w-3xl">
            {gridCategories.map((cat) => (
              <div key={cat.id} className="flex flex-col gap-2">
                <div className="text-center text-xs md:text-sm font-semibold truncate">
                  {cat.name}
                </div>
                { [100, 200, 300, 500].map((pts) => {
                  const q = questionMap[cat.id]?.find((qq) => qq.points === pts);
                  if (!q) return (
                    <div key={pts} className="h-12 md:h-16" />
                  );
                  const used = usageMap.get(q.id);
                  return (
                    <button
                      key={q.id}
                      disabled={used || !isHost || gameState?.question_status !== "idle"}
                      onClick={() => handleSelectQuestion(q)}
                      className={`h-10 md:h-16 rounded-lg text-sm md:text-lg font-bold border border-slate-700 flex items-center justify-center
                        ${
                          used
                            ? "bg-slate-800 text-slate-500 line-through"
                            : "bg-indigo-500 hover:bg-indigo-600 text-white"
                        }
                        ${!isHost ? "cursor-default" : ""}
                      `}
                    >
                      {pts}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Frage / Host Panel */}
        <div className="w-full md:w-80 bg-slate-900/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
          <div className="text-sm text-slate-400">
            Aktueller Spieler:{" "}
            <span
              className={`font-semibold ${
                currentPlayer?.id === selfPlayer.id ? "text-emerald-400" : ""
              }`}
            >
              {currentPlayer?.name ?? "-"}
            </span>
          </div>

          <div className="flex-1 border border-slate-700 rounded-xl p-3 bg-slate-900/80 overflow-auto">
            {currentQuestion ? (
              <>
                <div className="text-xs text-slate-400 mb-1">
                  Frage für {currentQuestion.points} Punkte
                </div>
                <div className="text-sm md:text-base font-semibold">
                  {currentQuestion.question}
                </div>
                {isHost && (
                  <div className="mt-3 text-xs text-emerald-300">
                    Antwort (nur Host):{" "}
                    <span className="font-mono">{currentQuestion.answer}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-slate-500 text-center">
                Host wählt eine Frage aus dem Board.
              </div>
            )}
          </div>

          {/* Host Controls */}
          {isHost && currentQuestion && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={handleHostCorrect}
                  className="flex-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-semibold"
                >
                  Richtig
                </button>
                <button
                  onClick={handleHostWrong}
                  className="flex-1 px-3 py-2 bg-rose-500 hover:bg-rose-600 rounded-lg text-sm font-semibold"
                >
                  Falsch
                </button>
              </div>

              {(gameState?.question_status === "buzzing" ||
                buzzers.length > 0) && (
                <div className="border border-slate-700 rounded-lg p-2 text-xs space-y-1">
                  <div className="font-semibold text-slate-100 mb-1">
                    Buzzer-Reihenfolge
                  </div>
                  {buzzers.length === 0 && (
                    <div className="text-slate-400">Noch niemand gebuzzert.</div>
                  )}
                  {buzzers.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => handleHostSelectBuzzer(p)}
                      className="w-full flex items-center justify-between px-2 py-1 rounded-md hover:bg-slate-800"
                    >
                      <span>
                        #{i + 1} {p.name}
                      </span>
                      {gameState?.active_answering_player_id === p.id && (
                        <span className="text-emerald-400 text-[10px]">
                          am Zug
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Buzzer für Spieler */}
          {!isHost && currentQuestion && (
            <button
              onClick={handleBuzz}
              disabled={!isBuzzingAllowed}
              className={`mt-2 px-4 py-2 rounded-xl font-semibold text-sm ${
                isBuzzingAllowed
                  ? "bg-amber-400 hover:bg-amber-500 text-slate-900 animate-pulse"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {isBuzzingAllowed ? "BUZZERN!" : "Buzzer (noch gesperrt)"}
            </button>
          )}
        </div>
      </div>

      {/* Spielerleiste unten */}
      <div className="mt-2 flex gap-2 flex-wrap justify-center">
        {players.map((p) => {
          const isActive = p.id === gameState?.current_player_id;
          const hasBuzzed = buzzers.some((b) => b.id === p.id);
          const isSelf = p.id === selfPlayer.id;
          return (
            <div
              key={p.id}
              className={`px-3 py-2 rounded-xl flex items-center gap-2 border ${
                isActive
                  ? "border-emerald-400 bg-slate-800"
                  : "border-slate-700 bg-slate-900"
              } ${isSelf ? "ring-1 ring-indigo-400" : ""}`}
            >
              <div className="flex flex-col">
                <span className="text-xs uppercase text-slate-400">
                  {p.is_host ? "Host" : "Spieler"}
                </span>
                <span className="text-sm font-semibold truncate max-w-[90px]">
                  {p.name}
                </span>
              </div>
              <div className="text-sm font-mono">
                {p.score} <span className="text-xs text-slate-400">Pkte</span>
              </div>
              {hasBuzzed && (
                <div className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
