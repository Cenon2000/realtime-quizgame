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

const DEFAULT_POINTS_B1 = [100, 200, 300, 500];
const DEFAULT_POINTS_B2 = [200, 400, 600, 1000];

type Props = {
  onBack: () => void;
};

type QuestionForm = {
  points: number;
  question: string; // optional bei Bildfragen (z.B. "Welches Land?")
  answer: string;
  question_type: "text" | "image";
  imageFile?: File | null;
  imagePreview?: string | null;
};

type CategoryForm = {
  name: string;
  questions: QuestionForm[];
};

function makeCategories(points: number[]) {
  return Array.from({ length: 6 }, (_, i) => ({
    name: `Kategorie ${i + 1}`,
    questions: points.map((p) => ({
      points: p,
      question: "",
      answer: "",
      question_type: "text" as const,
      imageFile: null,
      imagePreview: null,
    })),
  }));
}

export default function CreateQuizPage({ onBack }: Props) {
  const [quizName, setQuizName] = useState("");

  // Board 1
  const [categoryCountB1, setCategoryCountB1] = useState(6);
  const [categoriesB1, setCategoriesB1] = useState<CategoryForm[]>(
    makeCategories(DEFAULT_POINTS_B1)
  );

  // Board 2
  const [board2Enabled, setBoard2Enabled] = useState(false);
  const [categoryCountB2, setCategoryCountB2] = useState(6);
  const [categoriesB2, setCategoriesB2] = useState<CategoryForm[]>(
    makeCategories(DEFAULT_POINTS_B2)
  );

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  // Hilfsfunktion: je Board die richtigen Setter
  const getBoardState = useMemo(() => {
    return {
      1: { categories: categoriesB1, setCategories: setCategoriesB1, count: categoryCountB1 },
      2: { categories: categoriesB2, setCategories: setCategoriesB2, count: categoryCountB2 },
    } as const;
  }, [categoriesB1, categoriesB2, categoryCountB1, categoryCountB2]);

  const handleCategoryChange = (
    board: 1 | 2,
    index: number,
    value: string
  ) => {
    const { setCategories } = getBoardState[board];
    setCategories((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], name: value };
      return copy;
    });
  };

  const handleQuestionChange = (
    board: 1 | 2,
    catIndex: number,
    qIndex: number,
    field: "question" | "answer",
    value: string
  ) => {
    const { setCategories } = getBoardState[board];
    setCategories((prev) => {
      const copy = [...prev];
      const cat = copy[catIndex];
      const qs = [...cat.questions];
      qs[qIndex] = { ...qs[qIndex], [field]: value };
      copy[catIndex] = { ...cat, questions: qs };
      return copy;
    });
  };

  const handleQuestionTypeChange = (
    board: 1 | 2,
    catIndex: number,
    qIndex: number,
    value: "text" | "image"
  ) => {
    const { setCategories } = getBoardState[board];
    setCategories((prev) => {
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

  const handleImageChange = (
    board: 1 | 2,
    catIndex: number,
    qIndex: number,
    file: File | null
  ) => {
    const { setCategories } = getBoardState[board];
    setCategories((prev) => {
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

      const saveBoard = async (board: 1 | 2) => {
        const pointsLabel = board === 1 ? "Board 1" : "Board 2";
        const cats = board === 1 ? categoriesB1 : categoriesB2;
        const count = board === 1 ? categoryCountB1 : categoryCountB2;

        for (let i = 0; i < count; i++) {
          const catForm = cats[i];

          const { data: catData, error: catError } = await supabase
            .from("quiz_categories")
            .insert({
              quiz_id: quizData.id,
              name: catForm.name.trim() || `Kategorie ${i + 1}`,
              position: i,
              board, // ✅ NEU
            })
            .select()
            .single();

          if (catError || !catData) throw catError;

          const questionsPayload: any[] = [];

          for (const q of catForm.questions) {
            let imagePath: string | null = null;

            if (q.question_type === "image") {
              if (!q.imageFile) {
                throw new Error(
                  `In "${catForm.name}" (${pointsLabel}) bei ${q.points} Punkten fehlt ein Bild.`
                );
              }
              imagePath = await uploadQuestionImage(q.imageFile, quizData.id);
            }

            questionsPayload.push({
              category_id: catData.id,
              board, // ✅ NEU
              points: q.points,
              question:
                q.question.trim() ||
                (q.question_type === "image"
                  ? "" // Bildfrage darf leer sein
                  : `Frage für ${q.points} Punkte`),
              answer: q.answer.trim() || "Antwort",
              question_type: q.question_type,
              image_path: imagePath,
            });
          }

          const { error: qError } = await supabase
            .from("quiz_questions")
            .insert(questionsPayload);

          if (qError) throw qError;
        }
      };

      // ✅ Board 1 speichern
      await saveBoard(1);

      // ✅ Board 2 speichern (optional)
      if (board2Enabled) {
        await saveBoard(2);
      }

      setInfo("Quiz erfolgreich gespeichert!");
      setQuizName("");

      // optional: Editor resetten
      setCategoryCountB1(6);
      setCategoriesB1(makeCategories(DEFAULT_POINTS_B1));
      setBoard2Enabled(false);
      setCategoryCountB2(6);
      setCategoriesB2(makeCategories(DEFAULT_POINTS_B2));
    } catch (err: any) {
      console.error(err);
      setInfo(err?.message ?? "Fehler beim Speichern des Quiz.");
    } finally {
      setLoading(false);
    }
  };

  const renderBoardEditor = (board: 1 | 2) => {
    const cats = board === 1 ? categoriesB1 : categoriesB2;
    const count = board === 1 ? categoryCountB1 : categoryCountB2;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">
            {board === 1 ? "Board 1" : "Board 2 (doppelte Punkte)"}
          </h3>
          <span className="text-[11px] text-slate-400">
            {board === 1 ? "100/200/300/500" : "200/400/600/1000"}
          </span>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span>Anzahl Kategorien (max. 6)</span>
          <input
            type="number"
            min={1}
            max={6}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
            value={count}
            onChange={(e) => {
              const v = Math.max(1, Math.min(6, Number(e.target.value) || 1));
              if (board === 1) setCategoryCountB1(v);
              else setCategoryCountB2(v);
            }}
          />
        </label>

        <div className="space-y-4">
          {cats.slice(0, count).map((cat, catIndex) => (
            <div
              key={`${board}-${catIndex}`}
              className="border border-slate-700 rounded-lg p-3 space-y-3"
            >
              <input
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 mb-2"
                value={cat.name}
                onChange={(e) =>
                  handleCategoryChange(board, catIndex, e.target.value)
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cat.questions.map((q, qIndex) => (
                  <div
                    key={`${board}-${catIndex}-${q.points}`}
                    className="bg-slate-800 rounded-lg p-2 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-indigo-300">
                        {q.points} Punkte
                      </div>

                      <select
                        className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs"
                        value={q.question_type}
                        onChange={(e) =>
                          handleQuestionTypeChange(
                            board,
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
                        handleQuestionChange(
                          board,
                          catIndex,
                          qIndex,
                          "question",
                          e.target.value
                        )
                      }
                    />

                    {q.question_type === "image" && (
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          className="text-xs"
                          onChange={(e) =>
                            handleImageChange(
                              board,
                              catIndex,
                              qIndex,
                              e.target.files?.[0] ?? null
                            )
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
                        handleQuestionChange(
                          board,
                          catIndex,
                          qIndex,
                          "answer",
                          e.target.value
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 max-h-[80vh]">
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
        {/* Linke Spalte: Meta + speichern */}
        <div className="flex-1 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Quizname</span>
            <input
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={quizName}
              onChange={(e) => setQuizName(e.target.value)}
            />
          </label>

          {/* Board 2 Toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={board2Enabled}
              onChange={(e) => setBoard2Enabled(e.target.checked)}
            />
            <span>Board 2 aktivieren (doppelte Punkte)</span>
          </label>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 font-semibold"
          >
            {loading ? "Speichern..." : "Quiz speichern"}
          </button>

          {info && <p className="text-sm text-slate-300">{info}</p>}
        </div>

        {/* Rechte Spalte: Editor */}
        <div className="flex-[2] overflow-y-auto max-h-[60vh] border border-slate-700 rounded-xl p-3 space-y-6 bg-slate-900/50">
          {/* Board 1 */}
          {renderBoardEditor(1)}

          {/* Board 2 (optional) */}
          {board2Enabled && (
            <div className="pt-4 border-t border-slate-700">
              {renderBoardEditor(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
