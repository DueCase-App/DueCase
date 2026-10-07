export function italianDate(value:string|null|undefined):string {
 if(!value)return 'Data non disponibile';
 const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(value);
 return match?`${match[3]}/${match[2]}/${match[1]}`:'Data non disponibile';
}
export function italianCategory(value:string):string {
 const labels:Record<string,string>={school:'Scuola',health:'Salute',sport:'Sport',leisure:'Svago',other:'Altro',calendar:'Calendario',holidays:'Vacanze',organization:'Organizzazione',medical:'Visite mediche',legal:'Legale'};
 return labels[value]??value;
}
