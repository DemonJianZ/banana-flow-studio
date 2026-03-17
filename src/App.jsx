import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "./router";
import { AuthProvider } from "./auth/AuthProvider";
import Workbench from "./pages/Workbench";
import AuthPage from "./pages/AuthPage";
import PipelineSwapTrio from "./pages/PipelineSwapTrio";
import PipelineBatchVideo from "./pages/PipelineBatchVideo";
import PipelineFeatureExtract from "./pages/PipelineFeatureExtract";
import PipelineBatchWordArt from "./pages/PipelineBatchWordArt";
import PipelineRmbg from "./pages/PipelineRmbg";
import PipelinePoseControlVideo from "./pages/PipelinePoseControlVideo";
import AIChatImagePlayground from "./pages/AIChatImagePlayground";
import GlobalToast from "./components/GlobalToast";


const LoadingScreen = () => (
  <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
    <div className="flex flex-col items-center gap-2">
      <div className="h-10 w-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <div className="text-sm text-slate-400">初始化中...</div>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => children;

const RootRedirect = () => <Navigate to="/app" replace />;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GlobalToast />
        <Routes>
          <Route path="/login" element={<Navigate to="/app" replace />} />
          <Route path="/register" element={<Navigate to="/app" replace />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <Workbench />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/swap"
            element={
              <ProtectedRoute>
                <PipelineSwapTrio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/face-swap"
            element={
              <ProtectedRoute>
                <Navigate to="/app/swap" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/bg-swap"
            element={
              <ProtectedRoute>
                <Navigate to="/app/swap" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/outfit-swap"
            element={
              <ProtectedRoute>
                <Navigate to="/app/swap" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/batch-video"
            element={
              <ProtectedRoute>
                <PipelineBatchVideo />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/feature-extract"
            element={
              <ProtectedRoute>
                <PipelineFeatureExtract />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/rmbg"
            element={
              <ProtectedRoute>
                <PipelineRmbg />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/batch-wordart"
            element={
              <ProtectedRoute>
                <PipelineBatchWordArt />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/pose-control-video"
            element={
              <ProtectedRoute>
                <PipelinePoseControlVideo />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/ai-chat-image"
            element={
              <ProtectedRoute>
                <AIChatImagePlayground />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
