import { useLocation } from 'wouter';

const NotFoundPage = () => {
  const [location, navigate] = useLocation();
  return (
    <div>
      <span>NotFoundPage: {location}</span>
      <button onClick={() => navigate('/')}>Go to Dashboard</button>
    </div>
  );
};

export default NotFoundPage;
