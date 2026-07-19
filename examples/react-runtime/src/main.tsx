import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { createRouter } from './router';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('React example root element not found.');
}

const router = createRouter();

createRoot(rootElement).render(<RouterProvider router={router} />);
