import { SetupScreen } from './components/SetupScreen';
import { MainScreen } from './components/MainScreen';
import { UserScreen } from './components/UserScreen';
import { ControlScreen } from './components/ControlScreen';

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const [firstSegment] = path.split('/').filter(Boolean);

  if (firstSegment === 'main') {
    return <MainScreen />;
  }

  if (firstSegment === 'user') {
    return <UserScreen />;
  }

  if (firstSegment === 'control') {
    return <ControlScreen />;
  }

  if (firstSegment === 'create') {
    return <SetupScreen />;
  }

  return <div className="min-h-screen bg-black" />;
}

export default App;
