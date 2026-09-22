import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Dashboard from "./components/dashboard/Dashboard";
import Login from "./components/auth/Login";
import Signup from "./components/auth/Signup";
import Profile from "./components/user/Profile";
import CreateRepository from "./components/repo/CreateRepository";
import RepositoryDetail from "./components/repo/RepositoryDetail";
import "./App.css";

function App() {
  return (
    <div className="App">
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/create" element={<CreateRepository />} />
            <Route path="/repo/:id" element={<RepositoryDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:id" element={<Profile />} />
          </Routes>
        </AuthProvider>
      </Router>
    </div>
  );
}

export default App;
