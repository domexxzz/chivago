import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Anchor, Cloud, CloudRain, Thermometer, Waves } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

export type WeatherCategoryKey = 'waves' | 'temp' | 'weather' | 'rain' | 'port';

export interface WeatherCategoryItem {
  key: WeatherCategoryKey;
  label: string;
  icon: LucideIcon;
}

export const WEATHER_CATEGORIES: WeatherCategoryItem[] = [
  { key: 'waves', label: 'คลื่นลม', icon: Waves },
  { key: 'temp', label: 'อุณหภูมิ', icon: Thermometer },
  { key: 'weather', label: 'อากาศ', icon: Cloud },
  { key: 'rain', label: 'ปริมาณฝน', icon: CloudRain },
  { key: 'port', label: 'การท่าเรือ', icon: Anchor },
];

export function WeatherCategoriesBar({
  selected = 'waves',
  onSelect,
}: {
  selected?: WeatherCategoryKey;
  onSelect?: (key: WeatherCategoryKey) => void;
}) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {WEATHER_CATEGORIES.map((item) => {
        const isSelected = item.key === selected;
        const IconComponent = item.icon;
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect?.(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={item.label}
            style={[
              styles.tabItem,
              isSelected ? styles.tabItemSelected : styles.tabItemUnselected,
            ]}
          >
            <IconComponent
              size={20}
              color={isSelected ? '#FFFFFF' : '#52749D'}
              strokeWidth={isSelected ? 2.4 : 2}
            />
            <Text
              style={[
                styles.tabLabel,
                isSelected ? styles.tabLabelSelected : styles.tabLabelUnselected,
              ]}
              numberOfLines={1}
            >
              {item.label}
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
    paddingHorizontal: 16,
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
