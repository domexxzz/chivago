/**
 * The sea-and-sky tabs, and the reading behind whichever is chosen.
 *
 * WHAT THIS USED TO BE. A bar of five tabs - waves, temp, weather, rain,
 * port - wired to nothing, in a file nothing imported, beside a card whose
 * wave height and wind speed were written into the JSX. On the day they were
 * replaced the real reading was 0.1 m and 3 knots against the card's
 * "1.2 - 2.0 m, 10-20 kts". Now every figure here comes off Open-Meteo
 * through the API, carries the moment it was read, and is absent when it was
 * not read.
 *
 * There is no port tab: the app has no ferry or harbour feed, and a tab that
 * cannot answer looks like a service that is broken.
 *
 * Only tabs the reading can fill are offered, so inland - where there is no
 * sea - the waves tab is not there at all rather than there and empty.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Cloud, CloudRain, Thermometer, Waves } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  categoriesFor, strings, weatherDescription,
  type AreaWeather, type Bilingual, type WeatherCategoryKey,
} from '@chivago/core';
import { t } from '../i18n/locale.ts';

const ICONS: Record<WeatherCategoryKey, LucideIcon> = {
  waves: Waves, temp: Thermometer, weather: Cloud, rain: CloudRain,
};

const LABELS: Record<WeatherCategoryKey, Bilingual> = {
  waves: strings.place.weatherWaves,
  temp: strings.place.weatherTemp,
  weather: strings.place.weatherWeather,
  rain: strings.place.weatherRain,
};

/** One decimal for a wave, none for a wind: the feed's own precision, not more. */
const one = (n: number) => n.toFixed(1);
const whole = (n: number) => Math.round(n).toString();

/**
 * What the chosen category says, from the reading alone.
 *
 * Returns null when the reading cannot fill it - the caller then shows
 * nothing rather than a nought. Nothing here is computed from anything else:
 * a wave is the wave the service gave.
 */
export function categoryLine(w: AreaWeather, key: WeatherCategoryKey): string | null {
  switch (key) {
    case 'waves': {
      if (w.waveHeightM === null) return null;
      const height = t(strings.place.weatherWaveHeight(one(w.waveHeightM)));
      const period = w.wavePeriodS === null ? '' : ` · ${t(strings.place.weatherWavePeriod(one(w.wavePeriodS)))}`;
      const wind = w.windKn === null ? '' : ` · ${t(strings.place.weatherWind(whole(w.windKn)))}`;
      return `${height}${period}${wind}`;
    }
    case 'temp':
      return w.tempC === null ? null : t(strings.place.weatherTempNow(one(w.tempC)));
    case 'weather': {
      const d = weatherDescription(w.weatherCode);
      return d === null ? null : t(d);
    }
    case 'rain':
      if (w.rainMm === null) return null;
      return w.rainMm === 0 ? t(strings.place.weatherNoRain) : t(strings.place.weatherRainNow(one(w.rainMm)));
  }
}

export function WeatherCategoriesBar({
  weather,
  selected,
  onSelect,
}: {
  weather: AreaWeather;
  selected: WeatherCategoryKey;
  onSelect?: (key: WeatherCategoryKey) => void;
}) {
  // Only what this reading can actually answer.
  const offered = categoriesFor(weather);
  if (offered.length === 0) return null;
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {offered.map((key) => {
        const isSelected = key === selected;
        const IconComponent = ICONS[key];
        const line = categoryLine(weather, key);
        return (
          <Pressable
            key={key}
            onPress={() => onSelect?.(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            // The figure is spoken with the name, so a screen reader does not
            // have to select a tab to learn what it holds.
            accessibilityLabel={line ? `${t(LABELS[key])}, ${line}` : t(LABELS[key])}
            style={[styles.tabItem, isSelected ? styles.tabItemSelected : styles.tabItemUnselected]}
          >
            <IconComponent
              size={20}
              color={isSelected ? '#FFFFFF' : '#52749D'}
              strokeWidth={isSelected ? 2.4 : 2}
            />
            <Text
              style={[styles.tabLabel, isSelected ? styles.tabLabelSelected : styles.tabLabelUnselected]}
              numberOfLines={1}
            >
              {t(LABELS[key])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  tabItem: {
    flex: 1,
    height: 66,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tabItemSelected: {
    backgroundColor: '#004C7F',
    borderWidth: 1,
    borderColor: '#003860',
    shadowColor: '#002B48',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 3,
  },
  tabItemUnselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E2EE',
    shadowColor: '#002B48',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 5,
    textAlign: 'center',
  },
  tabLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabLabelUnselected: {
    color: '#52749D',
    fontWeight: '600',
  },
});
