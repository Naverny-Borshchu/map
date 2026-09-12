import { Navigate, useLocation } from "react-router-dom";

// Guards pages that require an account (favorites, reviews, add borsch):
// anonymous users are sent to registration first.
export const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem("auth") === "true";
  const location = useLocation();

  return isAuthenticated ? (
    children
  ) : (
    <Navigate to="/register" replace state={{ from: location }} />
  );
};
