import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type NavItem = readonly [string, string, LucideIcon];
const groups = [
  { label: 'Seu dinheiro', paths: ['dashboard', 'contas', 'transacoes', 'cartoes', 'recorrentes'] },
  { label: 'Organização', paths: ['categorias', 'planejamento', 'relatorios'] },
  { label: 'Patrimônio', paths: ['caixinhas', 'investimentos'] },
];
export function DesktopNavigation({ items, current, collapsed, onNavigate }: {
  items: readonly NavItem[]; current: string; collapsed: boolean; onNavigate: () => void;
}) {
  const link = ([path, label, Icon]: NavItem) => <Link key={path} href={path === 'dashboard' ? '/' : `/${path}`} className={current === path ? 'active' : ''} aria-current={current === path ? 'page' : undefined} aria-label={label} title={label} onClick={onNavigate}>
    <Icon size={20} />{!collapsed && <span>{label}</span>}{!collapsed && path === 'caixinhas' && <small className="new">Manual</small>}
  </Link>;
  const assigned = new Set([...groups.flatMap(group => group.paths), 'configuracoes']);
  const extra = items.filter(([path]) => !assigned.has(path));
  return <nav className="desktop-navigation" aria-label="Navegação principal">
    {groups.map(group => <div className="sidebar-group" key={group.label} role="group" aria-label={group.label}>
      {!collapsed && <span className="sidebar-group-label">{group.label}</span>}
      {items.filter(([path]) => group.paths.includes(path)).map(link)}
    </div>)}
    {!!extra.length && <div className="sidebar-group" role="group" aria-label="Outros recursos">{extra.map(link)}</div>}
    <div className="sidebar-settings">{items.filter(([path]) => path === 'configuracoes').map(link)}</div>
  </nav>;
}
