import { Route, Switch, useLocation } from 'wouter';

import AppShell from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import ProductPage from './pages/ProductPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  // Read once per render and pass explicitly to `Switch`: `AppShell` reads
  // its own `useLocation()` at the same time to key the route transition,
  // and this explicit `location` prop is what keeps the exiting page
  // rendering its own route while `AppShell` animates it out (see
  // `AppShell`'s doc comment).
  const [location] = useLocation();

  return (
    <AppShell>
      <Switch location={location}>
        <Route path="/" component={DashboardPage} />
        <Route path="/product/:productId" component={ProductPage} />
        <Route path="/categories" component={CategoriesPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </AppShell>
  );
}

export default App;
