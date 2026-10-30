import Link from 'next/link';
import { Settings } from 'lucide-react';
import { MainModuleLinks } from './workspace-navigation';
export function DesktopNavigation({ current, onNavigate }: { current:string; onNavigate:()=>void }) {
 return <nav className="desktop-navigation" aria-label="Navegação principal"><div className="sidebar-group" role="group" aria-label="Módulos principais"><MainModuleLinks current={current} onNavigate={onNavigate}/></div><div className="sidebar-settings"><Link href="/configuracoes" aria-label="Configurações" title="Configurações" className={current==='configuracoes'?'active':''} aria-current={current==='configuracoes'?'page':undefined} onClick={onNavigate}><Settings size={20}/><span>Configurações</span></Link></div></nav>;
}
