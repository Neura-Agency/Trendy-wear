import '@testing-library/jest-dom'
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomSelect from '../../components/CustomSelect';

describe('CustomSelect component', () => {
  const options = ['Option A', 'Option B', 'Option C'];

  test('should render with correct label', () => {
    render(<CustomSelect label="Test Label" value="Option A" options={options} onChange={jest.fn()} />);
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  test('should display selected value', () => {
    render(<CustomSelect value="Option B" options={options} onChange={jest.fn()} />);
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  test('should show dropdown options on click', () => {
    render(<CustomSelect value="Option A" options={options} onChange={jest.fn()} />);
    
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    
    expect(screen.getByText('Option B')).toBeVisible();
    expect(screen.getByText('Option C')).toBeVisible();
  });

  test('should call onChange when option is selected', () => {
    const handleChange = jest.fn();
    render(<CustomSelect value="Option A" options={options} onChange={handleChange} />);
    
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Option B'));
    
    expect(handleChange).toHaveBeenCalledWith('Option B');
  });

  test('should accept Option objects with id and label', () => {
    const objOptions = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ];
    
    render(<CustomSelect value="a" options={objOptions} onChange={jest.fn()} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  test('should show selected checkmark on active option', () => {
    render(<CustomSelect value="Option A" options={options} onChange={jest.fn()} />);
    
    fireEvent.click(screen.getByRole('combobox'));
    const checkmarks = screen.getAllByText('\u2713');
    expect(checkmarks.length).toBe(1);
  });
});