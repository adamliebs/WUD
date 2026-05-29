import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useApp } from './store';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PhoneFrame } from './components/PhoneFrame';
import { TabBar } from './components/TabBar';
import { Toaster } from './components/Toaster';
import { FeedScreen } from './screens/FeedScreen';
import { FloatsScreen } from './screens/FloatsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
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
            {authState === 'splash'     && <SplashScreen     key="splash" />}
            {authState === 'welcome'    && <WelcomeScreen    key="welcome" />}
            {authState === 'auth'       && <AuthScreen       key="auth" />}
            {authState === 'onboarding' && <OnboardingScreen key="onboarding" />}
            {authState === 'app'        && <MainApp          key="main" />}
          </AnimatePresence>

          {/* Toaster is global so auth flows can use it too. */}
          <Toaster />
        </div>
      </ErrorBoundary>
    </PhoneFrame>
  );
}

/** The signed-in app — everything the user used to see on cold open. */
function MainApp() {
  const tab = useApp(s => s.tab);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          {tab === 'feed' && <FeedScreen />}
          {tab === 'floats' && <FloatsScreen />}
          {tab === 'notifications' && <NotificationsScreen />}
          {tab === 'profile' && <ProfileScreen />}
        </motion.div>
      </AnimatePresence>

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
