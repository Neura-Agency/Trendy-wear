import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PopupProvider, usePopup } from '../../components/Popup';

function TestPopupHarness() {
  const { toast, confirmDialog, showProcessing, hideProcessing } = usePopup();

  return (
    <>
      <button onClick={() => showProcessing('Saving inventory...')}>show-processing</button>
      <button onClick={() => hideProcessing()}>hide-processing</button>
      <button onClick={() => toast.success('Saved')}>show-toast</button>
      <button onClick={() => confirmDialog('Delete?')}>confirm</button>
    </>
  );
}

describe('PopupProvider', () => {
  test('shows a processing popup while a mutation is running', () => {
    render(
      <PopupProvider>
        <TestPopupHarness />
      </PopupProvider>
    );

    fireEvent.click(screen.getByText('show-processing'));

    expect(screen.getByText('Saving inventory...')).toBeInTheDocument();
    expect(screen.getByText('Please wait while the database is updating.')).toBeInTheDocument();
  });

  test('hides the processing popup when the action finishes', () => {
    render(
      <PopupProvider>
        <TestPopupHarness />
      </PopupProvider>
    );

    fireEvent.click(screen.getByText('show-processing'));
    fireEvent.click(screen.getByText('hide-processing'));

    expect(screen.queryByText('Saving inventory...')).not.toBeInTheDocument();
  });
});
