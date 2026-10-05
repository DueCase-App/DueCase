export const ui = {
  colors: {
    background: '#EEF4FA',
    card: '#FFFFFF',
    primary: '#056FD2',
    primaryDark: '#0A3267',
    primarySoft: '#EAF3FC',
    orange: '#FF7A1A',
    input: '#E9F0F8',
    border: '#D7E3EF',
    text: '#0A3267',
    muted: '#6C84A2',
    success: '#159A68',
    successSoft: '#E7F7F0',
    danger: '#D9485F',
    dangerSoft: '#FDECEF',
    warning: '#C97916',
    warningSoft: '#FFF3E4',
  },
  radius: {
    sm: 10,
    md: 12,
    lg: 16,
    xl: 22,
  },
} as const;

export const cardShadow = {
  shadowColor: '#183B63',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;
