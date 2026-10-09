"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const PwaContext = createContext({ installed: false, install: () => {} });
export const usePwa = () => useContext(PwaContext);
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [offline, setOffline] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [ios, setIos] = useState(false);
  const [reloadAvailable, setReloadAvailable] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const prompt = useRef<InstallEvent | null>(null);
  const reloadRequested = useRef(false);
  const instructionDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)");
    const checkInstalled = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    checkInstalled();
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const onInstall = (event: Event) => { event.preventDefault(); prompt.current = event as InstallEvent; };
    const onInstalled = () => { prompt.current = null; setInstalled(true); setInstructions(false); };
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    standalone.addEventListener("change", checkInstalled);
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let hadController = Boolean(navigator.serviceWorker?.controller);
    const controllerChange = () => {
      if (reloadRequested.current) location.reload();
      else if (hadController) { setWaiting(null); setReloadAvailable(true); }
      hadController = true;
    };
    const update = () => { if (document.visibilityState === "visible") void registration?.update().catch(() => {}); };
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(reg => {
        if (disposed) return;
        registration = reg;
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => { if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(reg.waiting); });
        });
      }).catch(() => {});
    }
    document.addEventListener("visibilitychange", update);
    const interval = setInterval(update, 60 * 60 * 1000);
    const viewport = window.visualViewport;
    let baselineHeight = viewport?.height || innerHeight;
    const resetViewport = () => { baselineHeight = viewport?.height || innerHeight; keyboard(); };
    const keyboard = () => {
      const editable = document.activeElement?.matches("input, textarea, select, [contenteditable=true]");
      if (!editable) baselineHeight = Math.max(baselineHeight, viewport?.height || innerHeight);
      const keyboardOpen = Boolean(editable && viewport && baselineHeight - viewport.height > 150);
      document.documentElement.dataset.keyboardOpen = String(keyboardOpen);
      document.documentElement.style.setProperty("--mobile-keyboard-inset", `${keyboardOpen && viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0}px`);
      document.documentElement.style.setProperty("--mobile-viewport-height", `${viewport?.height || innerHeight}px`);
    };
    window.addEventListener("orientationchange", resetViewport);
    viewport?.addEventListener("resize", keyboard);
    window.addEventListener("focusin", keyboard);
    window.addEventListener("focusout", keyboard);
    keyboard();
    return () => {
      disposed = true; clearInterval(interval);
      window.removeEventListener("beforeinstallprompt", onInstall); window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", connection); window.removeEventListener("offline", connection);
      standalone.removeEventListener("change", checkInstalled); document.removeEventListener("visibilitychange", update);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChange);
      window.removeEventListener("orientationchange", resetViewport);
      viewport?.removeEventListener("resize", keyboard); window.removeEventListener("focusin", keyboard); window.removeEventListener("focusout", keyboard);
    };
  }, []);
  useEffect(() => {
    if (instructions) instructionDialog.current?.showModal();
    else if (instructionDialog.current?.open) {
      instructionDialog.current.close();
      document.querySelector<HTMLButtonElement>('.mobile-header-actions button[aria-label="Abrir menu"]')?.focus();
    }
  }, [instructions]);
  const install = async () => {
    if (prompt.current) { await prompt.current.prompt(); await prompt.current.userChoice; prompt.current = null; }
    else setInstructions(true);
  };
  const applyUpdate = () => {
    if (document.querySelector("dialog[open]")) { window.alert("Conclua e feche o formulário antes de atualizar o aplicativo."); return; }
    if (!window.confirm("Atualizar o FINORA agora? A página será recarregada. Salve suas alterações antes de continuar.")) return;
    reloadRequested.current = true;
    if (reloadAvailable || !waiting || waiting.state === "redundant") location.reload();
    else waiting.postMessage({ type: "SKIP_WAITING" });
  };
  return <PwaContext.Provider value={{ installed, install }}>
    {children}
    <div className="mobile-app-notices" aria-live="polite">
      {offline && <div className="mobile-connection"><WifiOff size={18} /><span>Sem conexão. Reconecte para consultar e salvar seus dados.</span></div>}
      {(waiting || reloadAvailable) && <div className="mobile-update"><RefreshCw size={18} /><span>Nova versão disponível</span><button onClick={applyUpdate}>Atualizar</button></div>}
    </div>
    <dialog className="dialog pwa-install-dialog" ref={instructionDialog} onCancel={() => setInstructions(false)} aria-labelledby="install-title">
      <div className="dialog-head"><h2 id="install-title"><Download size={22} /> Instalar FINORA</h2><button className="icon-button" aria-label="Fechar instruções" onClick={() => setInstructions(false)}><X /></button></div>
      <p>Tenha seu espaço financeiro na tela inicial, com a mesma conta e todos os recursos.</p>
      {ios ? <ol><li>Abra este site no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong>.</li><li>Selecione <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.</li></ol> : <ol><li>Abra este site no <strong>Chrome</strong> ou navegador compatível.</li><li>No menu do navegador, selecione <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme a instalação.</li></ol>}
      <p className="muted">A instalação depende do navegador. Acesso aos seus dados requer conexão com a internet.</p>
      <button className="button primary" onClick={() => setInstructions(false)}>Entendi</button>
    </dialog>
  </PwaContext.Provider>;
}
