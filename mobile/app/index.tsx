/**
 * LOCI — Home Screen (Production UI)
 * Detects location → checks presence → shows nearby venues or drops you into a room.
 */

import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocation } from '../lib/useLocation';
import * as api from '../lib/api';
import type { Venue, PresenceResult } from '../lib/api';
import { LiveBadge } from './components/LiveBadge';
import { VenueIcon } from './components/VenueIcon';

const TOKEN_KEY = '@loci_token';

// Extend Venue type to include optional distance from API
type VenueWithDistance = Venue & { distance_meters?: number };

export default function HomeScreen() {
  const location = useLocation(30_000);
  const [initialized, setInitialized] = useState(false);
  const [presence, setPresence] = useState<PresenceResult | null>(null);
  const [venues, setVenues] = useState<VenueWithDistance[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusText, setStatusText] = useState('Finding your location…');
  const [atVenue, setAtVenue] = useState<{ name: string; roomId: string } | null>(null);

  // Animations
  const scanPulse = useRef(new Animated.Value(1)).current;
  const bannerSlide = useRef(new Animated.Value(-80)).current;
  const countdownRef = useRef(5);
  const [countdown, setCountdown] = useState(5);

  // Pulsing scan animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(scanPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanPulse]);

  // Slide banner in when at venue
  useEffect(() => {
    if (atVenue) {
      Animated.spring(bannerSlide, {
        toValue: 0,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }).start();
    }
  }, [atVenue]);

  // ── Initialize: get or create anonymous session ──────────
  useEffect(() => {
    (async () => {
      try {
        let token = await AsyncStorage.getItem(TOKEN_KEY);
        if (!token) {
          const deviceId = Math.random().toString(36).slice(2);
          const res = await api.auth.anonymous(deviceId);
          token = res.token;
          await AsyncStorage.setItem(TOKEN_KEY, token);
        }
        api.setToken(token);
        setInitialized(true);
      } catch {
        setStatusText('Failed to initialize. Check your connection.');
      }
    })();
  }, []);

  // ── Check presence whenever location updates ─────────────
  useEffect(() => {
    if (!initialized || !location.latitude || !location.longitude) return;
    checkPresence();
  }, [initialized, location.latitude, location.longitude]);

  const checkPresence = async () => {
    if (!location.latitude || !location.longitude) return;
    try {
      setStatusText('Checking nearby venues…');
      const result = await api.presence.check(
        location.latitude,
        location.longitude,
        location.accuracy ?? undefined
      );
      setPresence(result);

      if (result.is_present && result.room_id && result.venue) {
        setAtVenue({ name: result.venue.name, roomId: result.room_id });
        startCountdown(result.room_id);
      } else {
        setAtVenue(null);
        loadNearbyVenues();
      }
    } catch {
      setStatusText('Could not check venue. Retrying…');
    }
  };

  const startCountdown = (roomId: string) => {
    countdownRef.current = 5;
    setCountdown(5);
    const interval = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        clearInterval(interval);
        router.push(`/room/${roomId}`);
      }
    }, 1000);
  };

  const loadNearbyVenues = async () => {
    if (!location.latitude || !location.longitude) return;
    try {
      const res = await api.venues.nearby(location.latitude, location.longitude, 1000);
      setVenues(res.venues as VenueWithDistance[]);
      if (res.venues.length > 0) {
        setStatusText(`${res.venues.length} venue${res.venues.length > 1 ? 's' : ''} nearby`);
      } else {
        setStatusText('No venues found nearby');
      }
    } catch {
      setStatusText('Could not load venues');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await checkPresence();
    setRefreshing(false);
  };

  const joinVenueRoom = (venue: VenueWithDistance) => {
    // Navigate to presence check for this venue (will join room on arrival)
    router.push(`/room/${venue.id}`);
  };

  // ── Render: Loading ──────────────────────────────────────
  if (location.loading || !initialized) {
    return (
      <View style={styles.center}>
        <View style={styles.scanContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Animated.View style={[styles.scanRing, { opacity: scanPulse }]} />
        </View>
        <Text style={styles.loadingTitle}>Scanning nearby venues…</Text>
        <Text style={styles.loadingSubtext}>Make sure location is enabled</Text>
      </View>
    );
  }

  // ── Render: GPS Error ────────────────────────────────────
  if (location.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>📍</Text>
        <Text style={styles.errorTitle}>Location Required</Text>
        <Text style={styles.errorSubtext}>{location.error}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => checkPresence()}>
          <Text style={styles.primaryBtnText}>Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* At-venue banner */}
      {atVenue && (
        <Animated.View style={[styles.venueBanner, { transform: [{ translateY: bannerSlide }] }]}>
          <View style={styles.venueBannerLeft}>
            <Text style={styles.venueBannerIcon}>📍</Text>
            <View>
              <Text style={styles.venueBannerTitle}>You're at {atVenue.name}</Text>
              <Text style={styles.venueBannerSub}>Joining room in {countdown}s…</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.joinNowBtn}
            onPress={() => router.push(`/room/${atVenue.roomId}`)}
          >
            <Text style={styles.joinNowText}>Join Now</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Header area */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Nearby Venues</Text>
          <Text style={styles.headerSubtitle}>Join the conversation around you</Text>
        </View>
        {location.accuracy && (
          <View style={styles.accuracyPill}>
            <Animated.View style={[styles.accuracyDot, { opacity: scanPulse }]} />
            <Text style={styles.accuracyText}>±{Math.round(location.accuracy)}m</Text>
          </View>
        )}
      </View>

      {/* Venue list */}
      {venues.length > 0 ? (
        <FlatList
          data={venues}
          keyExtractor={(v) => v.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6C63FF"
              colors={['#6C63FF']}
            />
          }
          renderItem={({ item }) => (
            <VenueCard venue={item} onPress={() => joinVenueRoom(item)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>No venues nearby</Text>
          <Text style={styles.emptySubtext}>
            Walk to a bar, stadium, or event{'\n'}to join a live chat room
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onRefresh}>
            <Text style={styles.primaryBtnText}>
              {refreshing ? 'Searching…' : 'Refresh'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Venue Card ───────────────────────────────────────────
interface VenueCardProps {
  venue: VenueWithDistance;
  onPress: () => void;
}

function VenueCard({ venue, onPress }: VenueCardProps) {
  const isActive = ['active', 'warming'].includes(venue.room_status);
  const distanceM = venue.distance_meters;

  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.cardActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardIconContainer}>
        <VenueIcon category={venue.category} size={24} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.venueName} numberOfLines={1}>{venue.name}</Text>
          {distanceM !== undefined && (
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceText}>{formatDistance(distanceM)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.venueCategory}>
          {venue.category.charAt(0).toUpperCase() + venue.category.slice(1)}
        </Text>
      </View>

      <View style={styles.cardRight}>
        <LiveBadge count={isActive ? venue.occupancy : 0} size="sm" />
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#0a0a0a',
  },

  // Loading
  scanContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  scanRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#6C63FF',
  },
  loadingTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },

  // Error
  errorIcon: { fontSize: 52, marginBottom: 16 },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorSubtext: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },

  // At-venue banner
  venueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108, 99, 255, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  venueBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  venueBannerIcon: { fontSize: 22 },
  venueBannerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  venueBannerSub: {
    color: '#6C63FF',
    fontSize: 12,
    marginTop: 1,
  },
  joinNowBtn: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginLeft: 12,
  },
  joinNowText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  accuracyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 50,
    gap: 5,
  },
  accuracyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  accuracyText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },

  // Venue list
  list: {
    padding: 16,
    gap: 10,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e2e',
    gap: 12,
  },
  cardActive: {
    borderColor: 'rgba(108, 99, 255, 0.25)',
    shadowColor: 'rgba(108, 99, 255, 0.15)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardIconContainer: {
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  venueName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  venueCategory: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  distanceBadge: {
    backgroundColor: 'rgba(136, 136, 136, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    flexShrink: 0,
  },
  distanceText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  cardRight: {
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
  },
  chevron: {
    color: '#444',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
