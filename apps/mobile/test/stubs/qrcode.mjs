import React from 'react';

// The production package ships untranspiled JSX. Metro handles it, while the
// deliberately tiny Node screen harness does not. A QR's pixels are not part
// of these copy/interaction tests, so retain its value as inspectable data.
export default function QRCode({ value = '', ...props }) {
  return React.createElement('QRCode', { ...props, value });
}
