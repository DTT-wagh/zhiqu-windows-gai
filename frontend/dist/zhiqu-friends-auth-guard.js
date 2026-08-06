(() => {
  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const FRIENDS_ROUTE = /^\/friends(?:\/add)?(?:\.html)?\/?$/;
  let redirecting = false;

  function isFriendsRoute() {
    return FRIENDS_ROUTE.test(location.pathname);
  }

  function hasSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return Boolean(value?.accessToken);
    } catch {
      return false;
    }
  }

  function guard() {
    if (!isFriendsRoute() || redirecting || hasSession()) return;
    redirecting = true;
    const next = `${location.pathname}${location.search}`;
    location.replace(`/login?next=${encodeURIComponent(next)}`);
  }

  function scheduleGuard() {
    window.setTimeout(guard, 250);
  }

  window.addEventListener('popstate', scheduleGuard);
  window.addEventListener('zqroutechange', scheduleGuard);
  scheduleGuard();
})();
