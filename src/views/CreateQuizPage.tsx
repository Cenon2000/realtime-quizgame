import { useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

async function uploadQuestionImage(file: File, quizId: string) {
  const ext = file.name.split(".").pop() || "png";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = `quiz_${quizId}/${fileName}`;

  const { error } = await supabase.storage
    .from("question-images")
    .upload(path, file, { upsert: false });

  if (error) throw error;
  return path; // <-- speichern wir in image_path
}

const DEFAULT_POINTS = [100, 200, 300, 500] as const;

type Props = {
  onBack: () => void;
};

type QuestionForm = {
  points: number; // ✅ IMMER Basis-Punkte (100/200/300/500) – auch für Board 2!
  question: string;
  answer: string;
  question_type: "text" | "image";
  imageFile?: File | null;
  imagePreview?: string | null;
};

type CategoryForm = {
  name: string;
  questions: QuestionForm[];
};

function makeEmptyCategories(count: number) {
  return Array.from({ length: 6 }, (_, i) => ({
    name: `Kategorie ${i + 1}`,
    questions: DEFAULT_POINTS.map((p) => ({
      points: p,
      question: "",
      answer: "",
      question_type: "text" as const,
      imageFile: null,
      imagePreview: null,
    })),
  })).slice(0, count);
}

export default function CreateQuizPage({ onBack }: Props) {
  const [quizName, setQuizName] = useState("");

  // Board 1
  const [categoryCount1, setCategoryCount1] = useState(6);
  const [categories1, setCategories1] = useState<CategoryForm[]>(
    makeEmptyCategories(6)
  );

  // Board 2
  const [enableBoard2, setEnableBoard2] = useState(true);
  const [categoryCount2, setCategoryCount2] = useState(6);

const [categoryCount1Input, setCategoryCount1Input] = useState("6");
const [categoryCount2Input, setCategoryCount2Input] = useState("6");

function clampCategoryCount(n: number) {
  return Math.min(6, Math.max(1, n));
}

function commitCategoryCount(board: 1 | 2, raw: string) {
  const current = board === 1 ? categoryCount1 : categoryCount2;
  const n = raw.trim() === "" ? current : Number(raw);
  const clamped = clampCategoryCount(Number.isFinite(n) ? n : current);

  if (board === 1) {
    setCategoryCount1(clamped);
    setCategoryCount1Input(String(clamped));
  } else {
    setCategoryCount2(clamped);
    setCategoryCount2Input(String(clamped));
  }
}
  const [categories2, setCategories2] = useState<CategoryForm[]>(
    makeEmptyCategories(6)
  );

  // UI: Welche Board-Editor-Seite gerade sichtbar?
  const [activeBoardEditor, setActiveBoardEditor] = useState<1 | 2>(1);

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const activeCategories = useMemo(() => {
    return activeBoardEditor === 1 ? categories1 : categories2;
  }, [activeBoardEditor, categories1, categories2]);

  const activeCategoryCount = useMemo(() => {
    return activeBoardEditor === 1 ? categoryCount1 : categoryCount2;
  }, [activeBoardEditor, categoryCount1, categoryCount2]);

  const setActiveCategories = (updater: (prev: CategoryForm[]) => CategoryForm[]) => {
    if (activeBoardEditor === 1) {
      setCategories1(updater);
    } else {
      setCategories2(updater);
    }
  };

  const handleCategoryChange = (catIndex: number, value: string) => {
    setActiveCategories((prev) => {
      const copy = [...prev];
      copy[catIndex] = { ...copy[catIndex], name: value };
      return copy;
    });
  };

  const handleQuestionChange = (
    catIndex: number,
    qIndex: number,
    field: "question" | "answer",
    value: string
  ) => {
    setActiveCategories((prev) => {
      const copy = [...prev];
      const cat = copy[catIndex];
      const qs = [...cat.questions];
      qs[qIndex] = { ...qs[qIndex], [field]: value };
      copy[catIndex] = { ...cat, questions: qs };
      return copy;
    });
  };

  const handleQuestionTypeChange = (
    catIndex: number,
    qIndex: number,
    value: "text" | "image"
  ) => {
    setActiveCategories((prev) => {
      const copy = [...prev];
      const cat = copy[catIndex];
      const qs = [...cat.questions];

      qs[qIndex] = {
        ...qs[qIndex],
        question_type: value,
        ...(value === "text" ? { imageFile: null, imagePreview: null } : {}),
      };

      copy[catIndex] = { ...cat, questions: qs };
      return copy;
    });
  };

  const handleImageChange = (catIndex: number, qIndex: number, file: File | null) => {
    setActiveCategories((prev) => {
      const copy = [...prev];
      const cat = copy[catIndex];
      const qs = [...cat.questions];

      const preview = file ? URL.createObjectURL(file) : null;

      qs[qIndex] = {
        ...qs[qIndex],
        imageFile: file,
        imagePreview: preview,
        question_type: "image",
      };

      copy[catIndex] = { ...cat, questions: qs };
      return copy;
    });
  };

  const handleSubmit = async () => {
    if (!quizName.trim()) {
      setInfo("Bitte einen Quiznamen eingeben.");
      return;
    }

    setLoading(true);
    setInfo(null);

    try {
      // Quiz anlegen
      const { data: quizData, error: quizError } = await supabase
        .from("quizzes")
        .insert({ name: quizName.trim() })
        .select()
        .single();

      if (quizError || !quizData) throw quizError;

      // Helper: speichert 1 Board (board=1 oder 2)
      const saveBoard = async (board: 1 | 2, cats: CategoryForm[], catCount: number) => {
        for (let i = 0; i < catCount; i++) {
          const catForm = cats[i];

          // ✅ Kategorie speichern mit board = 1 oder 2
          const { data: catData, error: catError } = await supabase
            .from("quiz_categories")
            .insert({
              quiz_id: quizData.id,
              name: catForm.name.trim() || `Kategorie ${i + 1}`,
              position: i,
              board: board, // ✅ FIX: hier muss board rein (nicht catData.board)
            })
            .select()
            .single();

          if (catError || !catData) throw catError;

          const questionsPayload: any[] = [];

          for (const q of catForm.questions) {
            let imagePath: string | null = null;

            if (q.question_type === "image") {
              if (!q.imageFile) {
                // Anzeige im Editor: Board2 zeigt x2 in der UI, aber gespeichert wird Basis
                const shownPts = board === 2 ? q.points * 2 : q.points;
                throw new Error(
                  `In Board ${board} / "${catForm.name}" bei ${shownPts} Punkten fehlt ein Bild.`
                );
              }
              imagePath = await uploadQuestionImage(q.imageFile, quizData.id);
            }

            questionsPayload.push({
              category_id: catData.id,
              points: q.points, // ✅ IMMER Basis-Punkte speichern!
              question:
                q.question.trim() ||
                (q.question_type === "image" ? "" : `Frage für ${q.points} Punkte`),
              answer: q.answer.trim() || "Antwort",
              question_type: q.question_type,
              image_path: imagePath,
              board: board, // ✅ FIX: board sauber setzen
            });
          }

          const { error: qError } = await supabase
            .from("quiz_questions")
            .insert(questionsPayload);

          if (qError) throw qError;
        }
      };

      // Board 1 speichern
      await saveBoard(1, categories1, categoryCount1);

      // Board 2 speichern (optional)
      if (enableBoard2) {
        await saveBoard(2, categories2, categoryCount2);
      }

      setInfo(enableBoard2 ? "Quiz (Board 1 + Board 2) gespeichert!" : "Quiz gespeichert!");
      setQuizName("");
    } catch (err: any) {
      console.error(err);
      setInfo(err?.message ?? "Fehler beim Speichern des Quiz.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-h-[80vh] min-h-0">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Quiz erstellen</h2>
        <button
          className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          onClick={onBack}
        >
          Zurück
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* LINKS: Quiz-Settings */}
        <div className="flex-1 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Quizname</span>
            <input
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={quizName}
              onChange={(e) => setQuizName(e.target.value)}
            />
          </label>

          {/* Board Umschalter */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveBoardEditor(1)}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  activeBoardEditor === 1
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Board 1
              </button>

              <button
                onClick={() => setActiveBoardEditor(2)}
                disabled={!enableBoard2}
                className={`px-3 py-1 rounded-full text-xs font-semibold disabled:opacity-50 ${
                  activeBoardEditor === 2
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                Board 2 (x2)
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={enableBoard2}
                onChange={(e) => {
                  const v = e.target.checked;
                  setEnableBoard2(v);
                  if (!v) setActiveBoardEditor(1);
                }}
              />
              2. Board aktiv
            </label>
          </div>

          {/* Kategorieanzahl pro Board */}
{activeBoardEditor === 1 ? (
  <label className="flex flex-col gap-1 text-sm">
    <span>Anzahl Kategorien Board 1 (max. 6)</span>

    <div className="flex items-center gap-2">
      <button
        type="button"
        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
        onClick={() => {
          const next = clampCategoryCount(categoryCount1 - 1);
          setCategoryCount1(next);
          setCategoryCount1Input(String(next));
        }}
        disabled={categoryCount1 <= 1}
        aria-label="Kategorien Board 1 verringern"
        title="Verringern"
      >
        −
      </button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="w-24 text-center px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
        value={categoryCount1Input}
        onChange={(e) => {
          const onlyDigits = e.target.value.replace(/[^\d]/g, "");
          setCategoryCount1Input(onlyDigits);
        }}
        onBlur={() => commitCategoryCount(1, categoryCount1Input)}
        placeholder="1–6"
      />

      <button
        type="button"
        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
        onClick={() => {
          const next = clampCategoryCount(categoryCount1 + 1);
          setCategoryCount1(next);
          setCategoryCount1Input(String(next));
        }}
        disabled={categoryCount1 >= 6}
        aria-label="Kategorien Board 1 erhöhen"
        title="Erhöhen"
      >
        +
      </button>
    </div>
  </label>
) : (
  <label className="flex flex-col gap-1 text-sm">
    <span>Anzahl Kategorien Board 2 (max. 6)</span>

    <div className="flex items-center gap-2">
      <button
        type="button"
        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
        onClick={() => {
          const next = clampCategoryCount(categoryCount2 - 1);
          setCategoryCount2(next);
          setCategoryCount2Input(String(next));
        }}
        disabled={categoryCount2 <= 1}
        aria-label="Kategorien Board 2 verringern"
        title="Verringern"
      >
        −
      </button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="w-24 text-center px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
        value={categoryCount2Input}
        onChange={(e) => {
          const onlyDigits = e.target.value.replace(/[^\d]/g, "");
          setCategoryCount2Input(onlyDigits);
        }}
        onBlur={() => commitCategoryCount(2, categoryCount2Input)}
        placeholder="1–6"
      />

      <button
        type="button"
        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
        onClick={() => {
          const next = clampCategoryCount(categoryCount2 + 1);
          setCategoryCount2(next);
          setCategoryCount2Input(String(next));
        }}
        disabled={categoryCount2 >= 6}
        aria-label="Kategorien Board 2 erhöhen"
        title="Erhöhen"
      >
        +
      </button>
    </div>
  </label>
)}


          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 font-semibold"
          >
            {loading ? "Speichern..." : enableBoard2 ? "Quiz (2 Boards) speichern" : "Quiz speichern"}
          </button>

          {info && <p className="text-sm text-slate-300">{info}</p>}  
        </div>

        {/* RECHTS: Editor (Board 1 oder Board 2 – immer an gleicher Stelle) */}
        <div className="flex-[2] md:overflow-y-auto overflow-visible md:max-h-[60vh] min-h-0 pb-8 border border-slate-700 rounded-xl p-3 space-y-4 bg-slate-900/50">
          <div className="text-xs text-slate-300 mb-2">
            Du bearbeitest:{" "}
            <span className="font-semibold text-indigo-300">
              {activeBoardEditor === 1
                ? "Board 1"
                : "Board 2 (Punkte x2 werden im Spiel berechnet)"}
            </span>
          </div>

          {activeCategories.slice(0, activeCategoryCount).map((cat, catIndex) => (
            <div
              key={catIndex}
              className="border border-slate-700 rounded-lg p-3 space-y-3"
            >
              <input
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 mb-2"
                value={cat.name}
                onChange={(e) => handleCategoryChange(catIndex, e.target.value)}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cat.questions.map((q, qIndex) => {
                  const shownPoints =
                    activeBoardEditor === 2 ? q.points * 2 : q.points;

                  return (
                    <div
                      key={q.points}
                      className="bg-slate-800 rounded-lg p-2 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-indigo-300">
                          {shownPoints} Punkte
                        </div>

                        <select
                          className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs"
                          value={q.question_type}
                          onChange={(e) =>
                            handleQuestionTypeChange(
                              catIndex,
                              qIndex,
                              e.target.value as "text" | "image"
                            )
                          }
                        >
                          <option value="text">Text</option>
                          <option value="image">Bild</option>
                        </select>
                      </div>

                      <textarea
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sm"
                        placeholder={
                          q.question_type === "image"
                            ? "Optionaler Text (z.B. Welches Land?)"
                            : "Frage"
                        }
                        value={q.question}
                        onChange={(e) =>
                          handleQuestionChange(catIndex, qIndex, "question", e.target.value)
                        }
                      />

                      {q.question_type === "image" && (
                        <div className="space-y-2">
                          <input
                            type="file"
                            accept="image/*"
                            className="text-xs"
                            onChange={(e) =>
                              handleImageChange(catIndex, qIndex, e.target.files?.[0] ?? null)
                            }
                          />

                          {q.imagePreview && (
                            <div className="w-full rounded-lg overflow-hidden border border-slate-700 bg-black/20">
                              <div className="aspect-[3/2] w-full">
                                <img
                                  src={q.imagePreview}
                                  alt="Vorschau"
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <input
                        className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sm"
                        placeholder="Antwort"
                        value={q.answer}
                        onChange={(e) =>
                          handleQuestionChange(catIndex, qIndex, "answer", e.target.value)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
