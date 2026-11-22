import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { GoogleAuth } from './GoogleAuth';
import { track } from '../../analytics';

jest.mock('../../analytics', () => ({ track: jest.fn() }));
// jsdom lives on http://localhost and only https pages can be handed over;
// the payload itself is the real one
jest.mock('../../services/handoff', () => {
  const real = jest.requireActual('../../services/handoff');
  return { ...real, handoffUrl: () => real.handoffUrl().replace('http://localhost', 'https://map.navernyborshchu.com') };
});

const THREADS_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G83 Barcelona 456.0.0.32.61 (iPhone18,1; iOS 26_6_1; uk_UA; uk; scale=3.00; 1206x2622; IABMV/1; 1114829568)';
const realUA = navigator.userAgent;
const setUA = (ua) => Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });

// Google Identity Services, as much of it as the component touches
let gis;
const installGoogle = () => {
  gis = {
    initialize: jest.fn(),
    renderButton: jest.fn((el) => {
      const b = document.createElement('div');
      b.setAttribute('role', 'button');
      b.textContent = 'Google rendered button';
      el.appendChild(b);
    }),
    prompt: jest.fn(),
  };
  window.google = { accounts: { id: gis } };
};
// what Google calls after the person picks an account in its window
const googleSignsIn = (credential = 'google-id-token') => {
  const { callback } = gis.initialize.mock.calls.at(-1)[0];
  return act(async () => { await callback({ credential, select_by: 'btn' }); });
};

const renderAuth = (props) => render(
  <I18nProvider>
    <GoogleAuth onSuccess={jest.fn()} {...props} />
  </I18nProvider>
);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('lang', 'uk');
  track.mockClear();
  delete window.google;
  setUA(realUA);
});

afterEach(() => {
  jest.useRealTimers();
});

it('renders Google\'s own button and never relies on One Tap', () => {
  installGoogle();
  renderAuth();

  expect(gis.initialize).toHaveBeenCalledTimes(1);
  expect(gis.initialize.mock.calls[0][0]).toMatchObject({ ux_mode: 'popup', auto_select: false });
  expect(gis.renderButton).toHaveBeenCalledTimes(1);
  const [el, options] = gis.renderButton.mock.calls[0];
  expect(el).toBe(screen.getByTestId('google-button-slot'));
  expect(options).toMatchObject({ text: 'continue_with', shape: 'pill', locale: 'uk' });
  expect(options.width).toBeGreaterThanOrEqual(200);
  expect(options.width).toBeLessThanOrEqual(400);
  expect(screen.getByRole('button', { name: 'Google rendered button' })).toBeInTheDocument();
  // One Tap is what silently did nothing for five of ten people
  expect(gis.prompt).not.toHaveBeenCalled();
});

it('hands Google\'s credential to onSuccess', async () => {
  installGoogle();
  const onSuccess = jest.fn(async () => {});
  renderAuth({ onSuccess });
  await googleSignsIn('abc.def.ghi');
  expect(onSuccess).toHaveBeenCalledWith({ credential: 'abc.def.ghi', select_by: 'btn' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('says so when signing in fails after Google, instead of a button that seems dead', async () => {
  installGoogle();
  const onSuccess = jest.fn(async () => { throw new Error('Google auth request failed'); });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  renderAuth({ onSuccess });
  await googleSignsIn();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося увійти через Google');
  expect(track).toHaveBeenCalledWith('auth_google_failed', { stage: 'app', in_app: false });
  console.error.mockRestore();
});

it('re-uses one Google setup across renders: a new handler does not initialise it again', () => {
  installGoogle();
  const { rerender } = renderAuth({ onSuccess: jest.fn() });
  rerender(<I18nProvider><GoogleAuth onSuccess={jest.fn()} /></I18nProvider>);
  rerender(<I18nProvider><GoogleAuth onSuccess={jest.fn()} /></I18nProvider>);
  expect(gis.initialize).toHaveBeenCalledTimes(1);
});

it('the latest handler is the one called', async () => {
  installGoogle();
  const first = jest.fn();
  const second = jest.fn();
  const { rerender } = renderAuth({ onSuccess: first });
  rerender(<I18nProvider><GoogleAuth onSuccess={second} /></I18nProvider>);
  await googleSignsIn();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

it('waits for Google\'s script, then shows the button', () => {
  jest.useFakeTimers();
  renderAuth();
  expect(screen.getByRole('button', { name: /Продовжити з Google/ })).toBeDisabled();
  installGoogle();
  act(() => { jest.advanceTimersByTime(250); });
  expect(gis.renderButton).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: /Продовжити з Google/ })).not.toBeInTheDocument();
});

it('explains a script that never came (blocker, network) and still takes it if it comes late', () => {
  jest.useFakeTimers();
  renderAuth();
  act(() => { jest.advanceTimersByTime(9000); });
  expect(screen.getByRole('alert')).toHaveTextContent('Вхід Google не завантажився');
  expect(track).toHaveBeenCalledWith('auth_google_unavailable', { in_app: false });
  installGoogle();
  act(() => { jest.advanceTimersByTime(250); });
  expect(gis.renderButton).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('disabled (terms not accepted) covers Google\'s button so it cannot be tapped', () => {
  installGoogle();
  const { container } = renderAuth({ disabled: true });
  const box = screen.getByTestId('google-button-slot').parentElement;
  expect(box).toHaveAttribute('title', 'Погодьтесь з умовами користування');
  expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
});

describe('inside Threads', () => {
  beforeEach(() => setUA(THREADS_IOS));

  it('says Google will not sign in here and offers Safari, before the button', () => {
    installGoogle();
    renderAuth();
    expect(screen.getByText('У браузері Threads Google не дає увійти')).toBeInTheDocument();
    const open = screen.getByRole('button', { name: 'Відкрити в Safari' });
    const google = screen.getByRole('button', { name: 'Google rendered button' });
    // the way out comes first on the screen
    expect(open.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens Safari with the answers in the link', async () => {
    installGoogle();
    window.history.replaceState(null, '', '/borsch/abc/evaluations');
    sessionStorage.setItem('nb:quest-draft:rate:abc', JSON.stringify({ version: 1, step: 9, values: { answers: { overall: 8 }, comment: '' } }));
    const assigned = [];
    const realLocation = window.location;
    delete window.location;
    window.location = { ...realLocation, href: realLocation.href, pathname: realLocation.pathname };
    Object.defineProperty(window.location, 'href', {
      get: () => realLocation.href,
      set: (v) => assigned.push(v),
      configurable: true,
    });
    try {
      renderAuth();
      await userEvent.click(screen.getByRole('button', { name: 'Відкрити в Safari' }));
    } finally {
      window.location = realLocation;
    }
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toMatch(/^x-safari-https:\/\/map\.navernyborshchu\.com\/borsch\/abc\/evaluations\?nb_handoff=[A-Za-z0-9_-]+$/);
    expect(track).toHaveBeenCalledWith('auth_open_in_browser', { app: 'Threads', os: 'ios', scheme: true });
  });

  it('copies the link for the ⋯ menu route', async () => {
    installGoogle();
    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAuth();
    await userEvent.click(screen.getByRole('button', { name: 'Скопіювати посилання' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Скопійовано/ })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/map\.navernyborshchu\.com\//));
  });
});
