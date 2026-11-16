import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { VenuePicker } from './VenuePicker';

jest.mock('react-router-dom', () => require('react-router'));
// the Maps script is «loaded»; google.maps.places is whatever a test puts on window
let mockMapsLoaded = true;
jest.mock('../../services/googleMaps', () => ({ useGoogleMaps: () => ({ isLoaded: mockMapsLoaded, loadError: undefined }) }));

/**
 * Abroad (Tokyo, 11.2026): «Я пробую відмітити ресторан… А воно пише локації
 * не знайдено і Київ». Our map has nothing there, Google has everything. The
 * venue screen now shows Google's venues right in its list, where ours run
 * out: for what was typed, and around the phone.
 */

const TOKYO = { lat: 35.6617, lng: 139.7041 };
const jsPlace = (id, name) => ({
  id,
  displayName: name,
  formattedAddress: `Japan, 〒150-0041 Tokyo, Shibuya, ${name}`,
  addressComponents: [
    { longText: 'Shibuya', types: ['locality'] },
    { longText: 'Tokyo', types: ['administrative_area_level_1'] },
    { longText: 'Japan', shortText: 'JP', types: ['country'] },
  ],
  location: { lat: () => 35.6618, lng: () => 139.7042 },
  fetchFields: jest.fn(async () => {}),
});

const mockGoogle = ({ suggestions = [], around = [] } = {}) => {
  const fetchAutocompleteSuggestions = jest.fn(async () => ({
    suggestions: suggestions.map((p) => ({
      placePrediction: {
        placeId: p.id, mainText: { text: p.displayName }, secondaryText: { text: 'Shibuya, Tokyo, Japan' }, types: ['restaurant'],
      },
    })),
  }));
  const searchNearby = jest.fn(async () => ({ places: around }));
  function Place({ id }) { return suggestions.find((p) => p.id === id); }
  Place.searchNearby = searchNearby;
  window.google = {
    maps: {
      places: {
        AutocompleteSessionToken: function Token() {},
        AutocompleteSuggestion: { fetchAutocompleteSuggestions },
        Place,
      },
    },
  };
  return { fetchAutocompleteSuggestions, searchNearby };
};

const ourVenue = { place: { id: 'p1', name: 'Ватра', address: 'вул. Городецького, 4', city: 'Київ' }, distance: 120 };

const Harness = ({ geo, nearest = [], ownResults = [], google, onPick = () => {} }) => {
  const { useState } = jest.requireActual('react');
  const [query, setQuery] = useState('');
  const results = query.trim() ? ownResults : [];
  return (
    <VenuePicker
      nearby={{ geo, nearest, query, setQuery, results }}
      titles={{ here: 'Ти зараз тут?', where: 'Де ти?' }}
      onPick={onPick}
      google={google}
    />
  );
};

const renderPicker = (props) => render(<I18nProvider><Harness {...props} /></I18nProvider>);

beforeEach(() => localStorage.setItem('lang', 'uk'));
afterEach(() => { delete window.google; mockMapsLoaded = true; });

describe('typed, and our map has no such venue', () => {
  it('Google finds it in the same list, under its own heading, and a tap picks it', async () => {
    const { fetchAutocompleteSuggestions } = mockGoogle({ suggestions: [jsPlace('g-ichiran', 'ICHIRAN Shibuya')] });
    const onGooglePick = jest.fn();
    const user = userEvent.setup();
    renderPicker({ geo: { status: 'denied', point: null }, google: { near: null, onPick: onGooglePick } });

    await user.type(screen.getByRole('searchbox'), 'Ichiran');
    expect(screen.getByText('Такого закладу в нас ще нема.')).toBeInTheDocument();
    const block = await screen.findByTestId('google-inline');
    expect(within(block).getByRole('heading', { name: 'Знайшли в Google' })).toBeInTheDocument();
    expect(within(block).getByText('Результати Google')).toBeInTheDocument();
    await user.click(within(block).getByRole('button', { name: /ICHIRAN Shibuya/ }));

    await waitFor(() => expect(onGooglePick).toHaveBeenCalledTimes(1));
    // the venue as every Google pick hands it on: in English abroad, Tokyo as its city
    expect(onGooglePick.mock.calls[0][0]).toMatchObject({
      googlePlaceId: 'g-ichiran', name: 'ICHIRAN Shibuya', city: 'Tokyo', country: 'Japan',
    });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({ input: 'Ichiran' }));
  });

  it('our own match first: Google is not asked', async () => {
    const { fetchAutocompleteSuggestions } = mockGoogle({ suggestions: [jsPlace('g1', 'Vatra')] });
    const user = userEvent.setup();
    renderPicker({ geo: { status: 'denied', point: null }, ownResults: [ourVenue], google: { onPick: jest.fn() } });
    await user.type(screen.getByRole('searchbox'), 'Ватра');
    expect(screen.getByRole('button', { name: /Ватра/ })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByTestId('google-inline')).not.toBeInTheDocument();
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();
  });

  it('without the google prop the screen is as it was', async () => {
    mockGoogle({ suggestions: [jsPlace('g1', 'ICHIRAN Shibuya')] });
    const user = userEvent.setup();
    renderPicker({ geo: { status: 'denied', point: null } });
    await user.type(screen.getByRole('searchbox'), 'Ichiran');
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByTestId('google-inline')).not.toBeInTheDocument();
  });
});

describe('the phone is somewhere our map has nothing', () => {
  it('Google\'s eating places around it, with distances, under «Поруч у Google»', async () => {
    const { searchNearby } = mockGoogle({ around: [jsPlace('g-a', 'Afuri Ebisu'), jsPlace('g-b', 'Fuunji')] });
    const onGooglePick = jest.fn();
    const user = userEvent.setup();
    renderPicker({ geo: { status: 'ok', point: TOKYO }, google: { near: TOKYO, onPick: onGooglePick } });

    expect(screen.getByText('Поруч нема закладів з нашої мапи. Знайди свій пошуком або додай новий.')).toBeInTheDocument();
    const block = await screen.findByTestId('google-inline');
    expect(within(block).getByRole('heading', { name: 'Поруч у Google' })).toBeInTheDocument();
    expect(within(block).getAllByTestId('google-near-option')).toHaveLength(2);
    expect(searchNearby).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }));
    await user.click(within(block).getByRole('button', { name: /Fuunji/ }));
    expect(onGooglePick).toHaveBeenCalledWith(expect.objectContaining({ googlePlaceId: 'g-b', city: 'Tokyo' }));
  });

  it('the Maps script still loading when the screen opens: Google is asked once it is there', async () => {
    const { searchNearby } = mockGoogle({ around: [jsPlace('g-a', 'Afuri Ebisu')] });
    mockMapsLoaded = false;
    const ui = (n) => <I18nProvider><Harness key="h" geo={{ status: 'ok', point: TOKYO }} google={{ near: TOKYO, onPick: jest.fn() }} n={n} /></I18nProvider>;
    const { rerender } = render(ui(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(searchNearby).not.toHaveBeenCalled();
    mockMapsLoaded = true;
    rerender(ui(2));
    expect(await screen.findByTestId('google-near-option')).toHaveTextContent('Afuri Ebisu');
    expect(searchNearby).toHaveBeenCalledTimes(1);
  });

  it('our venues nearby: Google is not asked', async () => {
    const { searchNearby } = mockGoogle({ around: [jsPlace('g-a', 'Afuri')] });
    renderPicker({ geo: { status: 'ok', point: { lat: 50.45, lng: 30.52 } }, nearest: [ourVenue], google: { onPick: jest.fn() } });
    expect(screen.getByRole('heading', { name: 'Ти зараз тут?' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(searchNearby).not.toHaveBeenCalled();
    expect(screen.queryByTestId('google-inline')).not.toBeInTheDocument();
  });

  it('location denied: nothing to ask Google about until something is typed', async () => {
    const { searchNearby } = mockGoogle({ around: [jsPlace('g-a', 'Afuri')] });
    renderPicker({ geo: { status: 'denied', point: null }, google: { onPick: jest.fn() } });
    await new Promise((r) => setTimeout(r, 50));
    expect(searchNearby).not.toHaveBeenCalled();
  });
});
