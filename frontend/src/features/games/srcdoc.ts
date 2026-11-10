// Обвязка вокруг кода игры. Игра идёт в iframe sandbox="allow-scripts" без allow-same-origin:
// у неё «пустое» происхождение, она не видит ни токен, ни куки, ни localStorage сайта.
// Сверху CSP без сети: игра не может ничего загрузить или отправить.
// Скрипт-перехватчик пересылает ошибки JS родителю, родитель — на сервер, их читает нейросеть.
// Всё в одну строку, чтобы номера строк в ошибках совпадали с кодом игры.

const CSP = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' blob: data:",
    "style-src 'unsafe-inline' blob: data:",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data: blob:',
    'worker-src blob: data:',
    'connect-src data: blob:',
].join('; ');

const HOOK = `(function(){
var send=function(m){try{parent.postMessage({__p1:'error',message:String(m).slice(0,1000)},'*')}catch(e){}};
window.addEventListener('error',function(e){if(!e.message)return;var s=e.message+(e.lineno?' (строка '+e.lineno+':'+e.colno+')':'');if(e.error&&e.error.stack)s+='\\n'+String(e.error.stack).split('\\n').slice(1,4).join('\\n');send(s)});
document.addEventListener('securitypolicyviolation',function(e){send('Заблокировано правилами сайта (сети нет): '+e.violatedDirective+' '+(e.blockedURI||''))});
window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('Unhandled rejection: '+(r&&r.stack?r.stack:r))});
var ce=console.error;console.error=function(){try{send('console.error: '+[].map.call(arguments,function(a){return a instanceof Error?(a.stack||a.message):typeof a==='object'?JSON.stringify(a):String(a)}).join(' '))}catch(e){}return ce.apply(console,arguments)};
function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(e2){}}});
window.alert=function(){};window.confirm=function(){return false};window.prompt=function(){return null};
})();`.replace(/\n/g, '');

const PRELUDE = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><script>${HOOK}</script>`;

/** Вставляет обвязку в начало <head> (или создаёт его), не трогая <!doctype>. */
export function buildSrcdoc(html: string): string {
    const head = /<head(\s[^>]*)?>/i.exec(html);
    if (head) return html.slice(0, head.index + head[0].length) + PRELUDE + html.slice(head.index + head[0].length);
    const root = /<html(\s[^>]*)?>/i.exec(html);
    if (root) return html.slice(0, root.index + root[0].length) + `<head>${PRELUDE}</head>` + html.slice(root.index + root[0].length);
    const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
    if (doctype) return doctype[0] + PRELUDE + html.slice(doctype[0].length);
    return PRELUDE + html;
}

export function isGameErrorMessage(data: unknown): data is { __p1: 'error'; message: string } {
    return typeof data === 'object' && data !== null && (data as { __p1?: unknown }).__p1 === 'error';
}
