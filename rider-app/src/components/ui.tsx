import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, TextProps, View, ViewStyle } from 'react-native';
import { colors, font, radius } from '../theme';
import { Icon, IconName } from './Icon';

type V = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label';
export function Txt({ v = 'body', color, style, weight, ...rest }: TextProps & { v?: V; color?: string; weight?: keyof typeof font }) {
  return <Text {...rest} style={[t[v], color ? { color } : null, weight ? { fontFamily: font[weight] } : null, style]} />;
}

const t = StyleSheet.create({
  h1: { fontFamily: font.bold, fontSize: 28, lineHeight: 34, color: colors.ink, letterSpacing: -0.5 },
  h2: { fontFamily: font.bold, fontSize: 21, lineHeight: 27, color: colors.ink, letterSpacing: -0.3 },
  h3: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  body: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 21, color: colors.ink },
  small: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: colors.muted },
  label: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
});

export function Button({ title, onPress, kind = 'primary', icon, disabled, loading, style }: { title: string; onPress?: () => void; kind?: 'primary' | 'ghost' | 'accent' | 'soft'; icon?: IconName; disabled?: boolean; loading?: boolean; style?: ViewStyle }) {
  const bg = { primary: colors.primary, accent: colors.accent, ghost: 'transparent', soft: colors.tint }[kind];
  const fg = { primary: colors.onPrimary, accent: colors.onAccent, ghost: colors.primary, soft: colors.primary }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.pill, height: 54, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        kind === 'ghost' && { borderWidth: 1.5, borderColor: colors.line },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Icon name={icon} color={fg} size={20} />}
          <Txt v="h3" color={fg}>{title}</Txt>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, tint, onPress }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; tint?: boolean; onPress?: () => void }) {
  const s = [{ backgroundColor: tint ? colors.tint : colors.surface, borderRadius: radius.card, padding: 18 }, style];
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={s}>{children}</View>;
}

export function Chip({ label, active, onPress, emoji }: { label: string; active?: boolean; onPress?: () => void; emoji?: string }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 16, height: 40, borderRadius: radius.pill, backgroundColor: active ? colors.primary : colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {emoji ? <Text style={{ fontSize: 15 }}>{emoji}</Text> : null}
      <Txt v="body" weight="medium" color={active ? colors.onPrimary : colors.ink}>{label}</Txt>
    </Pressable>
  );
}

export function IconButton({ name, onPress, badge, bg = colors.surface }: { name: IconName; onPress?: () => void; badge?: number; bg?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} />
      {badge ? (
        <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Txt v="small" style={{ fontSize: 10.5, lineHeight: 13 }} color={colors.onPrimary} weight="bold">{badge}</Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Header({ title, onBack, right }: { title?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 }}>
      {onBack ? <IconButton name="back" onPress={onBack} /> : null}
      <Txt v="h2" style={{ flex: 1 }} numberOfLines={1}>{title}</Txt>
      {right}
    </View>
  );
}

export function Field({ label, hint, style, ...rest }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6, marginBottom: 14 }}>
      <Txt v="label">{label}</Txt>
      <TextInput
        placeholderTextColor="#94A39B"
        {...rest}
        style={[{ backgroundColor: colors.surface, borderRadius: radius.small, paddingHorizontal: 16, paddingVertical: 14, fontFamily: font.regular, fontSize: 15, color: colors.ink, minHeight: 52 }, rest.multiline && { minHeight: 84, textAlignVertical: 'top' }, style]}
      />
      {hint ? <Txt v="small">{hint}</Txt> : null}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

/** Small rounded label, e.g. "Bicycle", "Pay on delivery". */
export function Tag({ label, tone = 'plain', icon }: { label: string; tone?: 'plain' | 'primary' | 'accent'; icon?: IconName }) {
  const bg = { plain: colors.bg, primary: colors.tint, accent: colors.accent }[tone];
  const fg = { plain: colors.ink, primary: colors.primary, accent: colors.onAccent }[tone];
  return (
    <Row style={{ gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' }}>
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Txt v="small" weight="medium" color={fg}>{label}</Txt>
    </Row>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />;
}

/** Line in a list of amounts, e.g. "Delivery share  ₦1,560". */
export function AmountRow({ label, value, strong, note }: { label: string; value: string; strong?: boolean; note?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 4, gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Txt v={strong ? 'h3' : 'body'} color={strong ? colors.ink : colors.muted}>{label}</Txt>
        {note ? <Txt v="small">{note}</Txt> : null}
      </View>
      <Txt v={strong ? 'h2' : 'body'} weight={strong ? 'bold' : 'medium'}>{value}</Txt>
    </Row>
  );
}
