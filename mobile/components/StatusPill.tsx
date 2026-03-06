import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type RoomStatus = 'active' | 'warming' | 'cooling' | 'inactive' | string;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active: {
    label: 'Active',
    color: '#4CAF50',
    bg: 'rgba(76, 175, 80, 0.12)',
    border: 'rgba(76, 175, 80, 0.3)',
  },
  warming: {
    label: 'Warming Up',
    color: '#FF9800',
    bg: 'rgba(255, 152, 0, 0.12)',
    border: 'rgba(255, 152, 0, 0.3)',
  },
  cooling: {
    label: 'Cooling Down',
    color: '#03A9F4',
    bg: 'rgba(3, 169, 244, 0.12)',
    border: 'rgba(3, 169, 244, 0.3)',
  },
  inactive: {
    label: 'Quiet',
    color: '#888888',
    bg: 'rgba(136, 136, 136, 0.1)',
    border: 'rgba(136, 136, 136, 0.2)',
  },
};

interface StatusPillProps {
  status: RoomStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.inactive;

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: config.bg, borderColor: config.border },
      ]}
    >
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    borderWidth: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
