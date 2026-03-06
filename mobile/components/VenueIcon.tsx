import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CATEGORY_ICONS: Record<string, string> = {
  bar: '🍺',
  pub: '🍺',
  nightclub: '🎉',
  club: '🎉',
  stadium: '🏟️',
  arena: '🏟️',
  sports: '🏟️',
  concert: '🎵',
  music: '🎵',
  festival: '🎵',
  theater: '🎭',
  theatre: '🎭',
  restaurant: '🍽️',
  cafe: '☕',
  coffee: '☕',
  food: '🍽️',
  shop: '🏪',
  store: '🏪',
  mall: '🛍️',
  hotel: '🏨',
  park: '🌳',
  beach: '🏖️',
  gym: '💪',
  fitness: '💪',
  church: '⛪',
  school: '🏫',
  university: '🎓',
  museum: '🏛️',
  airport: '✈️',
  hospital: '🏥',
};

interface VenueIconProps {
  category: string;
  size?: number;
}

export function VenueIcon({ category, size = 28 }: VenueIconProps) {
  const lowerCat = category.toLowerCase();
  let emoji = '📍';

  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lowerCat.includes(key)) {
      emoji = icon;
      break;
    }
  }

  return (
    <View style={[styles.container, { width: size + 16, height: size + 16 }]}>
      <Text style={{ fontSize: size * 0.75 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.2)',
  },
});
