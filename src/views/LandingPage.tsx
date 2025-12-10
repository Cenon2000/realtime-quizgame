type Props = {
  onCreateQuiz: () => void;
  onHostGame: () => void;
  onJoinGame: () => void;
};

export default function LandingPage({
  onCreateQuiz,
  onHostGame,
  onJoinGame,
}: Props) {
  return (
    <div className="flex flex-col gap-8 items-center">
      <h1 className="text-3xl md:text-4xl font-bold text-center">
        Quiz Abend
      </h1>
      <p className="text-slate-300 text-center max-w-xl">
        {/* Text */} 
      </p>
      <div className="flex flex-col md:flex-row gap-4 w-full justify-center">
        <button 
            onClick={onCreateQuiz}
            className="md:w-48 w-full px-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 transition font-semibold">
            Quiz erstellen
        </button>
        <button 
            onClick={onHostGame}
            className="md:w-48 w-full px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 transition font-semibold">
            Spiel hosten
        </button>
        <button 
            onClick={onJoinGame}
            className="md:w-48 w-full px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 transition font-semibold">
            Beitreten
        </button>
    </div>

    </div>
  );
}
