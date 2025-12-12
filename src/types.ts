export type Quiz = {
  id: string;
  name: string;
};

export type QuizCategory = {
  id: string;
  quiz_id: string;
  name: string;
  position: number;
  board: number; // 1 oder 2
};

export type QuizQuestion = {
  id: string;
  category_id: string;
  points: number;
  question: string;
  answer: string;
  question_type?: "text" | "image";
  image_path?: string | null;
  board: number; // 1 oder 2
};

export type Lobby = {
  id: string;
  name: string;
  join_code: string;
  quiz_id: string;
  max_players: number;
  status: "waiting" | "running" | "finished";
};

export type LobbyPlayer = {
  id: string;
  lobby_id: string;
  name: string;
  is_host: boolean;
  score: number;
  turn_order: number;
  user_id: string | null;
};

export type GameState = {
  lobby_id: string;
  current_player_id: string | null;
  current_question_id: string | null;
  question_status: "idle" | "answering" | "buzzing" | "resolved";
  active_answering_player_id: string | null;
  current_board: number; // 1 oder 2
};
