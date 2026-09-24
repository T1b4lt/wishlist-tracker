import { Route, Switch } from 'wouter';

import AppShell from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import ProductPage from './pages/ProductPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <AppShell>
      <Switch>
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
