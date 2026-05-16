// Editorial off-white palette. Accent tuned to a deep dusk-purple for the
// "shutdown / end-of-day" mood — the rest matches adhd-tools so a future
// adhd-tools embed inherits cleanly.

export const theme = {
  bg: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F3F0',
  hover: '#F0EFEC',

  border: '#E4E2DD',
  borderHover: '#D0CDC6',
  borderActive: '#1A1A1A',

  text: '#1A1A1A',
  textBody: '#3D3D3D',
  textDim: '#6B6B6B',
  textFaint: '#9B9B9B',
  textInverse: '#FFFFFF',

  accent: '#5B4B8A',
  accentDim: 'rgba(91,75,138,0.08)',
  accentBorder: 'rgba(91,75,138,0.22)',

  green: '#16A34A',
  greenDim: 'rgba(22,163,74,0.06)',
  greenBorder: 'rgba(22,163,74,0.2)',

  amber: '#B45309',
  amberDim: 'rgba(180,83,9,0.06)',
  amberBorder: 'rgba(180,83,9,0.2)',

  red: '#DC2626',
  redDim: 'rgba(220,38,38,0.06)',
  redBorder: 'rgba(220,38,38,0.2)',

  purple: '#7C3AED',
  purpleDim: 'rgba(124,58,237,0.06)',
};

export const fonts = {
  body: "'DM Sans', 'Helvetica Neue', sans-serif",
  mono: "'DM Mono', 'Menlo', monospace",
};

export const fontImport = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');`;

export const keyframes = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeSlide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
`;

export const baseStyles = `
  ${fontImport}
  ${keyframes}
  * { box-sizing: border-box; margin: 0; }
  body { background: ${theme.bg}; color: ${theme.text}; font-family: ${fonts.body}; -webkit-font-smoothing: antialiased; }
  input:focus, textarea:focus { border-color: ${theme.accent} !important; box-shadow: 0 0 0 3px ${theme.accentDim}; outline: none; }
  ::selection { background: ${theme.accentDim}; color: ${theme.text}; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 3px; }
  a { text-decoration: none; color: inherit; }
`;
