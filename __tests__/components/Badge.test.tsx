import '@testing-library/jest-dom'
import React from 'react';
import { render, screen } from '@testing-library/react';
import Badge from '../../components/Badge';

describe('Badge component', () => {
  test('should render children text', () => {
    render(<Badge type="green">Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('should apply correct CSS class for green type', () => {
    const { container } = render(<Badge type="green">Active</Badge>);
    const span = container.firstChild;
    expect(span).toHaveClass('badge-green');
  });

  test('should apply correct CSS class for red type', () => {
    const { container } = render(<Badge type="red">Inactive</Badge>);
    const span = container.firstChild;
    expect(span).toHaveClass('badge-red');
  });

  test('should apply correct CSS class for blue type', () => {
    const { container } = render(<Badge type="blue">Info</Badge>);
    const span = container.firstChild;
    expect(span).toHaveClass('badge-blue');
  });

  test('should apply correct CSS class for purple type', () => {
    const { container } = render(<Badge type="purple">Premium</Badge>);
    const span = container.firstChild;
    expect(span).toHaveClass('badge-purple');
  });

  test('should apply gray class by default for unknown type', () => {
    const { container } = render(<Badge type="gray">Default</Badge>);
    const span = container.firstChild;
    expect(span).toHaveClass('badge-gray');
  });

  test('should merge custom style prop', () => {
    render(<Badge type="green" style={{ fontWeight: 900 } as React.CSSProperties}>Styled</Badge>);
    const span = screen.getByText('Styled');
    expect(span).toHaveStyle('font-weight: 900');
  });
});