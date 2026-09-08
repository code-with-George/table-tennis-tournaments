import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./routes/Home";
import NewTournament from "./routes/NewTournament";
import EditTournament from "./routes/EditTournament";
import PlayersScreen from "./routes/PlayersScreen";
import DrawScreen from "./routes/DrawScreen";
import GroupsScreen from "./routes/GroupsScreen";
import KnockoutScreen from "./routes/KnockoutScreen";
import ScheduleScreen from "./routes/ScheduleScreen";

export default function App() {
  return (
    <BrowserRouter>
      <div className="top-bar">
        <Link to="/" className="brand">
          🏓 ניהול תחרויות טניס שולחן
        </Link>
      </div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tournaments/new" element={<NewTournament />} />
        <Route path="/tournaments/:id/edit" element={<EditTournament />} />
        <Route path="/tournaments/:id/players" element={<PlayersScreen />} />
        <Route path="/tournaments/:id/draw" element={<DrawScreen />} />
        <Route path="/tournaments/:id/groups" element={<GroupsScreen />} />
        <Route path="/tournaments/:id/knockout" element={<KnockoutScreen />} />
        <Route path="/tournaments/:id/schedule" element={<ScheduleScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
