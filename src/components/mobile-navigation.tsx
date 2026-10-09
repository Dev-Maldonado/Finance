"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, LogOut, Menu, RefreshCw, X, type LucideIcon } from "lucide-react";
import { usePwa } from "./pwa";
type NavItem = readonly [string, string, LucideIcon];
export function MobileNavigation({ items, current, email, refreshing, onRefresh, onLogout }: {
  items: readonly NavItem[]; current: string; email?: string; refreshing: boolean;
  onRefresh: () => void; onLogout: () => Promise<void>;
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
  const primary = ["dashboard", "transacoes", "cartoes", "caixinhas"].map(path => items.find(item => item[0] === path)!).filter(Boolean);
  const active = items.find(([path]) => path === current);
  return <>
    <header className="mobile-app-header">
      <Link href="/" className="mobile-app-brand" aria-label="FINORA, início"><span>f</span><div>FINORA<small>{active?.[1] || "Meu espaço"}</small></div></Link>
      <div className="mobile-header-actions"><button aria-label="Atualizar dados" disabled={refreshing} onClick={onRefresh}><RefreshCw size={20} className={refreshing ? "mobile-refreshing" : ""} /></button><button aria-label="Abrir menu" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={23} /></button></div>
    </header>
    <nav className="mobile-bottom-nav" aria-label="Navegação rápida">
      {primary.map(([path, label, Icon]) => <Link key={path} href={href(path)} aria-current={current === path ? "page" : undefined}><Icon size={22} /><span>{path === "dashboard" ? "Início" : label}</span></Link>)}
      <button onClick={() => setOpen(true)} aria-label="Mais opções" aria-haspopup="dialog" aria-expanded={open} className={!primary.some(([path]) => path === current) ? "active" : ""}><Menu size={22} /><span>Mais</span></button>
    </nav>
    <dialog ref={dialog} className="mobile-menu-sheet" aria-labelledby="mobile-menu-title" onCancel={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) setOpen(false); }}>
      <div className="mobile-sheet-grip" />
      <div className="mobile-sheet-heading"><div><small>SEU ESPAÇO FINANCEIRO</small><h2 id="mobile-menu-title">Todos os recursos</h2></div><button aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={22} /></button></div>
      <nav aria-label="Todos os módulos" className="mobile-module-grid">{items.map(([path, label, Icon]) => <Link href={href(path)} key={path} aria-current={current === path ? "page" : undefined} onClick={() => setOpen(false)}><Icon size={23} /><span>{label}{path === "caixinhas" && <small> Manual</small>}</span></Link>)}</nav>
      <div className="mobile-menu-account"><span>{email || "Minha conta"}</span><button onClick={() => { setOpen(false); void onLogout(); }}><LogOut size={18} /> Sair</button></div>
      {!installed && <button className="mobile-install-button" onClick={() => { setOpen(false); void install(); }}><Download size={20} /><span>Instalar aplicativo<small>FINORA na sua tela inicial</small></span></button>}
    </dialog>
  </>;
}
