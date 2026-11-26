export type Route =
  | { name: 'home' }
  | { name: 'reading'; id: string }
  | { name: 'profiles' }

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '')
  if (path === '' || path === '/') return { name: 'home' }
  if (path === '/profiles') return { name: 'profiles' }
  const match = path.match(/^\/r\/([\w-]+)$/)
  if (match) return { name: 'reading', id: match[1]! }
  return { name: 'home' }
}

export function navigate(to: string) {
  if (location.pathname === to) return
  history.pushState({}, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}
