import { selectProfileLinks } from './profileLinks';

const profileLinks = [
  { label: 'Personal information' },
  { label: 'Log out', type: 'button' },
];
const settingsLinks = [{ label: 'Help' }];

it('includes logout in the mobile profile tab', () => {
  expect(selectProfileLinks({
    isDesktop: false,
    activeButton: 'profile',
    profileLinks,
    settingsLinks,
  })).toContainEqual(expect.objectContaining({ type: 'button' }));
});

it('includes logout in the desktop combined list', () => {
  expect(selectProfileLinks({
    isDesktop: true,
    activeButton: 'settings',
    profileLinks,
    settingsLinks,
  })).toContainEqual(expect.objectContaining({ type: 'button' }));
});
