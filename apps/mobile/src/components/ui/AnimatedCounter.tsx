import React, { useEffect, useState, useCallback } from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import {
  useSharedValue,
  withTiming,
  Easing,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  style?: TextStyle;
  formatter?: (n: number) => string;
}

function formatValue(
  v: number,
  decimals: number,
  formatter?: (n: number) => string,
): string {
  if (formatter) return formatter(v);
  return decimals > 0
    ? v.toFixed(decimals)
    : Math.round(v).toLocaleString('id-ID');
}

export function AnimatedCounter({
  value,
  duration = 800,
  prefix = '',
  suffix = '',
  decimals = 0,
  style,
  formatter,
}: AnimatedCounterProps) {
  const animValue = useSharedValue(value);

  const [displayText, setDisplayText] = useState(
    () => `${prefix}${formatValue(value, decimals, formatter)}${suffix}`,
  );

  const updateText = useCallback(
    (v: number) => {
      setDisplayText(`${prefix}${formatValue(v, decimals, formatter)}${suffix}`);
    },
    [formatter, decimals, prefix, suffix],
  );

  useEffect(() => {
    animValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, animValue]);

  useAnimatedReaction(
    () => animValue.value,
    (current) => {
      runOnJS(updateText)(current);
    },
  );

  return (
    <Text style={[styles.text, style]}>
      {displayText}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
