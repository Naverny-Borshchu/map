import { useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { track } from '../../analytics';
import { markFlowHandover } from '../../services/flowAnalytics';
import { QuestFlow } from './QuestFlow';
import { ratingSteps } from './answers';

jest.mock('../../analytics', () => ({ ...jest.requireActual('../../analytics'), track: jest.fn() }));

/**
 * 26 people opened the rating in 90 days and 11 sent one, and nothing said on
 * which screen the other 15 stopped. Every screen of the three flows now says
 * it was shown (flow_step), and leaving early says where (flow_exit).
 */

beforeEach(() => {
  localStorage.setItem('lang', 'uk');
  track.mockClear();
});

// unmount here and let the delayed exit check run, so it lands in this test
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 5));
});

const step = (key) => ratingSteps().find((s) => s.key === key);
const STEPS = [step('meat'), step('salt'), { type: 'done', key: 'done' }];

const Host = ({ analytics, sent = true, onExit = () => {} }) => {
  const [values, setValues] = useState({});
  return (
    <I18nProvider>
      <QuestFlow
        steps={STEPS}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={() => {}}
        onExit={onExit}
        status={{ saving: false, sent, error: '' }}
        done={{ title: 'done', text: '', cta: 'ok' }}
        analytics={analytics}
      />
    </I18nProvider>
  );
};

const calls = (name) => track.mock.calls.filter(([event]) => event === name).map(([, props]) => props);

// the unmount check waits a tick, so StrictMode's rehearsal is not an exit
const flushExit = () => act(() => new Promise((r) => setTimeout(r, 5)));

test('reports each screen once, with its place in the whole journey', async () => {
  const user = userEvent.setup();
  render(<Host analytics={{ flow: 'rate', offset: 2, context: { entry: 'chooser' } }} />);

  expect(calls('flow_step')).toEqual([
    { flow: 'rate', step: 'meat', index: 2, total: 5, entry: 'chooser' },
  ]);

  await user.click(screen.getByRole('radio', { name: /У кожній ложці/ }));
  await user.click(screen.getByRole('button', { name: /Далі/i }));
  await waitFor(() => expect(calls('flow_step')).toHaveLength(2));
  expect(calls('flow_step')[1]).toEqual({ flow: 'rate', step: 'salt', index: 3, total: 5, entry: 'chooser' });
});

test('leaving half-way reports the screen it was left on', async () => {
  const { unmount } = render(<Host analytics={{ flow: 'add' }} />);
  unmount();
  await flushExit();
  expect(calls('flow_exit')).toEqual([{ flow: 'add', step: 'meat', index: 0, via: 'away' }]);
});

test('the cross reports a deliberate close', async () => {
  const user = userEvent.setup();
  let hide;
  const Toggle = () => {
    const [shown, setShown] = useState(true);
    hide = () => setShown(false);
    return shown ? <Host analytics={{ flow: 'rate' }} onExit={() => hide()} /> : null;
  };
  render(<Toggle />);
  await user.click(screen.getByRole('button', { name: 'Закрити' }));
  await flushExit();
  expect(calls('flow_exit')).toEqual([{ flow: 'rate', step: 'meat', index: 0, via: 'close' }]);
});

test('a finished flow is not an exit', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<Host analytics={{ flow: 'rate' }} />);
  await user.click(screen.getByRole('radio', { name: /У кожній ложці/ }));
  await user.click(screen.getByRole('button', { name: /Далі/i }));
  await waitFor(() => expect(screen.getByText('Як із сіллю?')).toBeInTheDocument());
  await user.click(screen.getByRole('radio', { name: '5, саме те, найкраще' }));
  await user.click(screen.getByRole('button', { name: /Надіслати/i }));
  await waitFor(() => expect(calls('flow_step').map((p) => p.step)).toEqual(['meat', 'salt', 'done']));
  unmount();
  await flushExit();
  expect(calls('flow_exit')).toEqual([]);
});

test('a hand-over to the next screen of the same flow is not an exit', async () => {
  const { unmount } = render(<Host analytics={{ flow: 'add' }} />);
  markFlowHandover('add');
  unmount();
  await flushExit();
  expect(calls('flow_exit')).toEqual([]);
});

test('a flow without a name sends nothing', () => {
  render(<Host />);
  expect(calls('flow_step')).toEqual([]);
});
