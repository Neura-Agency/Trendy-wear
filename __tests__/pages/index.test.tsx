import '@testing-library/jest-dom'
import React from 'react';
import { render, screen } from '@testing-library/react';

describe('Dashboard Home page concept test', () => {
  test('should render a basic component', () => {
    render(<div data-testid="login">Login Component</div>);
    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.getByText('Login Component')).toBeInTheDocument();
  });
});