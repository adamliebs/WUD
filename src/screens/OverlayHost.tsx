import { AnimatePresence } from 'framer-motion';
import { useApp } from '../store';
import { EditProfileScreen } from './EditProfileScreen';
import { FriendsScreen } from './FriendsScreen';
import { HistoryScreen } from './HistoryScreen';
import { SearchScreen } from './SearchScreen';
import { SettingsScreen } from './SettingsScreen';
import { SquadsScreen } from './SquadsScreen';

/**
 * Renders whichever full-screen overlay is currently open (settings,
 * editProfile, friends, history, squads), animated with a push-from-right transition.
 */
export function OverlayHost() {
  const overlay = useApp(s => s.overlay);

  return (
    <AnimatePresence>
      {overlay === 'settings'    && <SettingsScreen    key="settings" />}
      {overlay === 'editProfile' && <EditProfileScreen key="editProfile" />}
      {overlay === 'friends'     && <FriendsScreen     key="friends" />}
      {overlay === 'history'     && <HistoryScreen     key="history" />}
      {overlay === 'squads'      && <SquadsScreen      key="squads" />}
      {overlay === 'search'      && <SearchScreen      key="search" />}
    </AnimatePresence>
  );
}
