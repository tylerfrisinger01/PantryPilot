// src/App.test.js
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders banner brand text', () => {
  render(<App />);
  const el = screen.getByText(/Insert project name/i);
  expect(el).toBeInTheDocument();
});
