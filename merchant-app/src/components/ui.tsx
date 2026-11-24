import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, TextInput, TextInputProps, TextProps, View, ViewStyle } from 'react-native';
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

export function Stepper({ qty, onChange, small }: { qty: number; onChange: (q: number) => void; small?: boolean }) {
  const s = small ? 32 : 40;
  const b = (name: IconName, d: number) => (
    <Pressable onPress={() => onChange(qty + d)} hitSlop={6} style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: d > 0 ? colors.primary : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={small ? 16 : 18} color={d > 0 ? colors.onPrimary : colors.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3, gap: 8 }}>
      {b('minus', -1)}
      <Txt v="h3" style={{ minWidth: 18, textAlign: 'center' }}>{qty}</Txt>
      {b('plus', 1)}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

/** Product photo, or its emoji on a mint tile when there is no photo. */
export function Thumb({ uri, emoji, size = 56, h }: { uri?: string; emoji: string; size?: number; h?: number }) {
  const height = h ?? size;
  return (
    <View style={{ width: h ? '100%' : size, height, borderRadius: radius.small, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Text style={{ fontSize: Math.min(height, size) * 0.5 }}>{emoji}</Text>}
    </View>
  );
}

/** Small rounded label. tone: mango for attention (new orders, low stock), emerald for good news. */
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'primary' | 'tint' | 'danger' }) {
  const bg = { neutral: colors.surface, accent: colors.accent, primary: colors.primary, tint: colors.tint, danger: '#FDECE4' }[tone];
  const fg = { neutral: colors.muted, accent: colors.onAccent, primary: colors.onPrimary, tint: colors.primary, danger: colors.danger }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Txt v="small" weight="semibold" color={fg} style={{ fontSize: 11.5, lineHeight: 15 }}>{label}</Txt>
    </View>
  );
}

/** Pill-shaped segmented control with counts. */
export function Segments<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, gap: 4 }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable key={it.id} onPress={() => onChange(it.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: on ? colors.bg : 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, ...(on ? { shadowColor: '#0D1B15', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 } : {}) }}>
            <Txt v="small" weight="semibold" color={on ? colors.ink : colors.muted}>{it.label}</Txt>
            {it.count ? (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: on ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Txt v="small" weight="bold" color={on ? colors.onPrimary : colors.muted} style={{ fontSize: 11, lineHeight: 14 }}>{it.count}</Txt>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row style={{ gap: 12, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Txt v="h3">{label}</Txt>
        {hint ? <Txt v="small">{hint}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.primary, false: colors.line }} thumbColor={colors.bg} ios_backgroundColor={colors.line} />
    </Row>
  );
}

export function Empty({ emoji, title, text, children }: { emoji: string; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 8 }}>
      <Text style={{ fontSize: 44 }}>{emoji}</Text>
      <Txt v="h3" style={{ textAlign: 'center' }}>{title}</Txt>
      {text ? <Txt v="small" style={{ textAlign: 'center' }}>{text}</Txt> : null}
      {children}
    </View>
  );
}

export function ErrorText({ text }: { text?: string }) {
  return text ? <Txt v="small" color={colors.danger} style={{ marginTop: 4 }}>{text}</Txt> : null;
}
