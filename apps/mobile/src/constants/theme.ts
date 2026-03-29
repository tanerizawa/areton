import { Easing, Platform } from 'react-native';

export const API_URL = 'https://api.areton.id/api';

// ─── COLORS ────────────────────────────────────────────
export const COLORS = {
  // Brand
  gold: '#c9a96e',
  goldLight: '#e8d5a8',
  goldDark: '#a08347',
  goldGlow: '#c9a96e40',

  // Dark Theme Hierarchy
  dark: '#0b1120',
  darkElevated: '#0f1729',
  darkCard: '#131b2e',
  darkCardHover: '#182240',
  darkInput: '#1a2338',
  darkBorder: '#253048',
  darkSurface: '#1e2a45',

  // Text
  white: '#ffffff',
  textPrimary: '#f5f5f5',
  textSecondary: '#a0a8b8',
  textMuted: '#6b7280',
  textDisabled: '#4b5563',
  textInverse: '#0b1120',

  // Status
  success: '#22c55e',
  successLight: '#4ade80',
  error: '#ef4444',
  errorLight: '#f87171',
  warning: '#f59e0b',
  warningLight: '#fbbf24',
  info: '#3b82f6',
  infoLight: '#60a5fa',

  // Online Status
  online: '#22c55e',
  away: '#f59e0b',
  offline: '#6b7280',
} as const;

// ─── GRADIENT PRESETS ──────────────────────────────────
export const GRADIENTS = {
  gold: ['#c9a96e', '#e8d5a8'] as const,
  goldDark: ['#a08347', '#c9a96e'] as const,
  darkFade: ['#0b1120', '#131b2e'] as const,
  cardShine: ['rgba(201,169,110,0.08)', 'rgba(201,169,110,0)'] as const,
  heroOverlay: ['transparent', 'rgba(11,17,32,0.85)'] as const,
  tierSilver: ['#C0C0C0', '#d9d9d9'] as const,
  tierGold: ['#FFD700', '#FFA500'] as const,
  tierPlatinum: ['#E5E4E2', '#c0bfbd'] as const,
  tierDiamond: ['#B9F2FF', '#7dd3fc'] as const,
};

// ─── TYPOGRAPHY ────────────────────────────────────────
export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
} as const;

export const TYPOGRAPHY = {
  displayLarge: { fontSize: 36, fontWeight: '800' as const, lineHeight: 44, letterSpacing: 0.5 },
  displaySmall: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  headingLarge: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32 },
  headingMedium: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  headingSmall: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  bodyLarge: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  overline: { fontSize: 11, fontWeight: '600' as const, lineHeight: 14, letterSpacing: 0.5 },
  micro: { fontSize: 10, fontWeight: '500' as const, lineHeight: 12 },
};

// ─── SPACING (8px Grid) ───────────────────────────────
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// ─── BORDER RADIUS ────────────────────────────────────
export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
};

// ─── SHADOWS ──────────────────────────────────────────
export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  gold: {
    shadowColor: '#c9a96e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
};

// ─── ANIMATION TOKENS ─────────────────────────────────
export const ANIMATION = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  dramatic: 800,
  springBouncy: { damping: 8, stiffness: 120, mass: 0.5 },
  springSmooth: { damping: 15, stiffness: 100, mass: 1 },
  springGentle: { damping: 20, stiffness: 80, mass: 1.2 },
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
};

// ─── TIER CONFIG ──────────────────────────────────────
export const TIER_COLORS: Record<string, string> = {
  SILVER: '#C0C0C0',
  GOLD: '#FFD700',
  PLATINUM: '#E5E4E2',
  DIAMOND: '#B9F2FF',
};

export const TIER_GLOW: Record<string, string> = {
  SILVER: '#C0C0C020',
  GOLD: '#FFD70030',
  PLATINUM: '#E5E4E220',
  DIAMOND: '#B9F2FF30',
};

export const TIER_ICONS: Record<string, string> = {
  SILVER: '◇',
  GOLD: '◆',
  PLATINUM: '✦',
  DIAMOND: '💎',
};

// ─── SERVICE TYPES ────────────────────────────────────
export const SERVICE_TYPES = [
  { value: 'MEETING', label: 'Meeting', icon: 'people' },
  { value: 'DINNER', label: 'Dinner', icon: 'restaurant' },
  { value: 'EVENT', label: 'Event', icon: 'star' },
  { value: 'BUSINESS_ASSISTANT', label: 'Business', icon: 'briefcase' },
] as const;

export const SERVICE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  SERVICE_TYPES.map((s) => [s.value, s.label]),
);

// ─── STATUS COLORS ────────────────────────────────────
export const BOOKING_STATUS_COLORS: Record<string, string> = {
  PENDING: COLORS.warning,
  CONFIRMED: COLORS.info,
  ONGOING: COLORS.gold,
  COMPLETED: COLORS.success,
  CANCELLED: COLORS.textMuted,
  DISPUTED: COLORS.error,
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: COLORS.warning,
  ESCROW: COLORS.info,
  RELEASED: COLORS.success,
  REFUNDED: COLORS.textSecondary,
  FAILED: COLORS.error,
};

// ─── HELPERS ──────────────────────────────────────────
export const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Selamat Pagi';
  if (h < 15) return 'Selamat Siang';
  if (h < 18) return 'Selamat Sore';
  return 'Selamat Malam';
};

export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const API_BASE = 'https://api.areton.id';
export function resolvePhotoUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}
