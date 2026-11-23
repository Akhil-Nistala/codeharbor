import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import HeatMapProfile from "../components/HeatMap";
import withAuth from "../utils/withAuth";
import { apiClient, useAuth } from "../context/AuthContext";
import "../styles/profile.css";

function Profile() {
  const { id } = useParams();
  const { currentUser, handleLogout } = useAuth();
  const profileId = id ?? currentUser;
  const isOwnProfile = profileId === currentUser;

  const [userDetails, setUserDetails] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);

  const loadProfile = async () => {
    try {
      const res = await apiClient.get(`/users/${profileId}`);
      setUserDetails(res.data);

      if (!isOwnProfile) {
        // "Am I following them" depends on MY followedUsers list, not theirs.
        const me = await apiClient.get(`/users/${currentUser}`);
        setIsFollowing(me.data.followedUsers?.some((followedId) => followedId === profileId) ?? false);
      }
    } catch (err) {
      console.error("Cannot fetch user details:", err);
    }
  };

  useEffect(() => {
    if (!profileId) return;
    loadProfile();
    apiClient
      .get(`/repo/user/${profileId}`)
      .then((res) => setRepositories(res.data.repositories ?? []))
      .catch(() => setRepositories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const handleFollowToggle = async () => {
    const res = await apiClient.patch(`/users/${profileId}/follow`);
    setIsFollowing(res.data.following);
  };

  if (!userDetails) return null;

  return (
    <>
      <Navbar />

      {isOwnProfile && (
        <button
          onClick={handleLogout}
          style={{ position: "fixed", bottom: "50px", right: "50px" }}
          id="logout"
        >
          Logout
        </button>
      )}

      <div className="profile-page-wrapper">
        <div className="user-profile-section">
          <div className="profile-image"></div>

          <div className="name">
            <h3>{userDetails.username}</h3>
          </div>

          {!isOwnProfile && (
            <button className="follow-btn" onClick={handleFollowToggle}>
              {isFollowing ? "Unfollow" : "Follow"}
            </button>
          )}

          <div className="follower">
            <p>{userDetails.followedUsers?.length ?? 0} Following</p>
            <p>{repositories.length} Repositories</p>
          </div>
        </div>

        <div className="profile-main">
          <div className="heat-map-section">
            <HeatMapProfile />
          </div>

          <h4>Repositories</h4>
          {repositories.length === 0 ? (
            <p className="muted">No repositories yet.</p>
          ) : (
            <ul className="profile-repo-list">
              {repositories.map((repo) => (
                <li key={repo._id}>
                  <Link to={`/repo/${repo._id}`}>{repo.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export default withAuth(Profile);
