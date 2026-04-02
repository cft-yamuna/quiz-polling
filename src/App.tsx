import { useEffect, useState } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { MainScreen } from './components/MainScreen';
import { UserScreen } from './components/UserScreen';
import { ControlScreen } from './components/ControlScreen';

type Route = 'setup' | 'main' | 'user' | 'control';

function App() {
  const [route, setRoute] = useState<Route>('setup');
  const [pollId, setPollId] = useState<string>('');

  useEffect(() => {
    const path = window.location.pathname;
    const segments = path.split('/').filter(Boolean);

    if (segments.length >= 2) {
      const [routeName, id] = segments;
      if (routeName === 'main' || routeName === 'user' || routeName === 'control') {
        setRoute(routeName as Route);
        setPollId(id);
      }
    }
  }, []);

  if (route === 'main' && pollId) {
    return <MainScreen pollId={pollId} />;
  }

  if (route === 'user' && pollId) {
    return <UserScreen pollId={pollId} />;
  }

  if (route === 'control' && pollId) {
    return <ControlScreen pollId={pollId} />;
  }

  return <SetupScreen />;
}

export default App;
