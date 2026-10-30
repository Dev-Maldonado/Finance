"use client";
import { useEffect,useRef } from 'react';
import Link from 'next/link';
import { ArrowDownLeft,ArrowUpRight,ArrowLeftRight,CreditCard,Repeat2,CalendarDays,PiggyBank,Wallet,Target,Tags,ChartNoAxesCombined,X,ChevronRight } from 'lucide-react';
const groups=[
 {title:'Dia a dia',items:[{key:'income',label:'Receita',detail:'Recebida ou prevista',Icon:ArrowDownLeft},{key:'expense',label:'Despesa',detail:'Paga ou pendente',Icon:ArrowUpRight},{key:'transfer',label:'Transferência',detail:'Entre suas contas',Icon:ArrowLeftRight}]},
 {title:'Compromissos',items:[{key:'purchase',label:'Compra no cartão',detail:'À vista ou parcelada',Icon:CreditCard},{key:'recurring',label:'Gasto ou receita recorrente',detail:'Semanal, mensal ou anual',Icon:Repeat2},{key:'obligation',label:'Compromisso programado',detail:'Vencimento e pagamento separados',Icon:CalendarDays}]},
 {title:'Organização e patrimônio',items:[{key:'account',label:'Conta',detail:'Banco ou dinheiro em espécie',Icon:Wallet},{key:'card',label:'Cartão',detail:'Limite, fechamento e vencimento',Icon:CreditCard},{key:'goal',label:'Caixinha',detail:'Meta e saldo inicial',Icon:PiggyBank},{key:'budget',label:'Orçamento',detail:'Limite por categoria',Icon:Target},{key:'financialGoal',label:'Meta financeira',detail:'Planeje uma conquista',Icon:Target},{key:'category',label:'Categoria ou subcategoria',detail:'Organize seus lançamentos',Icon:Tags}]},
];
export function GlobalAdd({onClose,onAdd}:{onClose:()=>void;onAdd:(key:string)=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="dialog global-add-dialog" aria-labelledby="global-add-title" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="dialog-head"><div><span className="eyebrow">TUDO NO LUGAR CERTO</span><h2 id="global-add-title">O que deseja adicionar?</h2></div><button className="icon-button" aria-label="Fechar adicionar" onClick={onClose}><X size={21}/></button></div><p className="global-add-intro">Escolha o registro. Você poderá revisar todos os dados antes de salvar.</p>{groups.map(group=><section key={group.title}><h3>{group.title}</h3><div className="global-add-grid">{group.items.map(({key,label,detail,Icon})=><button key={key} onClick={()=>{onClose();onAdd(key);}}><Icon size={20}/><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={15}/></button>)}</div></section>)}<Link className="global-add-investment" href="/patrimonio/investimentos?adicionar=1" onClick={onClose}><ChartNoAxesCombined size={20}/><span><strong>Investimento</strong><small>Fundo ou criptomoeda · controle manual</small></span><ChevronRight size={16}/></Link></dialog>;
}
