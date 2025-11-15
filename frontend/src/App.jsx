import { Route, Switch } from 'wouter';

import HeaderComponent from './components/HeaderComponent';
import DashboardPage from './pages/DashboardPage';
import ProductPage from './pages/ProductPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <div className="app-container">
      <HeaderComponent />
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/product/:productId" component={ProductPage} />
        <Route path="/categories" component={CategoriesPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </div>
  );
}

export default App;
