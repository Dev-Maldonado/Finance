"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, LogOut, Menu, RefreshCw, Plus, X, type LucideIcon } from "lucide-react";
import { MainModuleLinks } from "./workspace-navigation";
import { usePwa } from "./pwa";
type NavItem = readonly [string, string, LucideIcon];
export function MobileNavigation({ items, current, email, refreshing, onRefresh, onLogout, onAdd, canAdd }: {
  items: readonly NavItem[]; current: string; email?: string; refreshing: boolean;
  canAdd:boolean; onAdd: () => void; onRefresh: () => void; onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const { installed, install } = usePwa();
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => {
    const query=matchMedia("(max-width:1023px), (hover:none) and (pointer:coarse)");
    const resize=()=>{ if(!query.matches) setOpen(false); };
    const close=()=>setOpen(false);
    query.addEventListener("change",resize);window.addEventListener("popstate",close);return ()=>{query.removeEventListener("change",resize);window.removeEventListener("popstate",close);};
  }, []);
  const href = (path: string) => path === "dashboard" ? "/" : `/${path}`;

  return <>
    <header className="mobile-app-header">
      <Link href="/" className="mobile-app-brand" aria-label="FINORA, início"><span>f</span><div>FINORA<small>{({inicio:"Início",movimentacoes:"Movimentações",cartoes:"Cartões",patrimonio:"Patrimônio",analises:"Análises",configuracoes:"Configurações"} as Record<string,string>)[current] || "Meu espaço"}</small></div></Link>
      <div className="mobile-header-actions"><button aria-label="Adicionar" disabled={!canAdd} onClick={onAdd}><Plus size={22}/></button><button aria-label="Atualizar dados" disabled={refreshing} onClick={onRefresh}><RefreshCw size={20} className={refreshing ? "mobile-refreshing" : ""} /></button><button aria-label="Abrir menu" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={23} /></button></div>
    </header>
    <nav className="mobile-bottom-nav" aria-label="Navegação rápida">
      <MainModuleLinks current={current} />
    </nav>
    <dialog ref={dialog} className="mobile-menu-sheet" aria-labelledby="mobile-menu-title" onCancel={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) setOpen(false); }}>
      <div className="mobile-sheet-grip" />
      <div className="mobile-sheet-heading"><div><small>SEU ESPAÇO FINANCEIRO</small><h2 id="mobile-menu-title">Todos os recursos</h2></div><button aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={22} /></button></div>
      <nav className="mobile-main-modules" aria-label="Módulos principais"><MainModuleLinks current={current} onNavigate={()=>setOpen(false)}/></nav><p className="mobile-resource-label">Atalhos e configurações</p>
      <nav aria-label="Todos os módulos" className="mobile-module-grid">{items.filter(([path])=>path!=="cartoes").map(([path, label, Icon]) => <Link href={href(path)} key={path} aria-current={current === path ? "page" : undefined} onClick={() => setOpen(false)}><Icon size={23} /><span>{label}{path === "caixinhas" && <small> Manual</small>}</span></Link>)}</nav>
      <div className="mobile-menu-account"><span>{email || "Minha conta"}</span><button onClick={() => { setOpen(false); void onLogout(); }}><LogOut size={18} /> Sair</button></div>
      {!installed && <button className="mobile-install-button" onClick={() => { setOpen(false); void install(); }}><Download size={20} /><span>Instalar aplicativo<small>FINORA na sua tela inicial</small></span></button>}
    </dialog>
  </>;
}
