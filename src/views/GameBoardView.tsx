import { useEffect, useMemo, useState, useRef } from "react";
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

type QuestionStatusRow = {
  id: string;
  lobby_id: string;
  question_id: string;
  used: boolean;
};

function CategoryTitle({ name }: { name: string }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [state, setState] = useState<{ tx: number; transition: string }>({
    tx: 0,
    transition: "none",
  });

  const stopScroll = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setState({ tx: 0, transition: "none" });
  };

  const startScroll = () => {
    stopScroll();

    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const outerWidth = outer.offsetWidth;
    const innerWidth = inner.scrollWidth;
    const overflow = innerWidth - outerWidth;

    if (overflow <= 0) return;

    const SPEED = 60; // Pixel pro Sekunde
    const duration = overflow / SPEED;

    setState({ tx: 0, transition: "none" });

    requestAnimationFrame(() => {
      setState({
        tx: -overflow,
        transition: `transform ${duration}s linear`,
      });
    });

    timeoutRef.current = window.setTimeout(() => {
      stopScroll();
    }, duration * 1000);
  };

  return (
    <div
      ref={outerRef}
      className="
        border border-amber-400 
        bg-slate-800/70
        rounded-lg
        py-1
        px-2
        shadow-sm
        text-center text-xs md:text-sm font-semibold
        overflow-hidden
        cursor-default
      "
      onMouseEnter={startScroll}
      onMouseLeave={stopScroll}
      onTouchStart={startScroll}
    >
      <span
        ref={innerRef}
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          transform: `translateX(${state.tx}px)`,
          transition: state.transition,
        }}
      >
        {name}
      </span>
    </div>
  );
}

export default function GameBoardView({ lobby, selfPlayer }: Props) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionUsage, setQuestionUsage] = useState<QuestionStatusRow[]>([]);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [buzzers, setBuzzers] = useState<LobbyPlayer[]>([]);
  const [isBuzzingAllowed, setIsBuzzingAllowed] = useState(false);
  const [buzzTimeLeft, setBuzzTimeLeft] = useState(0);

  const [justBuzzed, setJustBuzzed] = useState(false);
  const [hasBuzzedThisQuestion, setHasBuzzedThisQuestion] = useState(false);

  const [leaving, setLeaving] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);

  const [isGameOver, setIsGameOver] = useState(false);
  const [topPlayers, setTopPlayers] = useState<LobbyPlayer[]>([]);

  const isHost = selfPlayer.is_host;

  // ✅ aktives Board IMMER über current_board (Fallback: board)
  const activeBoard: 1 | 2 =
    (((gameState as any)?.current_board ?? (gameState as any)?.board ?? 1) === 2
      ? 2
      : 1);

  const pointsMultiplier = activeBoard === 2 ? 2 : 1;

  const getQuestionImageUrl = (imagePath?: string | null) => {
    if (!imagePath) return null;
    const { data } = supabase.storage
      .from("question-images")
      .getPublicUrl(imagePath);
    return data.publicUrl;
  };

  // 1) Quiz, Kategorien, Fragen laden
  useEffect(() => {
    const loadStaticData = async () => {
      const { data: quizData } = await supabase
        .from("quizzes")
        .select("*")
        .eq("id", lobby.quiz_id)
        .single();
      if (quizData) setQuiz(quizData as Quiz);

      const { data: catData } = await supabase
        .from("quiz_categories")
        .select("*")
        .eq("quiz_id", lobby.quiz_id)
        .order("position", { ascending: true });

      const cats = (catData ?? []) as any as QuizCategory[];
      setCategories(cats);

      const categoryIds = (cats as any[]).map((c) => c.id);
      if (categoryIds.length) {
        const { data: questionData } = await supabase
          .from("quiz_questions")
          .select("*")
          .in("category_id", categoryIds);

        if (questionData) setQuestions(questionData as any as QuizQuestion[]);
      }
    };

    loadStaticData();
  }, [lobby.quiz_id]);

  // 2) Polling
  useEffect(() => {
    let active = true;

    const poll = async () => {
      if (!active) return;

      const { data: lobbyRow, error: lobbyError } = await supabase
        .from("lobbies")
        .select("id")
        .eq("id", lobby.id)
        .single();

      if (!active) return;

      if (lobbyError) {
        console.warn("Lobby-Check Fehler:", lobbyError.message);
        return;
      }

      if (!lobbyRow) {
        window.location.href = "/";
        return;
      }

      const { data: gsData } = await supabase
        .from("game_states")
        .select("*")
        .eq("lobby_id", lobby.id)
        .single();

      if (!active) return;

      if (gsData) {
        setGameState(gsData as any as GameState);
      } else if (isHost) {
        // ✅ bei dir existieren current_board UND board → setze beide
        await supabase.from("game_states").insert({
          lobby_id: lobby.id,
          current_player_id: null,
          current_question_id: null,
          question_status: "idle",
          active_answering_player_id: null,
          current_board: 1,
          board: 1,
        });
      }

      const { data: playersData } = await supabase
        .from("lobby_players")
        .select("*")
        .eq("lobby_id", lobby.id);

      if (!active) return;

      if (playersData) {
        const sorted = (playersData as LobbyPlayer[]).sort(
          (a, b) => a.turn_order - b.turn_order
        );
        setPlayers(sorted);
      }

      const { data: usageData } = await supabase
        .from("question_status")
        .select("*")
        .eq("lobby_id", lobby.id);

      if (!active) return;
      if (usageData) setQuestionUsage(usageData as QuestionStatusRow[]);

      if ((gsData as any)?.current_question_id) {
        const { data: buzzData } = await supabase
          .from("buzzes")
          .select("player_id, created_at")
          .eq("lobby_id", lobby.id)
          .eq("question_id", (gsData as any).current_question_id)
          .order("created_at", { ascending: true });

        if (!active) return;

        if (buzzData && buzzData.length > 0) {
          const ids = buzzData.map((b) => b.player_id);
          const { data: buzzPlayers } = await supabase
            .from("lobby_players")
            .select("*")
            .in("id", ids);

          if (!active) return;

          if (buzzPlayers) {
            const map = new Map(
              (buzzPlayers as LobbyPlayer[]).map((p) => [p.id, p] as const)
            );
            const ordered: LobbyPlayer[] = [];
            for (const b of buzzData) {
              const p = map.get(b.player_id);
              if (p) ordered.push(p);
            }
            setBuzzers(ordered);
          }
        } else {
          setBuzzers([]);
        }
      } else {
        setBuzzers([]);
      }
    };

    poll();
    const id = setInterval(poll, 1000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [lobby.id, isHost]);

  // 3) Timer fürs Buzzern (UI)
  useEffect(() => {
    let intervalId: number | undefined;

    if (
      gameState &&
      (gameState as any).question_status === "buzzing" &&
      (gameState as any).current_question_id
    ) {
      setIsBuzzingAllowed(true);
      setBuzzTimeLeft(10);

      const start = Date.now();

      intervalId = window.setInterval(async () => {
        const elapsed = (Date.now() - start) / 1000;
        const remaining = 10 - elapsed;

        if (remaining <= 0) {
          window.clearInterval(intervalId);
          setBuzzTimeLeft(0);
          setIsBuzzingAllowed(false);

          if (buzzers.length === 0 && currentQuestion && isHost) {
            await markQuestionUsed((currentQuestion as any).id);

            await supabase
              .from("game_states")
              .update({
                current_question_id: null,
                active_answering_player_id: null,
                question_status: "idle",
              })
              .eq("lobby_id", lobby.id);

            setGameState((prev) =>
              prev
                ? ({
                    ...(prev as any),
                    current_question_id: null,
                    active_answering_player_id: null,
                    question_status: "idle",
                  } as any)
                : prev
            );

            await goToNextPlayer();
          }
        } else {
          setBuzzTimeLeft(remaining);
        }
      }, 100);
    } else {
      setIsBuzzingAllowed(false);
      setBuzzTimeLeft(0);
    }

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    (gameState as any)?.question_status,
    (gameState as any)?.current_question_id,
    buzzers.length,
    isHost,
  ]);

  // 4) Host setzt ersten Spieler (ohne Host) als current_player
  useEffect(() => {
    if (!isHost) return;
    if (!gameState) return;
    if ((gameState as any).current_player_id) return;

    const nonHostPlayers = players
      .filter((p) => !p.is_host)
      .sort((a, b) => a.turn_order - b.turn_order);

    if (!nonHostPlayers.length) return;

    supabase
      .from("game_states")
      .update({ current_player_id: nonHostPlayers[0].id })
      .eq("lobby_id", lobby.id);
  }, [isHost, gameState, players, lobby.id]);

  // 5) Lokalen Buzz-Status resetten, wenn Frage wechselt
  useEffect(() => {
    setHasBuzzedThisQuestion(false);
    setJustBuzzed(false);
  }, [(gameState as any)?.current_question_id]);

  // ========= Board-Filter (über quiz_categories.board) =========

  const boardCategories = useMemo(() => {
    return (categories as any[]).filter((c) => (c.board ?? 1) === activeBoard);
  }, [categories, activeBoard]);

  const boardCategoryIds = useMemo(() => {
    return new Set(boardCategories.map((c: any) => c.id));
  }, [boardCategories]);

  const boardQuestions = useMemo(() => {
    return (questions as any[]).filter((q) => boardCategoryIds.has(q.category_id));
  }, [questions, boardCategoryIds]);

  const questionMap = useMemo(() => {
    const byCategory: Record<string, any[]> = {};
    for (const q of boardQuestions) {
      if (!byCategory[q.category_id]) byCategory[q.category_id] = [];
      byCategory[q.category_id].push(q);
    }
    return byCategory;
  }, [boardQuestions]);

  const usageMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const u of questionUsage) map.set(u.question_id, u.used);
    return map;
  }, [questionUsage]);

  const nonHostPlayersOrdered = useMemo(() => {
    return players
      .filter((p) => !p.is_host)
      .sort((a, b) => a.turn_order - b.turn_order);
  }, [players]);

  const host = players.find((p) => p.is_host) || null;

  const currentPlayer = useMemo(() => {
    if ((gameState as any)?.current_player_id) {
      const found = players.find((p) => p.id === (gameState as any).current_player_id);
      if (found) return found;
    }
    return nonHostPlayersOrdered[0] ?? undefined;
  }, [players, gameState, nonHostPlayersOrdered]);

  const currentQuestion = useMemo(() => {
    if (!(gameState as any)?.current_question_id) return null;
    return (questions as any[]).find((q) => q.id === (gameState as any).current_question_id) ?? null;
  }, [gameState, questions]);

  const activeAnsweringPlayer = useMemo(() => {
    return players.find((p) => p.id === (gameState as any)?.active_answering_player_id);
  }, [players, gameState]);

  // ========= Board-Wechsel + GameOver =========
  useEffect(() => {
    if (!questions.length) return;

    const run = async () => {
      const usedSet = new Set(
        questionUsage.filter((u) => u.used).map((u) => u.question_id)
      );

      const board1CatIds = new Set(
        (categories as any[])
          .filter((c) => (c.board ?? 1) === 1)
          .map((c) => c.id)
      );
      const board2CatIds = new Set(
        (categories as any[])
          .filter((c) => (c.board ?? 1) === 2)
          .map((c) => c.id)
      );

      const board1QuestionsAll = (questions as any[]).filter((q) =>
        board1CatIds.has(q.category_id)
      );
      const board2QuestionsAll = (questions as any[]).filter((q) =>
        board2CatIds.has(q.category_id)
      );

      const board1AllUsed =
        board1QuestionsAll.length > 0 &&
        board1QuestionsAll.every((q) => usedSet.has(q.id));

      const board2AllUsed =
        board2QuestionsAll.length > 0 &&
        board2QuestionsAll.every((q) => usedSet.has(q.id));

      const currentBoard: 1 | 2 =
        (((gameState as any)?.current_board ?? (gameState as any)?.board ?? 1) === 2
          ? 2
          : 1);

      // ✅ Wechsel: Board 1 fertig -> Board 2 starten
      if (board1AllUsed && board2QuestionsAll.length > 0 && currentBoard === 1) {
        setIsGameOver(false);

        if (isHost) {
          await supabase.from("buzzes").delete().eq("lobby_id", lobby.id);

          // ✅ setze BEIDE Felder, weil du current_board + board hast
          await supabase
            .from("game_states")
            .update({
              current_board: 2,
              board: 2,
              current_question_id: null,
              active_answering_player_id: null,
              question_status: "idle",
            })
            .eq("lobby_id", lobby.id);

          setGameState((prev) =>
            prev
              ? ({
                  ...(prev as any),
                  current_board: 2,
                  board: 2,
                  current_question_id: null,
                  active_answering_player_id: null,
                  question_status: "idle",
                } as any)
              : prev
          );
        }

        return; // ⛔ kein GameOver anzeigen
      }

      // ✅ echtes GameOver:
      const gameOver =
        (board2QuestionsAll.length === 0 && board1AllUsed) ||
        (board2QuestionsAll.length > 0 && board2AllUsed);

      if (!gameOver) {
        setIsGameOver(false);
        return;
      }

      const nonHost = players.filter((p) => !p.is_host);
      const sorted = [...nonHost].sort((a, b) => b.score - a.score);
      setTopPlayers(sorted.slice(0, 3));
      setIsGameOver(true);

      if (isHost && sorted.length > 0) {
        const bestScore = sorted[0]?.score ?? 0;
        const rows = sorted
          .filter((p) => (p as any).user_id)
          .map((p) => ({
            user_id: (p as any).user_id as string,
            lobby_id: lobby.id,
            final_score: p.score,
            is_winner: p.score === bestScore,
          }));

        if (rows.length) {
          await supabase.from("game_results").insert(rows);
        }
      }
    };

    run();
  }, [questions, categories, questionUsage, players, isHost, lobby.id, gameState]);

  // ========= Spiel-Logik =========

  const markQuestionUsed = async (questionId: string) => {
    const existing = questionUsage.find((u) => u.question_id === questionId);
    if (existing) {
      await supabase.from("question_status").update({ used: true }).eq("id", existing.id);
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
    if (!nonHostPlayersOrdered.length) return;

    const currentId =
      (gameState as any).current_player_id ?? nonHostPlayersOrdered[0].id;

    const currentIndex = nonHostPlayersOrdered.findIndex((p) => p.id === currentId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % nonHostPlayersOrdered.length;
    const nextPlayerId = nonHostPlayersOrdered[nextIndex].id;

    const { error } = await supabase
      .from("game_states")
      .update({
        current_player_id: nextPlayerId,
        current_question_id: null,
        active_answering_player_id: null,
        question_status: "idle",
      })
      .eq("lobby_id", lobby.id);

    if (!error) {
      setGameState((prev) =>
        prev
          ? ({
              ...(prev as any),
              current_player_id: nextPlayerId,
              current_question_id: null,
              active_answering_player_id: null,
              question_status: "idle",
            } as any)
          : prev
      );
    }
  };

  const changeScore = async (playerId: string, delta: number) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    await supabase
      .from("lobby_players")
      .update({ score: player.score + delta })
      .eq("id", playerId);
  };

  const logAnswerEvent = async (
    player: LobbyPlayer,
    isCorrect: boolean,
    pointsChange: number,
    questionId: string
  ) => {
    if (!(player as any).user_id) return;
    await supabase.from("answer_logs").insert({
      user_id: (player as any).user_id,
      lobby_id: lobby.id,
      question_id: questionId,
      is_correct: isCorrect,
      points_change: pointsChange,
    });
  };

  const handleSelectQuestion = async (q: any) => {
    if (!isHost) return;
    if (!gameState) return;

    const used = usageMap.get(q.id);
    if (used) return;

    const currentPlayerId =
      (gameState as any).current_player_id ?? nonHostPlayersOrdered[0]?.id ?? null;
    if (!currentPlayerId) return;

    const { error } = await supabase
      .from("game_states")
      .update({
        current_player_id: currentPlayerId,
        current_question_id: q.id,
        question_status: "answering",
        active_answering_player_id: currentPlayerId,
      })
      .eq("lobby_id", lobby.id);

    if (!error) {
      setGameState((prev) =>
        prev
          ? ({
              ...(prev as any),
              current_player_id: currentPlayerId,
              current_question_id: q.id,
              question_status: "answering",
              active_answering_player_id: currentPlayerId,
            } as any)
          : prev
      );
    }
  };

  const handleBuzz = async () => {
    if (!gameState || !(gameState as any).current_question_id) return;
    if (selfPlayer.is_host) return;
    if (!isBuzzingAllowed) return;

    if (currentPlayer && selfPlayer.id === currentPlayer.id) return;
    if (hasBuzzedThisQuestion) return;

    setHasBuzzedThisQuestion(true);
    setJustBuzzed(true);
    window.setTimeout(() => setJustBuzzed(false), 400);

    await supabase.from("buzzes").insert({
      lobby_id: lobby.id,
      player_id: selfPlayer.id,
      question_id: (gameState as any).current_question_id,
    });
  };

  const handleHostCorrect = async () => {
    if (!isHost || !gameState || !currentQuestion) return;

    const basePoints = (currentQuestion as any).points ?? 0;
    const points = basePoints * pointsMultiplier;

    const targetPlayer = activeAnsweringPlayer ?? currentPlayer;
    if (!targetPlayer) return;

    await changeScore(targetPlayer.id, points);
    await markQuestionUsed((currentQuestion as any).id);
    await supabase.from("buzzes").delete().eq("lobby_id", lobby.id);
    setBuzzers([]);
    await logAnswerEvent(targetPlayer, true, points, (currentQuestion as any).id);
    await goToNextPlayer();
  };

  const handleHostWrong = async () => {
    if (!isHost || !gameState || !currentQuestion) return;

    const basePoints = (currentQuestion as any).points ?? 0;
    const points = basePoints * pointsMultiplier;
    const half = Math.floor(points / 2);

    const targetPlayer = activeAnsweringPlayer ?? currentPlayer;
    if (!targetPlayer) return;

    await changeScore(targetPlayer.id, -half);
    await logAnswerEvent(targetPlayer, false, -half, (currentQuestion as any).id);

    if ((gameState as any).question_status === "answering") {
      const { error } = await supabase
        .from("game_states")
        .update({
          question_status: "buzzing",
          active_answering_player_id: null,
        })
        .eq("lobby_id", lobby.id);

      if (!error) {
        setGameState((prev) =>
          prev
            ? ({
                ...(prev as any),
                question_status: "buzzing",
                active_answering_player_id: null,
              } as any)
            : prev
        );
      }
    } else if ((gameState as any).question_status === "buzzing") {
      const remaining = buzzers.filter((b) => b.id !== targetPlayer.id);
      setBuzzers(remaining);

      await supabase
        .from("buzzes")
        .delete()
        .eq("lobby_id", lobby.id)
        .eq("player_id", targetPlayer.id);

      if (remaining.length === 0) {
        await markQuestionUsed((currentQuestion as any).id);

        await supabase
          .from("game_states")
          .update({
            current_question_id: null,
            active_answering_player_id: null,
            question_status: "idle",
          })
          .eq("lobby_id", lobby.id);

        setGameState((prev) =>
          prev
            ? ({
                ...(prev as any),
                current_question_id: null,
                active_answering_player_id: null,
                question_status: "idle",
              } as any)
            : prev
        );

        await goToNextPlayer();
        return;
      }

      const next = remaining[0];

      await supabase
        .from("game_states")
        .update({
          active_answering_player_id: next.id,
          question_status: "answering",
        })
        .eq("lobby_id", lobby.id);

      setGameState((prev) =>
        prev
          ? ({
              ...(prev as any),
              active_answering_player_id: next.id,
              question_status: "answering",
            } as any)
          : prev
      );
    }
  };

  const handleHostSkipQuestion = async () => {
    if (!isHost || !gameState || !currentQuestion) return;

    await markQuestionUsed((currentQuestion as any).id);

    await supabase
      .from("buzzes")
      .delete()
      .eq("lobby_id", lobby.id)
      .eq("question_id", (currentQuestion as any).id);

    setBuzzers([]);

    const { error } = await supabase
      .from("game_states")
      .update({
        current_question_id: null,
        active_answering_player_id: null,
        question_status: "idle",
      })
      .eq("lobby_id", lobby.id);

    if (!error) {
      setGameState((prev) =>
        prev
          ? ({
              ...(prev as any),
              current_question_id: null,
              active_answering_player_id: null,
              question_status: "idle",
            } as any)
          : prev
      );
    }

    await goToNextPlayer();
  };

  const handleHostSelectBuzzer = async (player: LobbyPlayer) => {
    if (!isHost || !gameState) return;

    const { error } = await supabase
      .from("game_states")
      .update({
        active_answering_player_id: player.id,
        question_status: "answering",
      })
      .eq("lobby_id", lobby.id);

    if (!error) {
      setGameState((prev) =>
        prev
          ? ({
              ...(prev as any),
              active_answering_player_id: player.id,
              question_status: "answering",
            } as any)
          : prev
      );
    }
  };

  // Leave
  const handleLeaveGame = async () => {
    if (leaving) return;
    setLeaveMessage(null);
    setLeaving(true);

    try {
      if (selfPlayer.is_host) {
        await supabase.from("buzzes").delete().eq("lobby_id", lobby.id);
        await supabase.from("question_status").delete().eq("lobby_id", lobby.id);
        await supabase.from("game_states").delete().eq("lobby_id", lobby.id);
        await supabase.from("lobby_players").delete().eq("lobby_id", lobby.id);
        await supabase.from("lobbies").delete().eq("id", lobby.id);
        window.location.href = "/";
        return;
      }

      if (gameState && (gameState as any).current_player_id === selfPlayer.id) {
        const original = nonHostPlayersOrdered;
        const idx = original.findIndex((p) => p.id === selfPlayer.id);

        if (idx !== -1 && original.length > 1) {
          const nextIndex = (idx + 1) % original.length;
          const nextId = original[nextIndex].id;

          await supabase
            .from("game_states")
            .update({
              current_player_id: nextId,
              current_question_id: null,
              active_answering_player_id: null,
              question_status: "idle",
            })
            .eq("lobby_id", lobby.id);

          setGameState((prev) =>
            prev
              ? ({
                  ...(prev as any),
                  current_player_id: nextId,
                  current_question_id: null,
                  active_answering_player_id: null,
                  question_status: "idle",
                } as any)
              : prev
          );
        } else {
          await supabase
            .from("game_states")
            .update({
              current_player_id: null,
              current_question_id: null,
              active_answering_player_id: null,
              question_status: "idle",
            })
            .eq("lobby_id", lobby.id);

          setGameState((prev) =>
            prev
              ? ({
                  ...(prev as any),
                  current_player_id: null,
                  current_question_id: null,
                  active_answering_player_id: null,
                  question_status: "idle",
                } as any)
              : prev
          );
        }
      }

      await supabase
        .from("buzzes")
        .delete()
        .eq("lobby_id", lobby.id)
        .eq("player_id", selfPlayer.id);

      await supabase.from("lobby_players").delete().eq("id", selfPlayer.id);

      window.location.href = "/";
    } catch (err) {
      console.error(err);
      setLeaveMessage("Fehler beim Verlassen der Runde.");
    } finally {
      setLeaving(false);
    }
  };

  const gridCategories = boardCategories.slice(0, 6);
  const showQuestionOverlay = !!currentQuestion;

  const selfHasBuzzed = buzzers.some((b) => b.id === selfPlayer.id);
  const alreadyBuzzed = hasBuzzedThisQuestion || selfHasBuzzed;

  const basePointsList = [100, 200, 300, 500];

  return (
    <div className="relative flex flex-col gap-4 min-h-[80vh] pb-4">
      {/* Titel + Verlassen-Button */}
<div className="mt-2">
  <button
    onClick={handleLeaveGame}
    disabled={leaving}
    className="
      absolute top-4 left-4 z-50
      w-10 h-10
      flex items-center justify-center
      rounded-full
      bg-slate-800
      border border-slate-600
      text-lg
      text-slate-100
      hover:bg-slate-700
      disabled:opacity-50
    "
    aria-label="Spiel verlassen"
    title="Spiel verlassen"
  >
    ←
  </button>

  <div className="text-center">
    <h2 className="text-2xl md:text-3xl font-bold">
      {quiz?.name ?? "Quiz"}{" "}
      <span className="text-xs text-slate-400">
        (Board {activeBoard}{activeBoard === 2 ? " • Punkte x2" : ""})
      </span>
    </h2>
    <p className="text-xs text-slate-400">
      Lobby: {lobby.name} • Du bist {selfPlayer.name}
      {selfPlayer.is_host ? " (Host)" : ""}
    </p>
  </div>
</div>


      {/* GAME OVER */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-400 rounded-2xl max-w-md w-[90%] p-6 space-y-4 text-center">
            <h3 className="text-2xl font-bold text-amber-300">Spiel beendet!</h3>
            <p className="text-xs text-slate-300">
              Alle Fragen wurden beantwortet. Hier sind die Top 3 Spieler:
            </p>

            <ol className="space-y-2 text-sm">
              {topPlayers.length === 0 && (
                <li className="text-slate-400 text-xs">Keine Spieler gefunden.</li>
              )}

              {topPlayers.map((p, idx) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between bg-slate-800/80 rounded-lg px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                        ${
                          idx === 0
                            ? "bg-amber-400 text-slate-900"
                            : idx === 1
                            ? "bg-slate-300 text-slate-900"
                            : "bg-amber-700 text-slate-100"
                        }
                      `}
                    >
                      {idx + 1}
                    </span>
                    <span className="font-semibold truncate">{p.name}</span>
                  </span>

                  <span className="font-mono text-slate-100">{p.score}</span>
                </li>
              ))}
            </ol>

            <button
              onClick={handleLeaveGame}
              className="mt-2 w-full px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold"
            >
              Zurück zur Startseite
            </button>
          </div>
        </div>
      )}

      {leaveMessage && (
        <p className="text-center text-xs text-rose-300 px-4">{leaveMessage}</p>
      )}

      {/* Board */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-3xl px-2">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {gridCategories.map((cat: any) => (
              <div key={cat.id} className="flex flex-col gap-2">
                <CategoryTitle name={cat.name} />

                {basePointsList.map((basePts) => {
                  const q: any = questionMap[cat.id]?.find(
                    (qq: any) => qq.points === basePts
                  );
                  if (!q) return <div key={basePts} className="h-10 md:h-16" />;

                  const used = usageMap.get(q.id);
                  const disabled = used || !isHost;

                  return (
                    <button
                      key={q.id}
                      disabled={disabled}
                      onClick={!disabled && isHost ? () => handleSelectQuestion(q) : undefined}
                      className={`h-10 md:h-16 rounded-lg text-sm md:text-lg font-bold border border-slate-700 flex items-center justify-center transition
                        ${
                          used
                            ? "bg-slate-800 text-slate-500 line-through cursor-not-allowed"
                            : "bg-indigo-500 hover:bg-indigo-600 text-white"
                        }`}
                    >
                      {basePts * pointsMultiplier}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spielerleiste */}
      <div className="mt-3 w-full pb-2">
        <div className="max-w-lg mx-auto px-2 flex flex-col gap-2">
          {host && (
            <div className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between border border-slate-600 bg-slate-800/80 shadow-sm text-xs">
              <span className="font-semibold truncate">{host.name}</span>
              <span className="text-[10px] text-amber-300 font-mono">HOST</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {nonHostPlayersOrdered.map((p) => {
              const firstPlayerId = nonHostPlayersOrdered[0]?.id;
              const activeId =
                (gameState as any)?.current_player_id ?? firstPlayerId ?? null;

              const isActive = p.id === activeId;
              const hasBuzzed = buzzers.some((b) => b.id === p.id);

              return (
                <div
                  key={p.id}
                  className={`
                    px-2 py-1.5 rounded-lg flex items-center justify-between
                    border transition text-xs
                    ${isActive ? "border-emerald-400 bg-slate-800 shadow-md" : "border-slate-700 bg-slate-900"}
                  `}
                >
                  <span className="font-semibold truncate">{p.name}</span>
                  <div className="flex items-center gap-1.5">
                    {hasBuzzed && (
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    )}
                    <span className="font-mono">{p.score}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fragen-Overlay */}
      {showQuestionOverlay && currentQuestion && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-[90%] p-6 space-y-4">
            <div className="text-xs text-slate-400">
              Frage für {(currentQuestion as any).points * pointsMultiplier} Punkte •{" "}
              {currentPlayer ? `Am Zug: ${currentPlayer.name}` : ""}
            </div>

            {(currentQuestion as any).question_type === "image" ? (
              <div className="space-y-3">
                {!!(currentQuestion as any).question?.trim() && (
                  <div className="text-lg md:text-2xl font-semibold text-center">
                    {(currentQuestion as any).question}
                  </div>
                )}

                <div className="w-full max-w-xl mx-auto rounded-xl overflow-hidden border border-slate-700 bg-black/20">
                  <div className="aspect-[3/2] w-full">
                    <img
                      src={getQuestionImageUrl((currentQuestion as any).image_path) ?? ""}
                      alt="Fragebild"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-lg md:text-2xl font-semibold text-center">
                {(currentQuestion as any).question}
              </div>
            )}

            {isHost && (
              <div className="space-y-3">
                <div className="text-xs text-emerald-300">
                  Antwort (nur Host):{" "}
                  <span className="font-mono">{(currentQuestion as any).answer}</span>
                </div>

                <div className="flex flex-col md:flex-row gap-2">
                  <button
                    onClick={handleHostCorrect}
                    className="flex-1 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold"
                  >
                    Richtig
                  </button>
                  <button
                    onClick={handleHostWrong}
                    className="flex-1 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-sm font-semibold"
                  >
                    Falsch
                  </button>
                </div>

                <button
                  onClick={handleHostSkipQuestion}
                  className="w-full px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-700 text-sm font-semibold"
                >
                  Frage schließen / überspringen
                </button>

                {(((gameState as any)?.question_status === "buzzing") || buzzers.length > 0) && (
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
                        {(gameState as any)?.active_answering_player_id === p.id && (
                          <span className="text-emerald-400 text-[10px]">am Zug</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isHost && (
              <div className="flex flex-col items-center gap-3 w-full">
                <p className="text-xs text-slate-400 text-center px-2">
                  Warte auf die Entscheidung des Hosts. Wenn die Frage in die
                  Buzzer-Phase geht, kannst du buzzern.
                  {currentPlayer && selfPlayer.id === currentPlayer.id && (
                    <> (Du bist gerade an der Reihe und kannst nicht buzzern.)</>
                  )}
                </p>

                <button
                  onClick={handleBuzz}
                  disabled={
                    !isBuzzingAllowed ||
                    (currentPlayer && selfPlayer.id === currentPlayer.id) ||
                    alreadyBuzzed
                  }
                  className={`mt-1 px-6 py-2 rounded-xl font-semibold text-sm
                    ${
                      isBuzzingAllowed &&
                      !alreadyBuzzed &&
                      !(currentPlayer && selfPlayer.id === currentPlayer.id)
                        ? `bg-amber-400 hover:bg-amber-500 text-slate-900 ${
                            justBuzzed ? "animate-pulse" : ""
                          }`
                        : alreadyBuzzed
                        ? "bg-slate-500 text-slate-900 cursor-default"
                        : "bg-slate-700 text-slate-400 cursor-not-allowed"
                    }
                  `}
                >
                  {currentPlayer && selfPlayer.id === currentPlayer.id
                    ? "Du bist dran – kein Buzzer"
                    : alreadyBuzzed
                    ? "Gebuzzert"
                    : isBuzzingAllowed
                    ? "BUZZERN!"
                    : "Buzzer (nicht verfügbar)"}
                </button>

                <div className="w-full max-w-xs mt-1">
                  <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-[width] duration-100 ease-linear"
                      style={{
                        width: `${
                          buzzTimeLeft > 0 && isBuzzingAllowed
                            ? (buzzTimeLeft / 10) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-center text-slate-400">
                    {isBuzzingAllowed && buzzTimeLeft > 0
                      ? `Noch ${Math.ceil(buzzTimeLeft)} Sekunden zum Buzzern`
                      : "Buzz-Zeit abgelaufen"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
