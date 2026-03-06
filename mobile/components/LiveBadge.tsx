import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface LiveBadgeProps {
  count: number;
  size?: 'sm' | 'md';
}

export function LiveBadge({ count, size = 'md' }: LiveBadgeProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const isSmall = size === 'sm';

  if (count === 0) {
    return (
      <View style={styles.emptyBadge}>
        <View style={styles.emptyDot} />
        <Text style={styles.emptyText}>Empty</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, isSmall && styles.badgeSm]}>
      <Animated.View style={[styles.dot, isSmall && styles.dotSm, { opacity: pulse }]} />
      <Text style={[styles.text, isSmall && styles.textSm]}>
        {count} live
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 50,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  dotSm: {
    width: 5,
    height: 5,
  },
  text: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 11,
  },
  emptyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(68, 68, 68, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 50,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(68, 68, 68, 0.4)',
  },
  emptyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#444',
  },
  emptyText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
});
