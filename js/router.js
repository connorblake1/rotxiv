const routes = new Map();
let mount = null;

export function init(el) { mount = el; window.addEventListener('hashchange', resolve); }
export function register(path, fn) { routes.set(path, fn); }
export function go(path) { location.hash = path; }
export function current() {
  const h = location.hash.replace(/^#/, '') || '/feed';
  return h.split('?')[0];
}
export function resolve() {
  const path = current();
  const fn = routes.get(path) || routes.get('/feed');
  if (mount && fn) fn(mount);
}
