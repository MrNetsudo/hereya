/**
 * Hereya — WelcomeCard
 * Slides up when presence is confirmed at a venue.
 * Shows venue info, live headcount (anonymous), and AI vibe summary.
 * Auto-enters after 8 seconds.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { VenueIcon } from './VenueIcon';
import * as api from '../lib/api';

export interface WelcomeCardProps {
  venueId: string;
  venueName: string;
  venueCategory: string;
  venueAddress?: string;
  occupancy: number;
  welcomeMessage?: string;
  roomId: string;
  onEnter: () => void;
  onDismiss: () => void;
}

const AUTO_ENTER_SECS = 8;

export function WelcomeCard({
  venueId,
  venueName,
  venueCategory,
  venueAddress,
  occupancy,
  welcomeMessage,
  onEnter,
  onDismiss,
}: WelcomeCardProps) {
  const slideAnim = useRef(new Animated.Value(700)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const vibeFade  = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  const [vibe, setVibe] = useState<string | null>(null);
  const [vibeLoading, setVibeLoading] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_ENTER_SECS);

  // Slide up + backdrop fade in
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 55,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Fetch AI vibe
  useEffect(() => {
    api.venues.vibe(venueId)
      .then((r) => {
        setVibe(r.vibe);
        Animated.timing(vibeFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();
      })
      .catch(() => setVibe(null))
      .finally(() => setVibeLoading(false));
  }, [venueId]);

  // Countdown progress + auto-enter
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: AUTO_ENTER_SECS * 1000,
      useNativeDriver: false,
    }).start();

    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setTimeout(() => onEnter(), 0);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Animated border to show countdown progress
  const ringBorder = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(108,99,255,0.2)', 'rgba(108,99,255,0.9)'],
  });

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible>
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: fadeAnim }]} />

      {/* Card slides up from bottom */}
      <View style={s.centerer}>
        <Animated.View style={[s.card, { transform: [{ translateY: slideAnim }] }]}>

          {/* Venue icon */}
          <View style={s.iconWrap}>
            <VenueIcon category={venueCategory} size={40} />
          </View>

          {/* Venue name + address */}
          <Text style={s.venueName} numberOfLines={2}>{venueName}</Text>
          {venueAddress ? (
            <Text style={s.address} numberOfLines={1}>{venueAddress}</Text>
          ) : null}

          {/* Live occupancy — headcount only, fully anonymous */}
          <View style={s.occRow}>
            <Animated.View style={[s.occDot, { opacity: fadeAnim }]} />
            <Text style={s.occText}>
              {occupancy > 0
                ? `${occupancy} ${occupancy === 1 ? 'person' : 'people'} here right now`
                : 'Be the first one here'}
            </Text>
          </View>

          {/* AI vibe summary */}
          <View style={s.vibeBox}>
            {vibeLoading ? (
              <ActivityIndicator size="small" color="#6C63FF" />
            ) : vibe ? (
              <Animated.Text style={[s.vibeText, { opacity: vibeFade }]}>
                "{vibe}"
              </Animated.Text>
            ) : null}
          </View>

          {/* Partner welcome message */}
          {welcomeMessage ? (
            <View style={s.welcomeBox}>
              <Text style={s.welcomeText}>{welcomeMessage}</Text>
            </View>
          ) : null}

          {/* Enter button with countdown ring */}
          <Animated.View style={[s.enterBtnWrap, { borderColor: ringBorder }]}>
            <TouchableOpacity style={s.enterBtn} onPress={onEnter} activeOpacity={0.85}>
              <Text style={s.enterText}>Enter the Room →</Text>
              <Text style={s.countdownText}>{countdown}s</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Dismiss */}
          <TouchableOpacity style={s.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={s.dismissText}>Maybe later</Text>
          </TouchableOpacity>

        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  centerer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  card: {
    backgroundColor: '#111',
    marginHorizontal: 12,
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e2e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(108,99,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.25)',
  },
  venueName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.2,
    lineHeight: 32,
  },
  address: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  occRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
  },
  occDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  occText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  vibeBox: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
    paddingHorizontal: 8,
  },
  vibeText: {
    color: '#777',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
  welcomeBox: {
    backgroundColor: 'rgba(108,99,255,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#6C63FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    width: '100%',
    marginBottom: 22,
  },
  welcomeText: {
    color: '#999',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  enterBtnWrap: {
    borderRadius: 32,
    borderWidth: 2,
    marginBottom: 14,
  },
  enterBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 30,
    paddingHorizontal: 36,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  enterText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  countdownText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  dismissText: {
    color: '#444',
    fontSize: 14,
  },
});
