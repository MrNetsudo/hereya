/**
 * LOCI — Room Screen (Production UI)
 * Real-time chat room for a venue.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useNavigation, Stack, router } from 'expo-router';
import * as api from '../../lib/api';
import { subscribeToRoom } from '../../lib/supabase';
import type { Message, Room } from '../../lib/api';
import { Avatar } from '../components/Avatar';
import { StatusPill } from '../components/StatusPill';

const MAX_CHARS = 500;
const WARN_AT = 400;

export default function RoomScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [room, setRoom] = useState<Room | null>(null);
  const [venueName, setVenueName] = useState<string>('Room');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myDisplayName, setMyDisplayName] = useState<string>('');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const newMsgBannerAnim = useRef(new Animated.Value(0)).current;

  // ── Show/hide new messages banner ────────────────────────
  useEffect(() => {
    Animated.spring(newMsgBannerAnim, {
      toValue: newMsgCount > 0 && !isAtBottom ? 1 : 0,
      tension: 60,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [newMsgCount, isAtBottom]);

  const scrollToLatest = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewMsgCount(0);
  };

  // ── Load room + message history ──────────────────────────
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const joinResult = await api.rooms.join(roomId);
        setRoom(joinResult.room);
        setMyDisplayName(joinResult.member.display_name);

        const msgRes = await api.messages.list(roomId);
        setMessages(msgRes.messages);
      } catch (e: unknown) {
        const err = e as { error?: string };
        if (err.error === 'NOT_PRESENT') {
          router.back();
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      api.rooms.leave(roomId).catch(() => {});
      api.presence.leave('').catch(() => {});
      unsubscribeRef.current?.();
    };
  }, [roomId]);

  // ── Subscribe to real-time messages ──────────────────────
  useEffect(() => {
    if (!roomId) return;
    unsubscribeRef.current = subscribeToRoom(roomId, (payload) => {
      const newMsg = payload.new as Message;
      setMessages((prev) => {
        if (prev.find((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setIsAtBottom((atBottom) => {
        if (!atBottom) {
          setNewMsgCount((n) => n + 1);
        } else {
          // Auto-scroll to bottom (offset 0 in inverted list)
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 80);
        }
        return atBottom;
      });
    });
    return () => unsubscribeRef.current?.();
  }, [roomId]);

  // ── Send message ─────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending || !roomId) return;
    setSending(true);
    setInputText('');
    try {
      await api.messages.send(roomId, text);
    } catch (e: unknown) {
      const err = e as { error?: string };
      setInputText(text);
      if (err.error === 'NOT_PRESENT') {
        router.back();
      }
    } finally {
      setSending(false);
    }
  }, [inputText, sending, roomId]);

  // ── Scroll tracking ──────────────────────────────────────
  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offset = event.nativeEvent.contentOffset.y;
    const atBottom = offset < 80;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMsgCount(0);
  }, []);

  // Reversed messages for inverted FlatList (newest = index 0 = bottom of screen)
  const reversedMessages = [...messages].reverse();

  // ── Loading state ────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>Joining room…</Text>
      </View>
    );
  }

  // ── Room header content ──────────────────────────────────
  const occupancy = room?.occupancy ?? 0;
  const roomStatus = room?.status ?? 'active';

  return (
    <>
      <Stack.Screen
        options={{
          title: venueName,
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <Text style={styles.headerVenueName} numberOfLines={1}>{venueName}</Text>
              <View style={styles.headerMeta}>
                <View style={styles.occupancyDot} />
                <Text style={styles.headerOccupancy}>
                  {occupancy} {occupancy === 1 ? 'person' : 'people'} here
                </Text>
                <StatusPill status={roomStatus} />
              </View>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Message list (inverted — newest at bottom) */}
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => {
            const prevItem = reversedMessages[index + 1]; // older message
            const isOwnMessage = item.user?.display_name === myDisplayName;
            const isGroupStart = !prevItem || prevItem.user?.display_name !== item.user?.display_name;
            const isGroupEnd = index === 0 || reversedMessages[index - 1]?.user?.display_name !== item.user?.display_name;
            return (
              <MessageBubble
                message={item}
                isOwn={isOwnMessage}
                showSender={isGroupStart && !isOwnMessage}
                showTimestamp={isGroupEnd}
              />
            );
          }}
          contentContainerStyle={styles.messageList}
          inverted
          onScroll={onScroll}
          scrollEventThrottle={100}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyRoom}>
              <Text style={styles.emptyRoomEmoji}>👋</Text>
              <Text style={styles.emptyRoomText}>Be the first to say something</Text>
            </View>
          }
        />

        {/* New messages banner */}
        <Animated.View
          style={[
            styles.newMsgBanner,
            {
              opacity: newMsgBannerAnim,
              transform: [
                {
                  translateY: newMsgBannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-40, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={newMsgCount > 0 && !isAtBottom ? 'auto' : 'none'}
        >
          <TouchableOpacity style={styles.newMsgBtn} onPress={scrollToLatest} activeOpacity={0.85}>
            <Text style={styles.newMsgText}>
              {newMsgCount} new message{newMsgCount !== 1 ? 's' : ''} ↓
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={(t) => t.length <= MAX_CHARS && setInputText(t)}
              placeholder="Say something…"
              placeholderTextColor="#555"
              multiline
              maxLength={MAX_CHARS}
              returnKeyType="default"
              blurOnSubmit={false}
            />
            {inputText.length >= WARN_AT && (
              <Text
                style={[
                  styles.charCount,
                  inputText.length >= MAX_CHARS && styles.charCountLimit,
                ]}
              >
                {MAX_CHARS - inputText.length}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!inputText.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnIcon}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

// ── Message Bubble ───────────────────────────────────────
interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  showTimestamp: boolean;
}

function MessageBubble({ message, isOwn, showSender, showTimestamp }: MessageBubbleProps) {
  const senderName = message.user?.display_name ?? 'Anonymous';
  const timestamp = formatRelativeTime(message.created_at);

  return (
    <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
      {/* Avatar — only for other users */}
      {!isOwn && (
        <View style={styles.avatarContainer}>
          {showSender ? (
            <Avatar name={senderName} size={30} />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
        </View>
      )}

      <View style={[styles.bubbleContainer, isOwn && styles.bubbleContainerOwn]}>
        {/* Sender name — only for first msg in group, not own */}
        {showSender && !isOwn && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}

        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
            {message.content}
          </Text>
        </View>

        {/* Timestamp — only on last message in a group */}
        {showTimestamp && (
          <Text style={[styles.timestamp, isOwn && styles.timestampOwn]}>{timestamp}</Text>
        )}
      </View>
    </View>
  );
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    gap: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
  },

  // Custom header
  headerTitle: {
    flex: 1,
    justifyContent: 'center',
  },
  headerVenueName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  occupancyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  headerOccupancy: {
    color: '#888',
    fontSize: 12,
  },

  // Messages
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    paddingBottom: 4,
    gap: 2,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 1,
    paddingRight: 48,
  },
  bubbleRowOwn: {
    flexDirection: 'row-reverse',
    paddingRight: 0,
    paddingLeft: 48,
  },
  avatarContainer: {
    marginRight: 8,
    marginBottom: 4,
    width: 30,
  },
  avatarSpacer: {
    width: 30,
  },
  bubbleContainer: {
    maxWidth: '80%',
    alignItems: 'flex-start',
  },
  bubbleContainerOwn: {
    alignItems: 'flex-end',
  },
  senderName: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOther: {
    backgroundColor: '#1e1e2e',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  bubbleOwn: {
    backgroundColor: '#6C63FF',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    color: '#e8e8e8',
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextOwn: {
    color: '#fff',
  },
  timestamp: {
    color: '#444',
    fontSize: 10,
    marginTop: 3,
    marginLeft: 4,
  },
  timestampOwn: {
    marginLeft: 0,
    marginRight: 4,
  },

  // Empty state
  emptyRoom: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyRoomEmoji: {
    fontSize: 40,
  },
  emptyRoomText: {
    color: '#555',
    fontSize: 15,
    textAlign: 'center',
  },

  // New messages banner
  newMsgBanner: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  newMsgBtn: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  newMsgText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    backgroundColor: '#0a0a0a',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
  },
  input: {
    backgroundColor: '#111111',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    paddingRight: 50,
    color: '#fff',
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#1e1e2e',
    lineHeight: 20,
  },
  charCount: {
    position: 'absolute',
    right: 14,
    bottom: Platform.OS === 'ios' ? 12 : 8,
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
  },
  charCountLimit: {
    color: '#ff4444',
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    flexShrink: 0,
  },
  sendBtnDisabled: {
    backgroundColor: '#2a2a2a',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendBtnIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
