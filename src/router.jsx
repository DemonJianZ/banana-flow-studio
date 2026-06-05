/* eslint-disable react-refresh/only-export-components */
import { useLocation } from "react-router-dom";

export {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";

export { useLocation as useCurrentPathLocation } from "react-router-dom";

export function useCurrentPath() {
  const location = useLocation();
  return `${location.pathname}${location.search}`;
}
