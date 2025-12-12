import { useState } from "react";
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

const DEFAULT_POINTS = [100, 200, 300, 500];

type Props = {
  onBack: () => void;
};

type CategoryForm = {
  name: string;
  questions: {
    points: number;
    question: string; // optional bei Bildfragen (z.B. "Welches Land?")
    answer: string;
    question_type: "text" | "image";
    imageFile?: File | null;
    imagePreview?: string | null;
  }[];
};

export default function CreateQuizPage({ onBack }: Props) {
  const [quizName, setQuizName] = useState("");
  const [categoryCount, setCategoryCount] = useState(6);
  const [categories, setCategories] = useState<CategoryForm[]>(
    Array.from({ length: 6 }, (_, i) => ({
      name: `Kategorie ${i + 1}`,
      questions: DEFAULT_POINTS.map((p) => ({
        points: p,
        question: "",
        answer: "",
        question_type: "text",
        imageFile: null,
        imagePreview: null,
      })),
    }))
  );

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleCategoryChange = (
    index: number,
    field: keyof CategoryForm,
    value: string
  ) => {
    setCategories((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleQuestionChange = (
    catIndex: number,
    qIndex: number,
    field: "question" | "answer",
    value: string
  ) => {
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
    catIndex: number,
    qIndex: number,
    value: "text" | "image"
  ) => {
    setCategories((prev) => {
      const copy = [...prev];
      const cat = copy[catIndex];
      const qs = [...cat.questions];

      // Wenn man von image -> text wechselt: Bild zurücksetzen
      qs[qIndex] = {
        ...qs[qIndex],
        question_type: value,
        ...(value === "text"
          ? { imageFile: null, imagePreview: null }
          : {}),
      };

      copy[catIndex] = { ...cat, questions: qs };
      return copy;
    });
  };

  const handleImageChange = (
    catIndex: number,
    qIndex: number,
    file: File | null
  ) => {
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

      // Kategorien + Fragen
      for (let i = 0; i < categoryCount; i++) {
        const catForm = categories[i];

        const { data: catData, error: catError } = await supabase
          .from("quiz_categories")
          .insert({
            quiz_id: quizData.id,
            name: catForm.name.trim() || `Kategorie ${i + 1}`,
            position: i,
          })
          .select()
          .single();

        if (catError || !catData) throw catError;

        // Fragen bauen (mit optionalem Upload)
        const questionsPayload: any[] = [];

        for (const q of catForm.questions) {
          let imagePath: string | null = null;

          if (q.question_type === "image") {
            if (!q.imageFile) {
              throw new Error(
                `In "${catForm.name}" bei ${q.points} Punkten fehlt ein Bild.`
              );
            }
            imagePath = await uploadQuestionImage(q.imageFile, quizData.id);
          }

          questionsPayload.push({
            category_id: catData.id,
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

      setInfo("Quiz erfolgreich gespeichert!");
      setQuizName("");
    } catch (err: any) {
      console.error(err);
      setInfo(err?.message ?? "Fehler beim Speichern des Quiz.");
    } finally {
      setLoading(false);
    }
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
        <div className="flex-1 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Quizname</span>
            <input
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={quizName}
              onChange={(e) => setQuizName(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Anzahl Kategorien (max. 6)</span>
            <input
              type="number"
              min={1}
              max={6}
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700"
              value={categoryCount}
              onChange={(e) =>
                setCategoryCount(
                  Math.max(1, Math.min(6, Number(e.target.value) || 1))
                )
              }
            />
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

        <div className="flex-[2] overflow-y-auto max-h-[60vh] border border-slate-700 rounded-xl p-3 space-y-4 bg-slate-900/50">
          {categories.slice(0, categoryCount).map((cat, catIndex) => (
            <div
              key={catIndex}
              className="border border-slate-700 rounded-lg p-3 space-y-3"
            >
              <input
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 mb-2"
                value={cat.name}
                onChange={(e) =>
                  handleCategoryChange(catIndex, "name", e.target.value)
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cat.questions.map((q, qIndex) => (
                  <div
                    key={q.points}
                    className="bg-slate-800 rounded-lg p-2 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-indigo-300">
                        {q.points} Punkte
                      </div>

                      {/* Text/Bild Umschalter */}
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

                    {/* Frage-Text (optional bei Bildfragen) */}
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
                          catIndex,
                          qIndex,
                          "question",
                          e.target.value
                        )
                      }
                    />

                    {/* Bild Upload nur wenn question_type=image */}
                    {q.question_type === "image" && (
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          className="text-xs"
                          onChange={(e) =>
                            handleImageChange(
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
    </div>
  );
}
