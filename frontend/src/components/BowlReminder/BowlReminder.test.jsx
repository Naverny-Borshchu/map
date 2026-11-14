import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { createDraft, getDraft, listDrafts, REMIND_AFTER_MS, SNOOZE_MS } from '../../services/bowlDrafts';
import { createMemoryPhotoStore, setPhotoStoreForTests } from '../../services/bowlPhotoStore';
import { BowlReminder } from './BowlReminder';

jest.mock('react-router-dom', () => require('react-router'));
jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/**
 * «Як Борщ у «Ватрі»?» comes back 20 minutes after the bowl was brought, or
 * whenever the app is opened later, and offers rate / still eating / drop.
 */

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);
const MIN = 60 * 1000;

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
};

const renderBanner = () =>
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<><BowlReminder /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );

const bowl = () => createDraft({
  place: { id: 'p1', name: 'Ватра', city: 'Київ' },
  borsch: { id: 'b1', name: 'Борщ український' },
  photoMode: 'later',
}, T0);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  localStorage.clear();
  localStorage.setItem('lang', 'uk');
  setPhotoStoreForTests(createMemoryPhotoStore());
  track.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('bowl reminder banner', () => {
  it('stays away for the first 20 minutes and comes by itself after them', async () => {
    await bowl();
    jest.setSystemTime(T0 + 19 * MIN);
    renderBanner();
    expect(screen.queryByText('Як Борщ у «Ватра»?')).not.toBeInTheDocument();

    // the fake clock moves Date.now and the timers together
    act(() => {
      jest.advanceTimersByTime(REMIND_AFTER_MS - 19 * MIN + 1000);
    });
    expect(screen.getByText('Як Борщ у «Ватра»?')).toBeInTheDocument();
    expect(screen.getByText('Борщ український')).toBeInTheDocument();
  });

  it('is there at once when the app is opened hours later', async () => {
    await bowl();
    jest.setSystemTime(T0 + 3 * 60 * MIN);
    renderBanner();
    expect(screen.getByRole('complementary', { name: 'Нагадування про миску' })).toBeInTheDocument();
  });

  it('«Оцінити» opens moment 2 of that bowl', async () => {
    const d = await bowl();
    jest.setSystemTime(T0 + 25 * MIN);
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Оцінити' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/bowl/${d.id}/rate`);
    expect(track).toHaveBeenCalledWith('bowl_reminder', expect.objectContaining({ action: 'rate', bowl_id: d.id }));
  });

  it('«Ще їм» hides it for 15 minutes', async () => {
    const d = await bowl();
    jest.setSystemTime(T0 + 25 * MIN);
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Ще їм' }));
    expect(screen.queryByText('Як Борщ у «Ватра»?')).not.toBeInTheDocument();
    expect(getDraft(d.id).snoozedUntil).toBe(T0 + 25 * MIN + SNOOZE_MS);
    expect(track).toHaveBeenCalledWith('bowl_reminder', expect.objectContaining({ action: 'snooze' }));

    act(() => {
      jest.advanceTimersByTime(SNOOZE_MS - 1000);
    });
    expect(screen.queryByText('Як Борщ у «Ватра»?')).not.toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Як Борщ у «Ватра»?')).toBeInTheDocument();
  });

  it('«Не оцінюватиму» drops the bowl', async () => {
    await bowl();
    jest.setSystemTime(T0 + 25 * MIN);
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Не оцінюватиму' }));
    expect(screen.queryByText('Як Борщ у «Ватра»?')).not.toBeInTheDocument();
    expect(listDrafts()).toEqual([]);
    expect(track).toHaveBeenCalledWith('bowl_reminder', expect.objectContaining({ action: 'drop' }));
  });

  it('says nothing when there is no bowl', () => {
    renderBanner();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
