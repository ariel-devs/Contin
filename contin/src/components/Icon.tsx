import type { ReactNode } from 'react'

export type IconName =
  | 'dashboard'
  | 'journal'
  | 'ledger'
  | 'balance'
  | 'vat'
  | 'closing'
  | 'accounts'
  | 'periods'
  | 'settings'
  | 'bell'
  | 'chevron'
  | 'menu'
  | 'plus'
  | 'arrow'
  | 'building'
  | 'calendar'
  | 'logout'
  | 'entry'
  | 'assets'
  | 'liabilities'
  | 'equity'
  | 'close'
  | 'search'
  | 'print'
  | 'trash'
  | 'check'
  | 'warning'

const iconPaths: Record<IconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  journal: <><path d="M7 3.5h11a2 2 0 0 1 2 2v15H7a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Z" /><path d="M4 17.5a3 3 0 0 1 3-3h13M9 8h7M9 11h7" /></>,
  ledger: <><path d="M4 5.5h16M4 10.5h16M4 15.5h16M4 20.5h16" /><path d="M7 3v19M17 3v19" /></>,
  balance: <><path d="M12 3v18M5 6h14M5 6l-3 6h6L5 6Zm14 0-3 6h6l-3-6ZM4 18h16M7 15h10" /></>,
  vat: <><path d="M5 4h14a2 2 0 0 1 2 2v14H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M7 8h10M7 12h3m4 0h3m-10 4h3m4 0h3" /></>,
  closing: <><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" /><path d="m15 16 2 2 3-4" /></>,
  accounts: <><path d="M4 5h16v15H4zM8 9h8M8 13h8M8 17h4" /><path d="M8 5V3m8 2V3" /></>,
  periods: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M8 14h3m2 0h3m-8 4h3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></>,
  chevron: <><path d="m7 10 5 5 5-5" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
  building: <><path d="M4 21V5l8-2v18M4 21h16V9l-8-2" /><path d="M8 7v.01M8 11v.01M8 15v.01M16 12v.01M16 16v.01M12 12v.01M12 16v.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  entry: <><path d="M4 5h16M4 10h16M4 15h10M4 20h8" /><circle cx="18" cy="17" r="3" /><path d="M18 15v4m-2-2h4" /></>,
  assets: <><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
  liabilities: <><path d="M5 7h14M5 12h14M5 17h14" /><path d="M8 4 5 7l3 3m8 4 3 3-3 3" /></>,
  equity: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0M12 12v6m-3-3h6" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  print: <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7zM17 11h.01" /></>,
  trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  warning: <><path d="m10.3 4.1-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-2.9l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  )
}
