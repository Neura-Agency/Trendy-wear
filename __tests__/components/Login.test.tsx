import '@testing-library/jest-dom'
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../../components/Login';

// Mock fetch for auth
global.fetch = jest.fn();

describe('Login component', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  test('should render login form with username and password fields', () => {
    render(<Login onLogin={jest.fn()} />);
    
    expect(screen.getByPlaceholderText('Enter User ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  test('should show error message on failed login', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<Login onLogin={jest.fn()} />);
    
    fireEvent.change(screen.getByPlaceholderText('Enter User ID'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Could not connect. Try again.')).toBeInTheDocument();
    });
  });

  test('should call onLogin on successful login', async () => {
    const mockUser = { username: 'testuser', role: 'admin' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    });

    const onLogin = jest.fn();
    render(<Login onLogin={onLogin} />);
    
    fireEvent.change(screen.getByPlaceholderText('Enter User ID'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'correctpass' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(mockUser);
    });
  });

  test('should toggle password visibility', () => {
    render(<Login onLogin={jest.fn()} />);
    
    const passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'password');
    
    const toggleButton = screen.getByLabelText('Show password');
    fireEvent.click(toggleButton);
    
    expect(passwordInput).toHaveAttribute('type', 'text');
    
    const hideButton = screen.getByLabelText('Hide password');
    fireEvent.click(hideButton);
    
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should show title and brand name', () => {
    render(<Login onLogin={jest.fn()} />);
    
    expect(screen.getByText('Trendy')).toBeInTheDocument();
    expect(screen.getByText('Wears')).toBeInTheDocument();
  });
});