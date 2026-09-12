export const selectProfileLinks = ({
  isDesktop,
  activeButton,
  profileLinks,
  settingsLinks,
}) => {
  if (isDesktop) return [...profileLinks, ...settingsLinks];
  return activeButton === 'profile' ? profileLinks : settingsLinks;
};
