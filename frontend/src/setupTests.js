// CRA loads this before every test file.
// jest-dom gives the DOM matchers (toBeInTheDocument, toBeDisabled, …).
import '@testing-library/jest-dom';

// jsdom ships no TextEncoder/TextDecoder, but react-router v7 touches them at
// import time — so any test that renders a component anywhere near the router
// died with "TextEncoder is not defined" before its first assertion.
import { TextEncoder, TextDecoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
