import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { QuestFlow, isStepFilled } from './QuestFlow';
import { ratingSteps } from './answers';

// jsdom reports navigator.language as en-US, so the provider would render the
// English dictionary; these assertions are written against the Ukrainian one.
beforeEach(() => localStorage.setItem('lang', 'uk'));

const step = (key) => ratingSteps().find((s) => s.key === key);
const DONE = { type: 'done', key: 'done' };

// A tiny host that owns the values, the way the real callers do.
const Host = ({ steps, onSubmit = () => {}, initial = {}, status, xp, confirmExit = false, onExit = () => {}, onValues }) => {
  const [values, setValues] = useState(initial);
  onValues?.(values);
  return (
    <I18nProvider>
      <QuestFlow
        steps={steps}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={onSubmit}
        onExit={onExit}
        status={status || { saving: false, sent: true, error: '' }}
        done={{ title: 'Дякуємо за відгук!', text: '', cta: 'ok' }}
        xp={xp}
        confirmExit={confirmExit}
      />
    </I18nProvider>
  );
};

const next = () => screen.getByRole('button', { name: /^(Далі|Надіслати)$/ });

test('a part of the borshch: «Далі» wakes up with the first answer and nothing moves by itself', async () => {
  const user = userEvent.setup();
  render(<Host steps={[step('meat'), step('beet'), DONE]} />);

  expect(screen.getByRole('heading', { name: 'М’ясо' })).toBeInTheDocument();
  expect(screen.getByText('Складник 1 / 6')).toBeInTheDocument();
  expect(next()).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Пропустити' })).toBeInTheDocument();

  const amount = screen.getByRole('radiogroup', { name: 'Скільки його було?' });
  await user.click(within(amount).getByRole('radio', { name: /Кілька шматків/ }));
  expect(within(amount).getByRole('radio', { name: /Кілька шматків/ })).toHaveAttribute('aria-checked', 'true');
  expect(next()).toBeEnabled();
  // half a screen: skipping is still on offer
  expect(screen.getByRole('button', { name: 'Пропустити' })).toBeInTheDocument();

  // no auto-advance (Андрій 15.11): a second answer leaves us on the same screen
  await user.click(screen.getByRole('radio', { name: 'Смачне' }));
  await new Promise((r) => setTimeout(r, 250));
  expect(screen.getByRole('heading', { name: 'М’ясо' })).toBeInTheDocument();
  // a complete screen needs no skip
  expect(screen.queryByRole('button', { name: 'Пропустити' })).not.toBeInTheDocument();

  await user.click(next());
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Буряк' })).toBeInTheDocument());
});

test('«Нема» hides the question about the meat taste, with a word why', async () => {
  const user = userEvent.setup();
  const seen = [];
  render(<Host steps={[step('meat'), DONE]} onValues={(v) => seen.push(v)} />);
  await user.click(screen.getByRole('radio', { name: 'Смачне' }));
  await user.click(screen.getByRole('radio', { name: /Нема/ }));
  expect(screen.queryByRole('radiogroup', { name: 'Яке на смак?' })).not.toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent('Мʼяса не було, тож про його смак не питаємо.');
  // the screen is complete with «Нема» alone
  expect(screen.queryByRole('button', { name: 'Пропустити' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: /Пару волокон/ }));
  expect(screen.getByRole('radiogroup', { name: 'Яке на смак?' })).toBeInTheDocument();
});

test('a part can be skipped untouched; «Загалом» cannot', async () => {
  const user = userEvent.setup();
  render(<Host steps={[step('aftertaste'), step('overall'), DONE]} />);
  await user.click(screen.getByRole('button', { name: 'Пропустити' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Загалом' })).toBeInTheDocument());
  expect(screen.getByText('Обовʼязково')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Пропустити' })).not.toBeInTheDocument();
  expect(next()).toBeDisabled();
  expect(next()).toHaveTextContent('Надіслати');

  await user.click(screen.getByRole('radio', { name: '9, ідеальний' }));
  expect(screen.getByText('ідеальний')).toBeInTheDocument();
  expect(next()).toBeEnabled();
});

test('«Загалом»: the arrows move along the digits, Up and Down by a row', async () => {
  const user = userEvent.setup();
  render(<Host steps={[step('overall'), DONE]} />);
  await user.click(screen.getByRole('radio', { name: '2, ніякий' }));
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('radio', { name: '3, слабенький' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('radio', { name: '3, слабенький' })).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('radio', { name: '8, прекрасний' })).toHaveAttribute('aria-checked', 'true');
});

test('the salt scale: nine stops, «саме те» in the middle and marked as the best', async () => {
  const user = userEvent.setup();
  const seen = [];
  render(<Host steps={[step('salt'), DONE]} onValues={(v) => seen.push(v)} />);
  const stops = within(screen.getByRole('radiogroup', { name: 'Як із сіллю?' })).getAllByRole('radio');
  expect(stops.map((s) => s.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  // nothing preselected
  expect(stops.every((s) => s.getAttribute('aria-checked') === 'false')).toBe(true);
  expect(screen.getByText('Торкнись шкали або потягни')).toBeInTheDocument();

  await user.click(screen.getByRole('radio', { name: '5, саме те, найкраще' }));
  expect(seen[seen.length - 1].salt).toBe(5);
  expect(screen.getByText('саме те')).toBeInTheDocument();
  expect(screen.getAllByText('найкраще').length).toBeGreaterThan(0);

  // the arrows walk it and stop at the end instead of wrapping
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
  expect(seen[seen.length - 1].salt).toBe(9);
  expect(screen.getByText('сіль!')).toBeInTheDocument();
});

test('the density scale: a finger that swipes up the track scrolls, a sideways drag chooses', () => {
  // jsdom has no PointerEvent: without one fireEvent drops clientX and pointerType
  const had = window.PointerEvent;
  window.PointerEvent = class extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId;
      this.pointerType = init.pointerType;
    }
  };
  render(<Host steps={[step('density'), DONE]} />);
  const track = screen.getByRole('radiogroup', { name: 'Наскільки густий?' });
  track.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 84, right: 300, bottom: 84 });
  const pointer = (type, x, y) => fireEvent[type](track, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, button: 0 });

  pointer('pointerDown', 100, 40);
  pointer('pointerMove', 102, 10);   // mostly vertical: a scroll
  fireEvent.pointerCancel(track, { pointerId: 1 });
  expect(within(track).getAllByRole('radio').some((r) => r.getAttribute('aria-checked') === 'true')).toBe(false);

  pointer('pointerDown', 100, 40);
  pointer('pointerMove', 200, 42);   // sideways: a drag, 200 of 300 is the 7th stop
  pointer('pointerUp', 200, 42);
  expect(screen.getByRole('radio', { name: '7, густий' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText('густий')).toBeInTheDocument();
  window.PointerEvent = had;
});

test('sides: several at once, «Нічого» clears them, the last one off leaves it unanswered', async () => {
  const user = userEvent.setup();
  const seen = [];
  render(<Host steps={[step('serving'), DONE]} onValues={(v) => seen.push(v)} />);
  const last = () => seen[seen.length - 1].sides;

  await user.click(screen.getByRole('checkbox', { name: 'Пампушки' }));
  await user.click(screen.getByRole('checkbox', { name: 'Сметана' }));
  expect(last()).toEqual(['sour_cream', 'pampushky']);
  expect(next()).toBeEnabled();

  await user.click(screen.getByRole('checkbox', { name: 'Нічого' }));
  expect(last()).toEqual([]);
  expect(screen.getByRole('checkbox', { name: 'Пампушки' })).toHaveAttribute('aria-checked', 'false');

  await user.click(screen.getByRole('checkbox', { name: 'Грінки' }));
  expect(last()).toEqual(['croutons']);
  await user.click(screen.getByRole('checkbox', { name: 'Грінки' }));
  expect(last()).toBeNull();
  expect(next()).toBeDisabled();
  // the ten of the spec, then «Нічого»
  expect(screen.getAllByRole('checkbox')).toHaveLength(11);
});

test('answers survive going back, so a correction costs nothing', async () => {
  const user = userEvent.setup();
  render(<Host steps={[step('beet'), step('density'), DONE]} />);
  await user.click(screen.getByRole('radio', { name: /Багато/ }));
  await user.click(next());
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Густина' })).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Назад' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: /Багато/ })).toHaveAttribute('aria-checked', 'true'));
});

test('the closing screen submits exactly once', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<Host steps={[step('overall'), DONE]} onSubmit={onSubmit} />);
  await user.click(screen.getByRole('radio', { name: '7, дуже добре' }));
  await user.click(next());
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  // a re-render (the parent setting its saved state) must not fire a second POST
  await user.click(screen.getByRole('button', { name: /ok/i }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test('the closing screen in full', async () => {
  const user = userEvent.setup();
  render(
    <Host
      steps={[step('aftertaste'), step('overall'), DONE]}
      initial={{ meat_amount: 3, beet_amount: 3, beet_flavor: 5, density: 7, salt: 5, sides: ['sour_cream', 'pampushky'] }}
      xp={{ perStep: 10, multiplier: 3, total: 250 }}
    />
  );
  await user.click(screen.getByRole('radio', { name: 'Хочу ще, зараз!' }));
  await user.click(next());
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Загалом' })).toBeInTheDocument());
  await user.click(screen.getByRole('radio', { name: '9, ідеальний' }));
  await user.click(next());
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Дякуємо за відгук!' })).toBeInTheDocument());
  expect(screen.queryByText(/\bXP\b/)).not.toBeInTheDocument();
  // aftertaste and overall answered here: 2 screens × 10 × 3
  expect(screen.getByText(/\+60 BRSH/)).toBeInTheDocument();
  expect(screen.getByText('Разом у тебе: 250 BRSH')).toBeInTheDocument();
  expect(screen.getByText(/Тестові БорщКоіни: їх не можна купити чи продати\./)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^Що\sтаке\sБорщКоін$/ })).toHaveAttribute('href', 'https://navernyborshchu.com/crypto/');
  const sum = screen.getByRole('region', { name: 'Твій Борщ у двох словах' });
  ['Мʼяса в кожній ложці', 'Буряку багато, аж на губах', 'Густий', 'Сіль саме те', 'Зі сметаною й пампушками']
    .forEach((p) => expect(within(sum).getByText(p)).toBeInTheDocument());
  expect(within(sum).getByText('ідеальний')).toBeInTheDocument();
  expect(within(sum).getByText('хочу ще, зараз!')).toBeInTheDocument();
});

test('the cross asks first once something is answered, and leaving keeps nothing on screen', async () => {
  const user = userEvent.setup();
  const onExit = jest.fn();
  render(<Host steps={[step('meat'), DONE]} confirmExit onExit={onExit} />);
  // nothing answered: the cross simply leaves
  await user.click(screen.getByRole('button', { name: 'Закрити' }));
  expect(onExit).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole('radio', { name: /Кілька шматків/ }));
  await user.click(screen.getByRole('button', { name: 'Закрити' }));
  expect(screen.getByRole('dialog', { name: 'Вийти з оцінки?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Продовжити оцінку' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onExit).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Закрити' }));
  await user.click(screen.getByRole('button', { name: 'Вийти' }));
  expect(onExit).toHaveBeenCalledTimes(2);
});

test('which steps can be left', () => {
  expect(isStepFilled({ type: 'photo', key: 'photo' }, {})).toBe(true);
  expect(isStepFilled({ type: 'comment', key: 'comment' }, {})).toBe(true);
  expect(isStepFilled({ type: 'text', key: 'name' }, { name: '   ' })).toBe(false);
  expect(isStepFilled({ type: 'text', key: 'name' }, { name: 'Борщ' })).toBe(true);
  expect(isStepFilled({ type: 'number', key: 'price', min: 0 }, { price: '0' })).toBe(false);
  expect(isStepFilled({ type: 'number', key: 'price', min: 0 }, { price: '180' })).toBe(true);
  expect(isStepFilled(step('meat'), {})).toBe(false);
  expect(isStepFilled(step('meat'), { meat_taste: 2 })).toBe(true);
  expect(isStepFilled(step('serving'), { sides: [] })).toBe(true);
  expect(isStepFilled(step('overall'), { overall: null })).toBe(false);
  expect(isStepFilled(step('overall'), { overall: 1 })).toBe(true);
});

test('the comment is a gift: «Надіслати» works without it', async () => {
  render(
    <Host
      steps={[
        { type: 'comment', key: 'comment', i18n: 'flow.commentTitle' },
        DONE,
      ]}
    />
  );
  expect(next()).toBeEnabled();
  expect(screen.getByRole('textbox', { name: 'Що запамʼяталось?' })).toBeInTheDocument();
});

test('photos: several can be added, and each can be dropped from its own corner', async () => {
  const user = userEvent.setup();
  render(<Host steps={[{ type: 'photo', key: 'photo', i18n: 'flow.photoTitle' }, DONE]} />);

  const input = document.querySelector('input[type="file"]');
  expect(input).toHaveAttribute('multiple');
  expect(screen.getByRole('button', { name: 'Пропустити' })).toBeInTheDocument();

  const file = (name) => new File(['x'], name, { type: 'image/jpeg' });
  // jsdom has no object URLs
  global.URL.createObjectURL = jest.fn((f) => `blob:${f.name}`);
  global.URL.revokeObjectURL = jest.fn();

  await user.upload(input, [file('one.jpg'), file('two.jpg'), file('three.jpg')]);
  await waitFor(() => expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(3));
  expect(screen.getByText('3 з 6 фото')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Пропустити' })).not.toBeInTheDocument();

  // the × on the first thumbnail removes that one, not the last
  const removes = screen.getAllByRole('button', { name: /Прибрати фото/i });
  expect(removes).toHaveLength(3);
  await user.click(removes[0]);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Прибрати фото/i })).toHaveLength(2));
  const left = [...document.querySelectorAll('[class*="shot"] img')].map((i) => i.src);
  expect(left).toEqual(['blob:two.jpg', 'blob:three.jpg']);
});

test('photos: the same file twice is one photo, and the cap holds', async () => {
  const user = userEvent.setup();
  render(<Host steps={[{ type: 'photo', key: 'photo', i18n: 'flow.photoTitle' }, DONE]} />);
  const input = document.querySelector('input[type="file"]');
  global.URL.createObjectURL = jest.fn((f) => `blob:${f.name}`);
  global.URL.revokeObjectURL = jest.fn();
  const shots = () => screen.queryAllByRole('button', { name: /Прибрати фото/i }).length;

  const same = new File(['x'], 'same.jpg', { type: 'image/jpeg' });
  await user.upload(input, [same]);
  await waitFor(() => expect(shots()).toBe(1));
  await user.upload(input, [same]);
  await waitFor(() => expect(shots()).toBe(1));

  const many = Array.from({ length: 9 }, (_, i) => new File(['x'], `m${i}.jpg`, { type: 'image/jpeg' }));
  await user.upload(input, many);
  await waitFor(() => expect(shots()).toBe(6));
  // and once full, the add button steps aside
  expect(screen.queryByRole('button', { name: /Додати/i })).not.toBeInTheDocument();
});
