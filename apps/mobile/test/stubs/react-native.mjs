/**
 * `react-native-web`, with two substitutions.
 *
 * Its `Modal` renders through a DOM portal into `document.body`. There is no
 * DOM here, so a mounted sheet came back as an empty tree and every assertion
 * about ComposeSheet, ReportSheet and AppealSheet failed for a reason that had
 * nothing to do with the sheets.
 *
 * The replacement honours `visible` and otherwise passes children through, so
 * a test sees exactly what a phone would once the sheet is up. What it does
 * NOT model is the modal-ness: focus trapping, the back-button dismiss, or
 * anything below it being unreachable.
 *
 * `TextInput` reaches for `document` in a mount effect, for the same reason.
 * The replacement keeps the props a test drives it through — `value`,
 * `onChangeText`, `accessibilityLabel` — and renders the current value as text
 * so an assertion can see what is in the field. What it does NOT model is
 * anything about editing: selection, the keyboard, IME composition, or
 * `maxLength` being enforced by the platform rather than by us.
 */
import { createElement } from 'react';
import { Text, View } from 'react-native-web';

export * from 'react-native-web';
export { default } from 'react-native-web';

export const Modal = ({ visible = true, children }) =>
  (visible ? createElement(View, null, children) : null);

export const TextInput = ({ value, onChangeText, accessibilityLabel, placeholder }) =>
  createElement(
    View,
    { accessibilityLabel, onChangeText, value },
    createElement(Text, null, value || placeholder || ''),
  );
