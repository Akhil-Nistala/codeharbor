import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import CreateRepository from "./pages/CreateRepository";
import RepositoryDetail from "./pages/RepositoryDetail";
import "./App.css";

function App() {
  return (
    <div className="App">
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/create" element={<RequireAuth><CreateRepository /></RequireAuth>} />
            <Route path="/repo/:id" element={<RequireAuth><RepositoryDetail /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/profile/:id" element={<RequireAuth><Profile /></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </Router>
    </div>
  );
}

export default App;
