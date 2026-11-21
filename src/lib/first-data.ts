// With real accounts a dashboard can show nothing until it has the person's data. This runs inline in <head>, so the
// request leaves while the app's code is still downloading instead of after all of it has arrived and started.
// lms-store.tsx picks the answer up (window.__firstData) for its first load; if it isn't there it asks as before.
export const FIRST_DATA = `if(/^\\/(student|teacher|institute|parent)(\\/|$)/.test(location.pathname))window.__firstData=fetch("/api/data?v=0",{cache:"no-store"}).catch(function(){})`;

declare global {
  interface Window {
    __firstData?: Promise<Response | void>;
  }
}
