import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useApp } from './store';
import { DismissKeyboardOnSwipe } from './components/DismissKeyboardOnSwipe';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingOverlay } from './components/LoadingOverlay';
import { PhoneFrame } from './components/PhoneFrame';
import { TabBar } from './components/TabBar';
import { Toaster } from './components/Toaster';
import { MainTabsPager } from './components/MainTabsPager';
import { PostSheet } from './screens/PostSheet';
import { ActivityDetailSheet } from './screens/ActivityDetailSheet';
import { AuthScreen } from './screens/AuthScreen';
import { EditActivitySheet } from './screens/EditActivitySheet';
import { GoLiveSheet } from './screens/GoLiveSheet';
import { LockFloatSheet } from './screens/LockFloatSheet';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { OverlayHost } from './screens/OverlayHost';
import { PollComposerSheet } from './screens/PollComposerSheet';
import { ReportSheet } from './screens/ReportSheet';
import { SplashScreen } from './screens/SplashScreen';
import { VerifyEmailScreen } from './screens/VerifyEmailScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';

function App() {
  const authState = useApp(s => s.authState);
  const init = useApp(s => s.init);

  // On mount, resume a saved session (if a token is in localStorage).
  useEffect(() => { init(); }, [init]);

  return (
    <PhoneFrame>
      <ErrorBoundary>
        <div className="absolute inset-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {authState === 'splash'      && <SplashScreen      key="splash" />}
            {authState === 'welcome'     && <WelcomeScreen     key="welcome" />}
            {authState === 'auth'        && <AuthScreen        key="auth" />}
            {authState === 'onboarding'  && <OnboardingScreen  key="onboarding" />}
            {authState === 'verifyEmail' && <VerifyEmailScreen key="verifyEmail" />}
            {authState === 'app'         && <MainApp           key="main" />}
          </AnimatePresence>

          {/* Toaster is global so auth flows can use it too. */}
          <Toaster />
          {/* Full-screen loading veil shown during auth + signup round-trips.
              Sits above everything so the user can't double-tap a button
              that's already in flight. */}
          <LoadingOverlay />
          {/* Global gesture: a downward swipe dismisses the on-screen
              keyboard (only when the keyboard is up). Renders nothing. */}
          <DismissKeyboardOnSwipe />
        </div>
      </ErrorBoundary>
    </PhoneFrame>
  );
}

/** The signed-in app — everything the user used to see on cold open. */
function MainApp() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0"
    >
      {/* MainTabsPager keeps all four tabs mounted in a horizontal pager so
          the user can swipe left/right between them. Tapping the TabBar
          still works — it sets `tab` in the store and the pager animates. */}
      <MainTabsPager />

      <TabBar />
      <PostSheet />
      <GoLiveSheet />
      <ActivityDetailSheet />
      <EditActivitySheet />
      <LockFloatSheet />
      <PollComposerSheet />
      <ReportSheet />
      <OverlayHost />
    </motion.div>
  );
}

export default App;
