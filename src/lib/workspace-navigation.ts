/** Presentation-only routing. Legacy URLs retain their original screens. */
export type MainModule = 'inicio' | 'movimentacoes' | 'cartoes' | 'patrimonio' | 'analises' | 'configuracoes';
export type DashboardView = 'full' | 'home' | 'analysis' | 'wealth' | 'economy' | 'confidence';
export type WorkspaceLocation = { module: MainModule; screen: string; tab: string; title: string; view: DashboardView; legacy: boolean };
export const moduleLinks = [
  { id:'inicio', label:'Início', href:'/' },
  { id:'movimentacoes', label:'Movimentações', href:'/movimentacoes' },
  { id:'cartoes', label:'Cartões', href:'/cartoes' },
  { id:'patrimonio', label:'Patrimônio', href:'/patrimonio' },
  { id:'analises', label:'Análises', href:'/analises' },
] as const;
export const moduleTabs: Record<MainModule, readonly {id:string;label:string;href:string}[]> = {
  inicio:[{id:'resumo',label:'Resumo',href:'/'},{id:'completo',label:'Dashboard completo',href:'/inicio/completo'}],
  movimentacoes:[{id:'todas',label:'Todas',href:'/movimentacoes'},{id:'recorrentes',label:'Recorrentes',href:'/movimentacoes/recorrentes'},{id:'programadas',label:'Programadas',href:'/movimentacoes/programadas'},{id:'compromissos',label:'Contas a pagar',href:'/movimentacoes/compromissos'},{id:'contas',label:'Contas e saldos',href:'/movimentacoes/contas'},{id:'planejamento',label:'Planejamento e metas',href:'/movimentacoes/planejamento'}],
  cartoes:[{id:'resumo',label:'Resumo',href:'/cartoes'},{id:'faturas',label:'Faturas',href:'/cartoes/faturas'},{id:'compras',label:'Compras',href:'/cartoes/compras'},{id:'parcelas',label:'Parcelas',href:'/cartoes/parcelas'}],
  patrimonio:[{id:'geral',label:'Visão geral',href:'/patrimonio'},{id:'caixinhas',label:'Caixinhas',href:'/patrimonio/caixinhas'},{id:'investimentos',label:'Investimentos',href:'/patrimonio/investimentos'}],
  analises:[{id:'graficos',label:'Gráficos e comparativos',href:'/analises'},{id:'relatorios',label:'Relatórios e exportação',href:'/analises/relatorios'},{id:'categorias',label:'Por categoria',href:'/analises/categorias'},{id:'economia',label:'Cenário econômico',href:'/analises/economia'},{id:'confiabilidade',label:'Confiabilidade',href:'/analises/confiabilidade'}],
  configuracoes:[{id:'preferencias',label:'Preferências e segurança',href:'/configuracoes'},{id:'categorias',label:'Categorias e subcategorias',href:'/configuracoes/categorias'},{id:'importacao',label:'Importar e conciliar arquivos',href:'/configuracoes/importacao'}],
};
export function workspaceLocation(section:string,detail?:string):WorkspaceLocation {
  if(section==='dashboard')return {module:'inicio',screen:'dashboard',tab:'completo',title:'Seu panorama financeiro',view:'full',legacy:true};
  const legacy: Record<string,[MainModule,string,string]>={contas:['movimentacoes','contas','Contas e Saldos'],transacoes:['movimentacoes','todas','Transações'],recorrentes:['movimentacoes','compromissos','Contas Recorrentes'],planejamento:['movimentacoes','planejamento','Planejamento'],categorias:['configuracoes','categorias','Categorias'],caixinhas:['patrimonio','caixinhas','Caixinhas'],investimentos:['patrimonio','investimentos','Investimentos'],relatorios:['analises','relatorios','Relatórios']};
  if(legacy[section]){const [module,tab,title]=legacy[section];return {module,tab,title,screen:section,view:'full',legacy:true};}
  let module:MainModule=moduleLinks.some(m=>m.id===section)?section as MainModule:section==='configuracoes'?'configuracoes':'inicio';
  const tab=moduleTabs[module].find(t=>t.id===detail)?.id??moduleTabs[module][0].id;
  const names:Record<MainModule,string>={inicio:'Seu panorama financeiro',movimentacoes:'Movimentações',cartoes:'Cartões',patrimonio:'Patrimônio',analises:'Análises',configuracoes:'Configurações'};
  let screen:string=module,view:DashboardView='full';
  if(module==='inicio'){screen='dashboard';view=tab==='completo'?'full':'home';}
  if(module==='movimentacoes') screen=({todas:'transacoes',recorrentes:'transacoes',programadas:'recorrentes',compromissos:'recorrentes',contas:'contas',planejamento:'planejamento'} as Record<string,string>)[tab];
  if(module==='patrimonio'){screen=tab==='geral'?'dashboard':tab;view='wealth';}
  if(module==='analises'){screen=tab==='relatorios'?'relatorios':tab==='categorias'?'category-report':'dashboard';view=tab==='economia'?'economy':tab==='confiabilidade'?'confidence':'analysis';}
  if(module==='configuracoes')screen=tab==='categorias'?'categorias':tab==='importacao'?'importacao':'configuracoes';
  return {module,tab,title:names[module],screen,view,legacy:false};
}
export const dashboardGroups:Record<DashboardView,readonly string[]>={
  full:['panorama','indicadores','planejamento','compromissos','analises','caixa','faturas','reservas','patrimonio','movimentacoes','economia','confiabilidade'],
  home:['panorama','indicadores','faturas','movimentacoes'],
  analysis:['analises','compromissos','caixa'],
  wealth:['patrimonio','reservas'],
  economy:['economia'],confidence:['confiabilidade'],
};
