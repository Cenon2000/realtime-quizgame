import { useState } from "react";
import LandingPage from "./views/LandingPage";
import CreateQuizPage from "./views/CreateQuizPage";
import HostGamePage from "./views/HostGamePage";
import JoinGamePage from "./views/JoinGamePage";
import LobbyView from "./views/LobbyView";
import GameBoardView from "./views/GameBoardView";
import type { Lobby, LobbyPlayer } from "./types";

type View =
  | { name: "landing" }
  | { name: "createQuiz" }
  | { name: "hostGame" }
  | { name: "joinGame" }
  | { name: "lobby"; lobby: Lobby; selfPlayer: LobbyPlayer }
  | { name: "game"; lobby: Lobby; selfPlayer: LobbyPlayer };

function App() {
  const [view, setView] = useState<View>({ name: "landing" });

  return (
    <div className="min-h-screen bg-slate-900 flex">
      <div className="m-auto w-full max-w-5xl bg-slate-800/80 rounded-2xl shadow-xl border border-slate-700 p-6 md:p-8">
        {view.name === "landing" && (
          <LandingPage
            onCreateQuiz={() => setView({ name: "createQuiz" })}
            onHostGame={() => setView({ name: "hostGame" })}
            onJoinGame={() => setView({ name: "joinGame" })}
          />
        )}
        {view.name === "createQuiz" && (
          <CreateQuizPage onBack={() => setView({ name: "landing" })} />
        )}
        {view.name === "hostGame" && (
          <HostGamePage
            onBack={() => setView({ name: "landing" })}
            onLobbyReady={(lobby, selfPlayer) =>
              setView({ name: "lobby", lobby, selfPlayer })
            }
          />
        )}
        {view.name === "joinGame" && (
          <JoinGamePage
            onBack={() => setView({ name: "landing" })}
            onLobbyReady={(lobby, selfPlayer) =>
              setView({ name: "lobby", lobby, selfPlayer })
            }
          />
        )}
        {view.name === "lobby" && (
          <LobbyView
            lobby={view.lobby}
            selfPlayer={view.selfPlayer}
            onGameStart={(lobby, selfPlayer) =>
              setView({ name: "game", lobby, selfPlayer })
            }
          />
        )}
        {view.name === "game" && (
          <GameBoardView lobby={view.lobby} selfPlayer={view.selfPlayer} />
        )}
      </div>
    </div>
  );
}

export default App;
