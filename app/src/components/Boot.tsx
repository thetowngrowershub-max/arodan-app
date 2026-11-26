import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Txt } from './ui';
import { colors } from '../theme';

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 30, gap: 14 }}>
      <Txt v="h2">Can't connect</Txt>
      <Txt style={{ textAlign: 'center' }} color={colors.muted}>Check your internet connection and try again. ({message})</Txt>
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}
