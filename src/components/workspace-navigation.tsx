"use client";
import Link from 'next/link';
import { LayoutDashboard, ArrowLeftRight, CreditCard, ChartNoAxesCombined, Wallet, Settings, ChevronRight } from 'lucide-react';
import { moduleLinks,moduleTabs,type WorkspaceLocation } from '@/lib/workspace-navigation';
export const moduleIcons={inicio:LayoutDashboard,movimentacoes:ArrowLeftRight,cartoes:CreditCard,patrimonio:Wallet,analises:ChartNoAxesCombined,configuracoes:Settings};
export function ModuleNavigation({location}:{location:WorkspaceLocation}) {
 return <section className={`module-navigation module-${location.module}`} aria-label={`Organização de ${location.title}`}>
  <nav className="module-tabs" aria-label="Seções do módulo">{moduleTabs[location.module].map(tab=><Link key={tab.id} href={tab.href} aria-current={location.tab===tab.id?'page':undefined}>{tab.label}</Link>)}</nav>
  <div className="module-context"><span>{({inicio:'Seu resumo e todos os detalhes, quando precisar.',movimentacoes:'Registre, confira e planeje suas entradas e saídas.',cartoes:'Compras pela data da compra; faturas e parcelas pelo vencimento.',patrimonio:'Caixinhas e investimentos mantêm operações e históricos próprios.',analises:'Os mesmos registros financeiros, vistos por período e categoria.',configuracoes:'Organização, preferências e segurança da sua conta.'})[location.module]}</span>{location.module==='inicio'&&location.view==='home'&&<Link href="/analises">Explorar análises <ChevronRight size={14}/></Link>}</div>
 </section>;
}
export function MainModuleLinks({current,onNavigate}:{current:string;onNavigate?:()=>void}) {
 return <>{moduleLinks.map(item=>{const Icon=moduleIcons[item.id];return <Link key={item.id} href={item.href} aria-label={item.label} title={item.label} aria-current={current===item.id?'page':undefined} className={current===item.id?'active':''} onClick={onNavigate}><Icon size={21}/><span>{item.label}</span></Link>;})}</>;
}
