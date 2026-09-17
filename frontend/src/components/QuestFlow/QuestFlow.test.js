import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { QuestFlow, isStepFilled } from './QuestFlow';
import { SCALE_ANSWERS } from './answers';

// jsdom reports navigator.language as en-US, so the provider would render the
// English dictionary; these assertions are written against the Ukrainian one.
beforeEach(() => localStorage.setItem('lang', 'uk'));

const scaleStep = (key) => ({ type: 'scale', key, i18n: `flow.q.${key}`, options: SCALE_ANSWERS[key] });

// A tiny host that owns the values, the way both real callers do.
const Host = ({ steps, onSubmit = () => {}, scale10 = false }) => {
  const [values, setValues] = require('react').useState({});
  return (
    <I18nProvider>
      <QuestFlow
        steps={steps}
        values={values}
        scale10={scale10}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={onSubmit}
        onExit={() => {}}
        status={{ saving: false, sent: true, error: '' }}
        done={{ title: 'done', text: '', cta: 'ok' }}
      />
    </I18nProvider>
  );
};

test('the forward button stays locked until the question is answered', async () => {
  const user = userEvent.setup();
  render(<Host steps={[scaleStep('meat'), scaleStep('salt'), { type: 'done', key: 'done' }]} />);

  expect(screen.getByText('Скільки в ньому було мʼяса?')).toBeInTheDocument();
  const next = screen.getByRole('button', { name: /Далі/i });
  expect(next).toBeDisabled();

  await user.click(screen.getByRole('button', { name: /Щедро/ }));
  expect(next).toBeEnabled();
  // the chosen answer reports itself as chosen, and the praise line reacts
  expect(screen.getByRole('button', { name: /Щедро/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Смачно!')).toBeInTheDocument();

  await user.click(next);
  await waitFor(() => expect(screen.getByText('Як там із сіллю?')).toBeInTheDocument());
});

test('answers survive going back, so a correction costs nothing', async () => {
  const user = userEvent.setup();
  render(<Host steps={[scaleStep('meat'), scaleStep('salt'), { type: 'done', key: 'done' }]} />);

  await user.click(screen.getByRole('button', { name: /Щедро/ }));
  await user.click(screen.getByRole('button', { name: /Далі/i }));
  await waitFor(() => expect(screen.getByText('Як там із сіллю?')).toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: /Назад/i }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Щедро/ })).toHaveAttribute('aria-pressed', 'true')
  );
});

test('the closing screen submits exactly once', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<Host steps={[scaleStep('meat'), { type: 'done', key: 'done' }]} onSubmit={onSubmit} />);

  await user.click(screen.getByRole('button', { name: /Нормально/ }));
  await user.click(screen.getByRole('button', { name: /Готово/i }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  // a re-render (the parent setting its saved state) must not fire a second POST
  await user.click(screen.getByRole('button', { name: /ok/i }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test('the ten-point arm offers ten taps and both anchors', async () => {
  const user = userEvent.setup();
  render(<Host steps={[scaleStep('salt'), { type: 'done', key: 'done' }]} scale10 />);

  const taps = screen.getAllByRole('button', { name: /^\d+$/ });
  expect(taps).toHaveLength(10);
  expect(taps.map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  expect(screen.getByText('прісний')).toBeInTheDocument();
  expect(screen.getByText('пересолений')).toBeInTheDocument();

  const next = screen.getByRole('button', { name: /Готово/i });
  expect(next).toBeDisabled();

  await user.click(taps[5]); // 6 — саме як треба
  expect(taps[5]).toHaveAttribute('aria-pressed', 'true');
  expect(next).toBeEnabled();
  // praise comes from the bucket, not from "bigger is better"
  expect(screen.getByText('Вау, це любов!')).toBeInTheDocument();

  await user.click(taps[9]); // 10 — пересолений
  await waitFor(() => expect(screen.getByText('Буває… дякуємо за чесність!')).toBeInTheDocument());
});

test('the five-answer arm is what renders without the flag', () => {
  render(<Host steps={[scaleStep('salt'), { type: 'done', key: 'done' }]} />);
  expect(screen.queryAllByRole('button', { name: /^\d+$/ })).toHaveLength(0);
  expect(screen.getByRole('button', { name: /Саме як треба/ })).toBeInTheDocument();
});

test('optional steps can be skipped; required ones cannot', () => {
  expect(isStepFilled({ type: 'photo', key: 'photo' }, {})).toBe(true);
  expect(isStepFilled({ type: 'comment', key: 'comment' }, {})).toBe(true);
  expect(isStepFilled({ type: 'text', key: 'name' }, { name: '   ' })).toBe(false);
  expect(isStepFilled({ type: 'text', key: 'name' }, { name: 'Борщ' })).toBe(true);
  expect(isStepFilled({ type: 'number', key: 'price', min: 0 }, { price: '0' })).toBe(false);
  expect(isStepFilled({ type: 'number', key: 'price', min: 0 }, { price: '180' })).toBe(true);
  expect(isStepFilled({ type: 'scale', key: 'meat' }, { meat: null })).toBe(false);
  expect(isStepFilled({ type: 'scale', key: 'meat' }, { meat: 2 })).toBe(true);
});

test('the skip link appears on an empty optional step and disappears once it is filled', async () => {
  const user = userEvent.setup();
  render(
    <Host
      steps={[
        { type: 'comment', key: 'comment', i18n: 'flow.commentTitle' },
        { type: 'done', key: 'done' },
      ]}
    />
  );
  expect(screen.getByRole('button', { name: /Пропустити/i })).toBeInTheDocument();
  await user.type(screen.getByRole('textbox'), 'смачно');
  expect(screen.queryByRole('button', { name: /Пропустити/i })).not.toBeInTheDocument();
});

test('photos: several can be added, and each can be dropped from its own corner', async () => {
  const user = userEvent.setup();
  render(<Host steps={[{ type: 'photo', key: 'photo', i18n: 'flow.photoTitle' }, { type: 'done', key: 'done' }]} />);

  const input = document.querySelector('input[type="file"]');
  expect(input).toHaveAttribute('multiple');

  const file = (name) => new File(['x'], name, { type: 'image/jpeg' });
  // jsdom has no object URLs
  global.URL.createObjectURL = jest.fn((f) => `blob:${f.name}`);
  global.URL.revokeObjectURL = jest.fn();

  await user.upload(input, [file('one.jpg'), file('two.jpg'), file('three.jpg')]);
  await waitFor(() => expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(3));
  expect(screen.getByText('3 з 6 фото')).toBeInTheDocument();

  // the × on the first thumbnail removes that one, not the last
  const removes = screen.getAllByRole('button', { name: /Прибрати фото/i });
  expect(removes).toHaveLength(3);
  await user.click(removes[0]);
  await waitFor(() => expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(2));
  const left = [...document.querySelectorAll('img[src^="blob:"]')].map((i) => i.src);
  expect(left).toEqual(['blob:two.jpg', 'blob:three.jpg']);
});

test('photos: the same file twice is one photo, and the cap holds', async () => {
  const user = userEvent.setup();
  render(<Host steps={[{ type: 'photo', key: 'photo', i18n: 'flow.photoTitle' }, { type: 'done', key: 'done' }]} />);
  const input = document.querySelector('input[type="file"]');
  global.URL.createObjectURL = jest.fn((f) => `blob:${f.name}`);
  global.URL.revokeObjectURL = jest.fn();

  const same = new File(['x'], 'same.jpg', { type: 'image/jpeg' });
  await user.upload(input, [same]);
  await waitFor(() => expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(1));
  await user.upload(input, [same]);
  await waitFor(() => expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(1));

  const many = Array.from({ length: 9 }, (_, i) => new File(['x'], `m${i}.jpg`, { type: 'image/jpeg' }));
  await user.upload(input, many);
  await waitFor(() => expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(6));
  // and once full, the add button steps aside
  expect(screen.queryByRole('button', { name: /Додати/i })).not.toBeInTheDocument();
});
