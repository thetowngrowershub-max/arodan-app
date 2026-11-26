import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../../theme';

export type IconName =
  | 'home' | 'shop' | 'errand' | 'orders' | 'user' | 'back' | 'cart' | 'search' | 'plus' | 'minus'
  | 'shield' | 'pin' | 'key' | 'phone' | 'check' | 'clock' | 'close' | 'chevron' | 'bike' | 'star' | 'card' | 'bank' | 'cash' | 'trash'
  | 'box' | 'chart' | 'camera' | 'image' | 'edit' | 'store' | 'bell' | 'eye' | 'eyeOff';

const paths: Record<IconName, React.ReactNode> = {
  home: <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  shop: (
    <>
      <Rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <Rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <Rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <Rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </>
  ),
  errand: <Path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" />,
  orders: <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
  user: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  back: <Path d="M15 5 8 12l7 7" />,
  chevron: <Path d="m9 5 7 7-7 7" />,
  cart: (
    <>
      <Path d="M3 4h2l2.2 11h10.6L20 7H6.2" />
      <Circle cx="9" cy="19.5" r="1.5" />
      <Circle cx="17" cy="19.5" r="1.5" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      <Path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  shield: <Path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4" />,
  pin: (
    <>
      <Path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
      <Circle cx="12" cy="9" r="2.5" />
    </>
  ),
  key: (
    <>
      <Circle cx="8" cy="15" r="4" />
      <Path d="m11 12 9-9M17 6l3 3M15 8l2 2" />
    </>
  ),
  phone: <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  check: <Path d="m5 12 5 5 9-10" />,
  clock: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  bike: (
    <>
      <Circle cx="6" cy="16" r="3.5" />
      <Circle cx="18" cy="16" r="3.5" />
      <Path d="M6 16l4-7h5l3 7M10 9 8 6H6M15 9l-1-3h3" />
    </>
  ),
  star: <Path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  card: (
    <>
      <Rect x="3" y="5" width="18" height="14" rx="2.5" />
      <Path d="M3 10h18M7 15h4" />
    </>
  ),
  bank: <Path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  cash: (
    <>
      <Rect x="2.5" y="6" width="19" height="12" rx="2" />
      <Circle cx="12" cy="12" r="2.5" />
    </>
  ),
  trash: <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  box: <Path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9zM3.5 7.5 12 12l8.5-4.5M12 12v9" />,
  chart: <Path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  camera: (
    <>
      <Path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <Circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="4" width="18" height="16" rx="2.5" />
      <Circle cx="8.5" cy="9.5" r="1.8" />
      <Path d="m21 16-5-5-9 9" />
    </>
  ),
  edit: <Path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  store: <Path d="M4 10v10h16V10M3 10l1.5-6h15L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM10 20v-5h4v5" />,
  bell: <Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  eye: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: <Path d="M3 3l18 18M10.6 6A9.7 9.7 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8M6.5 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
};

export function Icon({ name, size = 22, color = colors.ink, fill = 'none', strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; fill?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </Svg>
  );
}
