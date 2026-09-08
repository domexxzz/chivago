/**
 * The band that says the server is not checking where anybody is.
 *
 * `CHIVAGO_FENCE_OFF=1` opens the geofence on the server so a check-in, a
 * quest arrival and a story are accepted from anywhere. That is a deliberate
 * switch and it is sometimes the right one, but the app claims presence in a
 * dozen places - the visitor count, the passport, the companions, the Green
 * Points an auditor is asked to trust - and every one of those claims is
 * weaker while it is on.
 *
 * So it is not a small grey note. It is a band across the top of every
 * screen, in the colour the app uses for danger, and it does not dismiss.
 * The person looking at the screen should never have to wonder which mode
 * they are in, and neither should an audience.
 */

import React from 'react';
import { View } from 'react-native';
import { strings } from '@chivago/core';
import { color, onFill } from '../theme/index.ts';
import { Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export function UnfencedBand() {
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: color.accent2, paddingVertical: 6, paddingHorizontal: 12 }}
    >
      <Label
        size={10}
        tracking={0.06}
        colour={onFill.accent2}
        style={{ textAlign: 'center', textTransform: 'none' }}
      >
        {t(strings.place.unfenced)}
      </Label>
    </View>
  );
}
