import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { hasSeenTutorial, useApp } from './store';
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
import { TutorialScreen } from './screens/TutorialScreen';
import { VerifyEmailScreen } from './screens/VerifyEmailScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';

function App() {
  const authState = useApp(s => s.authState);
  const init = useApp(s => s.init);
  const showTutorial = useApp(s => s.showTutorial);
  const setShowTutorial = useApp(s => s.setShowTutorial);

  // On mount, resume a saved session (if a token is in localStorage).
  useEffect(() => { init(); }, [init]);

  // First-run tutorial trigger — fires when the user first reaches the
  // signed-in app on a device that hasn't seen the tutorial before. Stored
  // per-device (localStorage) rather than per-user, so a returning user on
  // a fresh install gets the refresher and the same account on multiple
  // devices each see it once. The `setShowTutorial(false)` write inside
  // the tutorial flips the localStorage flag, so this useEffect won't fire
  // again after Skip / Get started.
  useEffect(() => {
    if (authState !== 'app') return;
    if (!hasSeenTutorial()) setShowTutorial(true);
  }, [authState, setShowTutorial]);

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

          {/* First-run + replayable tutorial — sits above everything else
              (including overlays / sheets) so a user replaying it from
              Settings sees it on top of the Settings screen. */}
          <AnimatePresence>
            {showTutorial && authState === 'app' && <TutorialScreen key="tutorial" />}
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
